use datex_core::{
    channel::mpsc::{UnboundedSender, create_unbounded_channel},
    network::{
        com_interfaces::com_interface::{
            properties::{ComInterfaceProperties, InterfaceDirection},
            socket::ComInterfaceSocketUUID,
        },
    },
    values::{
        core_values::endpoint::Endpoint,
    },
};
use js_sys::{Uint8Array};
use std::{
    cell::RefCell,
    collections::HashMap,
    rc::Rc,
    str::FromStr,
};
use datex_core::channel::mpsc::UnboundedReceiver;
use datex_core::network::com_interfaces::com_interface::factory::{ComInterfaceConfiguration, SendCallback, SendFailure, SendSuccess, SocketConfiguration, SocketProperties};
use wasm_bindgen::{JsError, JsValue, prelude::wasm_bindgen};

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

pub struct CreateSocketData {
    socket_properties: SocketProperties,
    data_receiver: UnboundedReceiver<Vec<u8>>,
}

pub enum BaseInterfaceSocketEvent {
    CreateSocket(CreateSocketData),
    RemoveSocket(ComInterfaceSocketUUID),
}

#[wasm_bindgen]
pub struct BaseInterfacePublicHandle {
    socket_data_senders: HashMap<ComInterfaceSocketUUID, UnboundedSender<Vec<u8>>>,
    socket_create_sender: UnboundedSender<CreateSocketData>,
    callbacks: Rc<RefCell<BaseInterfaceCallbacks>>,
}

pub struct BaseInterfacePrivateHandle {
    socket_create_receiver: UnboundedReceiver<CreateSocketData>,
    callbacks: Rc<RefCell<BaseInterfaceCallbacks>>,
}

pub fn create_base_interface_handles() -> (BaseInterfacePublicHandle, BaseInterfacePrivateHandle) {
    let (socket_create_sender, socket_create_receiver) =
        create_unbounded_channel::<CreateSocketData>();

    let callbacks = Rc::new(RefCell::new(BaseInterfaceCallbacks::default()));

    let public_handle = BaseInterfacePublicHandle {
        socket_data_senders: HashMap::new(),
        socket_create_sender,
        callbacks: callbacks.clone(),
    };
    let private_handle = BaseInterfacePrivateHandle {
        socket_create_receiver,
        callbacks,
    };
    
    (public_handle, private_handle)
}


impl BaseInterfacePrivateHandle {
    pub fn create_interface(
        mut self,
        properties: ComInterfaceProperties,
    ) -> ComInterfaceConfiguration {
        ComInterfaceConfiguration::new(
            properties,
            async gen move {
                while let Some(data) = self.socket_create_receiver.next().await {
                    let uuid = data.socket_properties.uuid();
                    let uuid_string = uuid.to_string();
                    let uuid_string_clone = uuid_string.clone();

                    let callbacks = self.callbacks.clone();
                    let callbacks_2 = self.callbacks.clone();

                    yield Ok(SocketConfiguration::new_in_out(
                        data.socket_properties,
                        async gen move {
                            let mut data_receiver = data.data_receiver;
                            while let Some(data) = data_receiver.next().await {
                                yield Ok(data);
                            }

                            // Data receiver stream ended, socket is closed
                            if let Some(ref cb) = callbacks_2.borrow().on_closed {
                                let _ = cb.call1(
                                    &JsValue::NULL,
                                    &JsValue::from_str(uuid_string.as_str()),
                                );
                            }
                        },
                        SendCallback::new_sync(move |block| {
                            match callbacks.borrow().on_receive {
                                Some(ref cb) => {
                                    let _ = cb.call2(
                                        &JsValue::NULL,
                                        &JsValue::from_str(uuid_string_clone.as_str()),
                                        &Uint8Array::from(block.to_bytes().as_slice()).into(),
                                    );
                                    Ok(SendSuccess::Sent)
                                }
                                None => Err(SendFailure(Box::new(block))),
                            }
                        })
                    ))
                }
            }
        )
    }
}

#[wasm_bindgen]
impl BaseInterfacePublicHandle {
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
        self.socket_data_senders
            .get_mut(&socket_uuid)
            .ok_or(JsBaseInterfaceError::SocketNotFound)?
            .start_send(buf)
            .unwrap();
        Ok(())
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

        let (data_sender, data_receiver) = create_unbounded_channel::<Vec<u8>>();
        self.socket_data_senders.insert(socket_properties.uuid(), data_sender);

        let uuid = socket_properties.uuid();

        self.socket_create_sender
            .start_send(CreateSocketData {
                socket_properties,
                data_receiver,
            })
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

        // Remove the sender for the socket and close its channel to signal the socket task to shut down
        self.socket_data_senders
            .remove(&socket_uuid)
            .ok_or(JsBaseInterfaceError::SocketNotFound)?
            .close_channel();
        
        Ok(())
    }

    pub fn destroy(&mut self) {
        for sender in self.socket_data_senders.values_mut() {
            sender.close_channel();
        }
        self.socket_data_senders.clear();
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