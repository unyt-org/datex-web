use datex_core::{
    channel::mpsc::{UnboundedSender, create_unbounded_channel},
    network::{
        com_hub::{
            InterfacePriority, SocketData, errors::ComInterfaceCreateError, managers::socket_manager::ComInterfaceSocketManager
        },
        com_interfaces::com_interface::{
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
use std::{
    cell::RefCell,
    collections::HashMap,
    rc::Rc,
    str::FromStr,
};
use datex_core::network::com_interfaces::com_interface::factory::{ComInterfaceConfiguration, SocketConfiguration, SocketProperties};
use wasm_bindgen::{JsCast, JsError, JsValue, prelude::wasm_bindgen};

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

pub enum BaseInterfaceIncomingDataEvent {
    ReceiveBlock(ComInterfaceSocketUUID, Vec<u8>),
}

pub struct CreateSocketData {
    socket_properties: SocketProperties,
}

pub enum BaseInterfaceSocketEvent {
    CreateSocket(CreateSocketData),
    RemoveSocket(ComInterfaceSocketUUID),
}

#[wasm_bindgen]
pub struct BaseInterfaceHandle {
    sockets: HashMap<ComInterfaceSocketUUID, UnboundedSender<Vec<u8>>>,
    incoming_data_sender: UnboundedSender<BaseInterfaceIncomingDataEvent>,
    socket_event_sender: UnboundedSender<BaseInterfaceSocketEvent>,
    callbacks: Rc<RefCell<BaseInterfaceCallbacks>>,
}

impl BaseInterfaceHandle {
    pub async fn create_interface(
        properties: ComInterfaceProperties,
    ) -> (BaseInterfaceHandle, ComInterfaceConfiguration) {
        let sockets = HashMap::new();
        
        let (socket_event_sender, mut socket_event_receiver) =
            create_unbounded_channel::<BaseInterfaceSocketEvent>();

        let handle = BaseInterfaceHandle {
            socket_event_sender,
            sockets,
            callbacks: Rc::new(RefCell::new(BaseInterfaceCallbacks::default())),
        };

        let configuration = ComInterfaceConfiguration::new(
            properties,
            async gen move {
                while let Some(socket_event) = socket_event_receiver.next().await {
                    match socket_event {
                        BaseInterfaceSocketEvent::CreateSocket(data) => {
                            yield Ok(SocketConfiguration::new_combined(
                                data.socket_properties,
                                |receiver| async gen move {
                                    // TODO
                                }
                            ))
                        }
                        _ => todo!()
                    }
                }
            }
        );

        // let task_handle = handle.callbacks.clone();
        // use futures::{StreamExt, select};
        // wasm_bindgen_futures::spawn_local(async move {
        //     let mut hub_rx = proxy.event_receiver;
        //     loop {
        //         select! {
        //             // Event from ComHub side
        //             com_hub_event = hub_rx.next().fuse() => {
        //                 match com_hub_event {
        //                     Some(ComInterfaceEvent::SendBlock(block, socket_uuid)) => {
        //                         let bytes = block.to_bytes();
        //                         if let Some(cb) = task_handle.borrow().on_receive.as_ref() {
        //                             let _ = cb.call2(
        //                                 &JsValue::NULL,
        //                                 &JsValue::from_str(socket_uuid.to_string().as_str()),
        //                                 &Uint8Array::from(bytes.as_slice()).into(),
        //                             );
        //                         }
        //
        //                     }
        //                     Some(ComInterfaceEvent::Destroy) => {
        //                         if let Some(cb) = task_handle.borrow().on_closed.as_ref() {
        //                             let _ = cb.call0(&JsValue::NULL);
        //                         }
        //                         break;
        //                     }
        //                     Some(other) => {
        //                         todo!("Handle other events: {:?}", other);
        //                     }
        //                     None => break,
        //                 }
        //             }
        //         }
        //     }
        // });

        (handle, configuration)
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
        self.sockets
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
        let socket_properties = SocketProperties::new_with_maybe_direct_endpoint(
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
                .as_ref()
                .map(|ep_str| {
                    Endpoint::try_from(ep_str.as_str()).map_err(|_| {
                        JsBaseInterfaceError::SetupDataParseError
                    })
                })
                .transpose()?,
        );

        let uuid = socket_properties.uuid();

        self.socket_event_sender
            .start_send(BaseInterfaceSocketEvent::CreateSocket(CreateSocketData {
                socket_properties,
            }))
            .unwrap();

        Ok(uuid.to_string())
    }

    #[wasm_bindgen(js_name = "removeSocket")]
    pub fn remove_socket(
        &mut self,
        socket_uuid: String,
    ) -> Result<(), JsBaseInterfaceError> {
        let socket_uuid = ComInterfaceSocketUUID::try_from(socket_uuid)
            .map_err(|_| JsBaseInterfaceError::InvalidSocketUUID)?;
        if !self.sockets.contains_key(&socket_uuid) {
            return Err(JsBaseInterfaceError::SocketNotFound);
        }

        self.sockets.remove(&socket_uuid);
        self.socket_event_sender
            .start_send(BaseInterfaceSocketEvent::RemoveSocket(socket_uuid))
            .unwrap();
        Ok(())
    }

    pub fn destroy(&mut self) {
        self.incoming_data_sender.close_channel();
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