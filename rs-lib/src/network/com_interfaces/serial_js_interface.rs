use datex::network::com_hub::{
    errors::InterfaceCreateError,
    managers::interfaces_manager::ComInterfaceAsyncFactoryResult,
};
use serde::{Deserialize, Serialize};
use std::{ops::Deref, time::Duration};

use datex::network::com_interfaces::{
    com_interface::{
        ComInterfaceEvent, ComInterfaceProxy,
        error::ComInterfaceError,
        factory::{ComInterfaceAsyncFactory, ComInterfaceSyncFactory},
        properties::{InterfaceDirection, InterfaceProperties},
    },
    default_com_interfaces::serial::serial_common::{
        SerialError, SerialInterfaceSetupData,
    },
};

use crate::wrap_error_for_js;
use log::{debug, error};
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    ReadableStreamDefaultReader, SerialOptions, SerialPort, js_sys,
    js_sys::Uint8Array,
};

wrap_error_for_js!(JsSerialError, datex::network::com_interfaces::default_com_interfaces::serial::serial_common::SerialError);

#[derive(tsify::Tsify, Serialize, Deserialize)]
pub struct SerialInterfaceSetupDataJS(pub SerialInterfaceSetupData);
impl Deref for SerialInterfaceSetupDataJS {
    type Target = SerialInterfaceSetupData;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl SerialInterfaceSetupDataJS {
    async fn create_interface(
        &self,
        mut com_interface_proxy: ComInterfaceProxy,
    ) -> Result<InterfaceProperties, InterfaceCreateError> {
        let window = web_sys::window()
            .ok_or(SerialError::Other("Unsupported platform".to_string()))
            .map_err(|e| {
                InterfaceCreateError::InterfaceError(
                    ComInterfaceError::connection_error_with_details(e),
                )
            })?;
        let navigator = window.navigator();
        let serial = navigator.serial();

        let port_promise = serial.request_port();
        let port_js = JsFuture::from(port_promise)
            .await
            .map_err(|_| SerialError::PermissionError)
            .map_err(|e| {
                InterfaceCreateError::InterfaceError(
                    ComInterfaceError::connection_error_with_details(e),
                )
            })?;
        let port: SerialPort = port_js.into();

        JsFuture::from(port.open(&SerialOptions::new(self.baud_rate)))
            .await
            .map_err(|_| SerialError::PortNotFound)
            .map_err(|e| {
                InterfaceCreateError::InterfaceError(
                    ComInterfaceError::connection_error_with_details(e),
                )
            })?;

        let readable = port.readable();
        let reader = readable
            .get_reader()
            .dyn_into::<ReadableStreamDefaultReader>()
            .unwrap();
        let writable = port.writable();
        let writer = writable.get_writer().unwrap();

        // create new socket
        let (socket_uuid, mut sender) = com_interface_proxy
            .create_and_init_socket(InterfaceDirection::InOut, 1);

        // handle incoming data
        spawn_with_panic_notify_default(async move {
            loop {
                let result = JsFuture::from(reader.read()).await;
                match result {
                    Ok(value) => {
                        let value = value.dyn_into::<js_sys::Object>().unwrap();
                        let done = js_sys::Reflect::get(&value, &"done".into())
                            .unwrap()
                            .as_bool()
                            .unwrap_or(false);
                        if done {
                            break;
                        }
                        let value =
                            js_sys::Reflect::get(&value, &"value".into())
                                .unwrap();
                        if value.is_instance_of::<Uint8Array>() {
                            let bytes = value
                                .dyn_into::<Uint8Array>()
                                .unwrap()
                                .to_vec();
                            println!("Received bytes: {bytes:?}");
                            sender.start_send(bytes).unwrap();
                        }
                    }
                    Err(_) => {
                        error!("Error reading from serial port");
                        break;
                    }
                }
            }
            reader.release_lock();
        });

        // handle outgoing data
        spawn_with_panic_notify_default(async move {
            while let Some(event) =
                com_interface_proxy.event_receiver.next().await
            {
                match event {
                    ComInterfaceEvent::SendBlock(block, _) => {
                        let js_array =
                            Uint8Array::from(block.to_bytes().as_slice());
                        let promise = writer.write_with_chunk(&js_array);
                        debug!("Sending block: {block:?}");
                        JsFuture::from(promise).await.unwrap();
                    }
                    ComInterfaceEvent::Destroy => {
                        JsFuture::from(port.close()).await.unwrap();
                    }
                    _ => todo!(),
                }
            }
        });

        Ok(InterfaceProperties {
            created_sockets: Some(vec![socket_uuid]),
            ..InterfaceProperties::default()
        })
    }
}

impl ComInterfaceAsyncFactory for SerialInterfaceSetupDataJS {
    fn create_interface(
        self,
        com_interface_proxy: ComInterfaceProxy,
    ) -> ComInterfaceAsyncFactoryResult {
        Box::pin(
            async move { self.create_interface(com_interface_proxy).await },
        )
    }

    fn get_default_properties() -> InterfaceProperties {
        InterfaceProperties {
            interface_type: "serial".to_string(),
            channel: "serial".to_string(),
            round_trip_time: Duration::from_millis(40),
            max_bandwidth: 100,
            ..InterfaceProperties::default()
        }
    }
}
