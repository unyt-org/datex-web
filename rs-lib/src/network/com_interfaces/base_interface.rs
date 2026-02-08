use crate::network::com_hub::JSComHub;
use datex_core::{
    channel::mpsc::{UnboundedSender, create_unbounded_channel},
    global::dxb_block::DXBBlock,
    network::{
        com_hub::{
            InterfacePriority, SocketData, errors::ComInterfaceCreateError, managers::socket_manager::ComInterfaceSocketManager
        },
        com_interfaces::com_interface::{
            ComInterfaceUUID,
            factory::ComInterfaceSyncFactory,
            properties::{ComInterfaceProperties, InterfaceDirection},
            socket::ComInterfaceSocketUUID,
        },
    },
    serde::deserializer::from_value_container,
    values::{
        core_values::endpoint::Endpoint, value_container::ValueContainer,
    },
};
use futures::FutureExt;
use js_sys::{Function, Reflect, Uint8Array};
use serde::{Deserialize, Serialize};
use std::{
    cell::RefCell,
    collections::HashMap,
    rc::Rc,
    str::FromStr,
    sync::{Arc, Mutex},
    time::Duration,
};
use wasm_bindgen::{JsCast, JsError, JsValue, prelude::wasm_bindgen};
use web_sys::js_sys::Promise;

pub enum JsBaseInterfaceError {
    InvalidInput(String),
    SocketNotFound,
    InvalidSocketUUID,
    SetupDataParseError,
}

impl From<JsBaseInterfaceError> for JsValue {
    fn from(err: JsBaseInterfaceError) -> JsValue {
        match err {
            JsBaseInterfaceError::InvalidInput(msg) => {
                JsError::new(&msg).into()
            }
            JsBaseInterfaceError::SetupDataParseError => {
                JsError::new("Failed to parse setup data").into()
            }
            JsBaseInterfaceError::SocketNotFound => {
                JsError::new("Socket not found").into()
            }
            JsBaseInterfaceError::InvalidSocketUUID => {
                JsError::new("Invalid Socket UUID").into()
            }
        }
    }
}

#[derive(Default)]
struct BaseInterfaceCallbacks {
    on_receive: Option<js_sys::Function>,
    on_closed: Option<js_sys::Function>,
}

pub enum BaseInterfaceEvent {
    ReceiveBlock(ComInterfaceSocketUUID, Vec<u8>),
}

#[wasm_bindgen]
pub struct BaseInterfaceHandle {
    sender_map: HashMap<ComInterfaceSocketUUID, UnboundedSender<Vec<u8>>>,
    tx: UnboundedSender<BaseInterfaceEvent>,
    socket_manager: Arc<Mutex<ComInterfaceSocketManager>>,
    callbacks: Rc<RefCell<BaseInterfaceCallbacks>>,
}

impl BaseInterfaceHandle {
    pub async fn create_interface(
        proxy: ComInterfaceProxy,
    ) -> BaseInterfaceHandle {
        let interface_uuid = proxy.uuid;
        let sender_map = HashMap::new();

        // intercept events from wrapper and forward to interface
        let (js_event_tx, mut js_event_rx) =
            create_unbounded_channel::<BaseInterfaceEvent>();
        let socket_manager = proxy.socket_manager.clone();
        let handle = BaseInterfaceHandle {
            tx: js_event_tx,
            sender_map,
            socket_manager: socket_manager.clone(),
            callbacks: Rc::new(RefCell::new(BaseInterfaceCallbacks::default())),
        };
        let task_handle = handle.callbacks.clone();
        use futures::{StreamExt, select};
        wasm_bindgen_futures::spawn_local(async move {
            let mut hub_rx = proxy.event_receiver;
            loop {
                select! {
                    // Event from ComHub side
                    com_hub_event = hub_rx.next().fuse() => {
                        match com_hub_event {
                            Some(ComInterfaceEvent::SendBlock(block, socket_uuid)) => {
                                let bytes = block.to_bytes();
                                if let Some(cb) = task_handle.borrow().on_receive.as_ref() {
                                    let _ = cb.call2(
                                        &JsValue::NULL,
                                        &JsValue::from_str(socket_uuid.to_string().as_str()),
                                        &Uint8Array::from(bytes.as_slice()).into(),
                                    );
                                }

                            }
                            Some(ComInterfaceEvent::Destroy) => {
                                if let Some(cb) = task_handle.borrow().on_closed.as_ref() {
                                    let _ = cb.call0(&JsValue::NULL);
                                }
                                break;
                            }
                            Some(other) => {
                                todo!("Handle other events: {:?}", other);
                            }
                            None => break,
                        }
                    }
                }
            }
        });

        handle
    }
}

#[wasm_bindgen]
impl BaseInterfaceHandle {
    #[wasm_bindgen(js_name = "sendBlock")]
    pub fn send_block(
        &mut self,
        socket_uuid: String,
        data: Uint8Array,
    ) -> Result<(), JsBaseInterfaceError> {
        let mut buf = vec![0u8; data.length() as usize];
        data.copy_to(&mut buf);
        let socket_uuid = ComInterfaceSocketUUID::try_from(socket_uuid)
            .map_err(|_| JsBaseInterfaceError::InvalidSocketUUID)?;
        self.sender_map
            .get_mut(&socket_uuid)
            .map(|tx| {
                tx.start_send(buf).expect("Failed to send data to socket");
            })
            .ok_or(JsBaseInterfaceError::SocketNotFound)
    }

    #[wasm_bindgen(js_name = "registerSocket")]
    pub fn register_socket(
        &mut self,
        direction: String,
        channel_factor: u32,
        direct_endpoint: Option<String>,
    ) -> Result<String, JsBaseInterfaceError> {
        let (uuid, sender) =
            self.socket_manager.lock().unwrap().register_socket(
                SocketData {}
                InterfaceDirection::from_str(&direction.as_str()).map_err(
                    |_| {
                        JsBaseInterfaceError::InvalidInput(format!(
                            "Invalid interface direction: {}",
                            direction
                        ))
                    },
                )?,
                channel_factor,
                direct_endpoint
                    .map(|ep_str| {
                        Endpoint::try_from(ep_str).map_err(|_| {
                            JsBaseInterfaceError::SetupDataParseError
                        })
                    })
                    .transpose()?,
            );
        self.sender_map.insert(uuid.clone(), sender);
        Ok(uuid.to_string())
    }

    #[wasm_bindgen(js_name = "removeSocket")]
    pub fn remove_socket(
        &mut self,
        socket_uuid: String,
    ) -> Result<(), JsBaseInterfaceError> {
        let socket_uuid = ComInterfaceSocketUUID::try_from(socket_uuid)
            .map_err(|_| JsBaseInterfaceError::InvalidSocketUUID)?;
        if !self.sender_map.contains_key(&socket_uuid) {
            return Err(JsBaseInterfaceError::SocketNotFound);
        }

        self.sender_map.remove(&socket_uuid);
        self.socket_manager
            .lock()
            .unwrap()
            .delete_socket(&socket_uuid);
        Ok(())
    }

    pub fn destroy(&mut self) {
        self.tx.close_channel();
    }

    #[wasm_bindgen(js_name = "onReceive")]
    pub fn set_on_receive(&self, cb: js_sys::Function) {
        self.callbacks.borrow_mut().on_receive.replace(cb);
    }

    #[wasm_bindgen(js_name = "onClosed")]
    pub fn set_on_closed(&self, cb: js_sys::Function) {
        self.callbacks.borrow_mut().on_closed.replace(cb);
    }
}

#[wasm_bindgen]
impl JSComHub {}
