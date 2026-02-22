use datex_core::{
    dif::value::{DIFValue, DIFValueContainer},
    global::dxb_block::DXBBlock,
    network::{
        com_hub::{
            ComHub, InterfacePriority,
            errors::ComInterfaceCreateError,
            managers::com_interface_manager::{
                AsyncComInterfaceImplementationFactoryFn,
                ComInterfaceAsyncFactoryResult,
            },
        },
        com_interfaces::com_interface::{
            ComInterfaceUUID, factory::ComInterfaceConfiguration,
            properties::ComInterfaceProperties, socket::ComInterfaceSocketUUID,
        },
    },
    runtime::Runtime,
    serde::{
        deserializer::from_value_container, serializer::to_value_container,
    },
    utils::uuid::UUID,
    values::{
        core_values::endpoint::Endpoint, value_container::ValueContainer,
    },
};
use log::{error, info};
use serde_wasm_bindgen::from_value;
use std::{collections::HashMap, rc::Rc, str::FromStr};
use std::future::AsyncDrop;
use std::ops::Deref;
use std::pin::Pin;
use datex_core::network::com_interfaces::com_interface::factory::{NewSocketsIterator, SocketProperties};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::{future_to_promise, JsFuture};
use web_sys::js_sys::{self};
use js_sys::{Object, Promise, Reflect};

use crate::{
    js_utils::{
        cast_from_dif_js_value, dif_js_value_to_value_container,
        value_container_to_dif_js_value,
    },
    network::com_interfaces::base_interface::{
        BaseInterfacePublicHandle, create_base_interface_handles,
    },
};
use crate::js_utils::to_js_value;

#[wasm_bindgen]
#[derive(Clone)]
pub struct JSComHub {
    // ignore for wasm bindgen
    pub(crate) runtime: Runtime,
}

// wrapper around AsyncGenerator that implements Drop
#[derive(Debug)]
pub struct JSAsyncGenerator(pub js_sys::AsyncGenerator);
impl Deref for JSAsyncGenerator {
    type Target = js_sys::AsyncGenerator;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Drop for JSAsyncGenerator {
    fn drop(&mut self) { }
}

impl AsyncDrop for JSAsyncGenerator {
    async fn drop(self: Pin<&mut Self>) {
        info!("ASYNC DROP!!!");
        match self.0.return_(&JsValue::UNDEFINED) {
            Ok(promise) => {
                if let Err(e) = JsFuture::from(promise).await {
                    error!("Error awaiting async generator return promise: {:?}", e);
                }
            }
            Err(e) => {
                error!("Error calling async generator return: {:?}", e);
            }
        }
    }
}

/**
 * Internal impl of the JSRuntime, not exposed to JavaScript
 */
impl JSComHub {
    pub fn new(runtime: Runtime) -> JSComHub {
        let com_hub = JSComHub {
            runtime,
        };
        com_hub.register_default_interface_factories();
        com_hub
    }

    pub fn com_hub(&self) -> Rc<ComHub> {
        self.runtime.com_hub()
    }

    pub(crate) async fn create_interface_internal(
        &self,
        interface_type: String,
        setup_data: ValueContainer,
        priority: Option<u16>,
    ) -> Result<ComInterfaceUUID, ComInterfaceCreateError> {
        let runtime = self.runtime.clone();
        let com_hub = runtime.com_hub();
        let (interface, ready_receiver) = com_hub
            .create_interface(
                &interface_type,
                setup_data,
                InterfacePriority::from(priority),
            )
            .await?;
        if let Some(ready_receiver) = ready_receiver {
            let _ = ready_receiver.await;
        }
        Ok(interface)
    }

    // NOTE: must be separate internal funciton since async gen block does not work in combination with
    // wasm_bindgen macro
    fn register_interface_factory_internal(
        &self,
        interface_type: String,
        factory: js_sys::Function,
    ) {
        let runtime = self.runtime.clone();
        self.com_hub().register_dyn_interface_factory(
            interface_type,
            Rc::new(move |setup_data| {
                let factory = factory.clone();
                let runtime = runtime.clone();

                Box::pin(async move {
                    let interface_configuration_promise = factory
                        .call1(
                            &JsValue::UNDEFINED,
                            &value_container_to_dif_js_value(
                                &setup_data,
                                runtime.memory(),
                            ),
                        )
                        .map_err(|e| {
                            error!("Error calling interface factory: {:?}", e);
                            ComInterfaceCreateError::connection_error_with_details(
                                e.as_string().unwrap_or_default()
                            )
                        })?
                        .unchecked_into::<Promise>();

                    let interface_configuration = JsFuture::from(
                        interface_configuration_promise,
                    )
                        .await
                        .expect("Failed to get value from promise");

                    let (properties, has_single_socket, new_sockets_generator) = JSComHub::parse_com_interface_configuration(&interface_configuration)
                        .map_err(|e| {
                            error!("Error parse_com_interface_configuration: {:?}", e);

                            ComInterfaceCreateError::connection_error_with_details(
                                e.to_string()
                            )
                        })?;

                    let new_sockets_generator = JSAsyncGenerator(new_sockets_generator);

                    info!("configuration properties: {:#?}", properties);
                    info!("has_single_socket: {:#?}", has_single_socket);
                    info!("new_sockets_iterator: {:#?}", new_sockets_generator);

                    Ok(ComInterfaceConfiguration::new_maybe_single_socket(
                        properties,
                        has_single_socket,
                        async gen move {
                            // TODO:
                            loop {
                                info!("next socket");
                                let next_socket = match new_sockets_generator.next(&JsValue::UNDEFINED) {
                                    Ok(promise) => match JsFuture::from(promise).await {
                                        Ok(result) => result,
                                        Err(e) => {
                                            error!("Error awaiting next socket promise: {:?}", e);
                                            return yield Err(());
                                        }
                                    },
                                    Err(e) => {
                                        error!("Error getting next socket: {:?}", e);
                                        return yield Err(());
                                    }
                                };


                                if next_socket.done() {
                                    info!("No more sockets to accept, generator is done");
                                    return;
                                }

                                info!("Received new socket configuration: {:#?}", next_socket.value());
                            }
                        }
                    ))
                })
            }),
        );
    }

    fn parse_com_interface_configuration(
        interface_configuration: &JsValue,
    ) -> Result<(ComInterfaceProperties, bool, js_sys::AsyncGenerator), serde_wasm_bindgen::Error> {
        let properties = Reflect::get(interface_configuration, &"properties".into())
            .and_then(|v| v.dyn_into::<Object>())?;

        let properties: ComInterfaceProperties = from_value(properties.into())?;

        // get bool has_single_socket from interface_configuration
        let has_single_socket = Reflect::get(interface_configuration, &"has_single_socket".into())
            .map(|v| v.as_bool())?;

        // get new_sockets_iterator from interface_configuration
        let new_sockets_iterator = Reflect::get(interface_configuration, &"new_sockets_iterator".into())
            .and_then(|v| v.dyn_into::<js_sys::AsyncGenerator>())?;

        Ok((properties, has_single_socket.unwrap_or_default(), new_sockets_iterator))
    }

    fn parse_socket_properties(
        socket_properties: &JsValue,
    ) -> Result<SocketProperties, serde_wasm_bindgen::Error> {
        Reflect::set(
            socket_properties,
            &"uuid".into(),
            &ComInterfaceSocketUUID::new().to_string().into(),
        )?;

        let properties: SocketProperties = from_value(socket_properties.into())?;

        Ok(properties)
    }
}

/**
 * Exposed properties and methods for JavaScript
 */
#[wasm_bindgen]
impl JSComHub {
    pub fn register_default_interface_factories(&self) {
        #[cfg(feature = "wasm_websocket_client")]
        {
            self.com_hub().register_async_interface_factory::<crate::network::com_interfaces::websocket::websocket_client::WebSocketClientInterfaceSetupDataJS>();
        }

        #[cfg(feature = "wasm_serial")]
        self.com_hub().register_async_interface_factory::<crate::network::com_interfaces::serial::serial_client::SerialClientInterfaceSetupDataJS>();

        // #[cfg(feature = "wasm_webrtc")]
        // self.com_hub().register_async_interface_factory::<crate::network::com_interfaces::webrtc_js_interface::WebRTCJSInterface>();
    }

    pub fn register_interface_factory(
        &mut self,
        interface_type: String,
        factory: js_sys::Function,
    ) {
       self.register_interface_factory_internal(interface_type, factory);
    }


    pub async fn create_interface(
        &self,
        interface_type: String,
        setup_data: JsValue,
        priority: Option<u16>,
    ) -> Result<String, JsError> {
        let setup_data =
            dif_js_value_to_value_container(setup_data, self.runtime.memory())
                .map_err(|e| JsError::new(&format!("{e:?}")))?;
        let interface = self
            .create_interface_internal(interface_type, setup_data, priority)
            .await
            .map_err(|e| JsError::new(&format!("{e:?}")))?;
        Ok(interface.to_string())
    }

    pub async fn close_interface(
        &self,
        interface_uuid: String,
    ) -> Result<(), JsError> {
        let interface_uuid = ComInterfaceUUID::try_from(interface_uuid)
            .map_err(|e| JsError::new(&format!("{e:?}")))?;
        let runtime = self.runtime.clone();
        let com_hub = runtime.com_hub();
        let has_interface = { com_hub.has_interface(&interface_uuid) };
        if has_interface {
            com_hub
                .remove_interface(interface_uuid.clone())
                .await
                .map_err(|e| JsError::new(&format!("{e:?}")))?;
            Ok(())
        } else {
            error!("Failed to find interface");
            Err(JsError::new("Failed to find interface"))
        }
    }

    /// Send a block to the given interface and socket
    /// This does not involve the routing on the ComHub level.
    /// The socket UUID is used to identify the socket to send the block over
    /// The interface UUID is used to identify the interface to send the block over
    // pub async fn send_block(
    //     &self,
    //     block: Uint8Array,
    //     interface_uuid: String,
    //     socket_uuid: String,
    // ) -> Result<(), JsError> {
    //     let interface_uuid = ComInterfaceUUID::try_from(interface_uuid)
    //         .map_err(|e| JsError::new(&format!("{e:?}")))?;
    //     let socket_uuid = ComInterfaceSocketUUID::try_from(socket_uuid)
    //         .map_err(|e| JsError::new(&format!("{e:?}")))?;
    //     let block = DXBBlock::from_bytes(block.to_vec().as_slice())
    //         .await
    //         .map_err(|e| JsError::new(&format!("{e:?}")))?;
    //     self.com_hub()
    //         .interfaces_manager()
    //         .get_interface_by_uuid(&interface_uuid)
    //         .send_block(block, socket_uuid);
    //     Ok(())
    // }

    // pub fn _drain_incoming_blocks(&self) -> Vec<js_sys::Uint8Array> {
    //     let mut sections = self
    //         .com_hub()
    //         .block_handler
    //         .incoming_sections_queue
    //         .borrow_mut();
    //     let sections = sections.drain(..).collect::<Vec<_>>();

    //     let mut blocks = vec![];

    //     for section in sections {
    //         match section {
    //             IncomingSection::SingleBlock(block) => {
    //                 blocks.push(block.clone());
    //             }
    //             _ => {
    //                 panic!("Expected single block, but got block stream");
    //             }
    //         }
    //     }

    //     blocks
    //         .iter()
    //         .map(|(block, ..)| {
    //             let bytes = block.clone().unwrap().to_bytes().unwrap();
    //             let entry =
    //                 js_sys::Uint8Array::new_with_length(bytes.len() as u32);
    //             entry.copy_from(&bytes);
    //             entry
    //         })
    //         .collect::<Vec<_>>()
    // }

    pub fn get_metadata_string(&self) -> String {
        cfg_if::cfg_if! {
            if #[cfg(feature = "debug")] {
                let metadata = self.com_hub().get_metadata();
                metadata.to_string()
            } else {
                unreachable!("Metadata is only available in debug builds")
            }
        }
    }

    pub fn get_metadata(&self) -> JsValue {
        cfg_if::cfg_if! {
            if #[cfg(feature = "debug")] {
                let metadata = self.com_hub().get_metadata();
                serde_wasm_bindgen::to_value(&metadata).unwrap()
            } else {
                unreachable!("Metadata is only available in debug builds")
            }
        }
    }

    pub async fn get_trace_string(
        &self,
        endpoint: String,
    ) -> Result<Option<String>, JsError> {
        cfg_if::cfg_if! {
            if #[cfg(feature = "debug")] {
                let endpoint = Endpoint::from_str(&endpoint)
                    .map_err(|e| JsError::new(&format!("Invalid endpoint format: {:?}", e)))?;
                let trace = self.com_hub().record_trace(endpoint).await;
                Ok(trace.map(|t| t.to_string()))
            }
            else {
                unreachable!("Trace is only available in debug builds")
            }
        }
    }

    pub fn register_outgoing_block_interceptor(
        &self,
        callback: js_sys::Function,
    ) {
        self.com_hub().register_outgoing_block_interceptor(
            move |block, socket, endpoints| {
                let this = JsValue::NULL;
                let block_bytes =
                    js_sys::Uint8Array::from(block.to_bytes().as_slice());
                let socket_uuid = JsValue::from_str(&socket.to_string());
                let endpoints_array = js_sys::Array::new();
                for endpoint in endpoints {
                    endpoints_array
                        .push(&JsValue::from_str(&endpoint.to_string()));
                }
                if let Err(e) = callback.call3(
                    &this,
                    &JsValue::from(block_bytes),
                    &socket_uuid,
                    &endpoints_array,
                ) {
                    error!(
                        "Error in outgoing block interceptor callback: {:?}",
                        e
                    );
                }
            },
        );
    }

    pub fn register_incoming_block_interceptor(
        &self,
        callback: js_sys::Function,
    ) {
        self.com_hub().register_incoming_block_interceptor(
            move |block, socket| {
                let this = JsValue::NULL;
                let block_bytes =
                    js_sys::Uint8Array::from(block.to_bytes().as_slice());
                let socket_uuid = JsValue::from_str(&socket.to_string());
                if let Err(e) = callback.call2(
                    &this,
                    &JsValue::from(block_bytes),
                    &socket_uuid,
                ) {
                    error!(
                        "Error in incoming block interceptor callback: {:?}",
                        e
                    );
                }
            },
        );
    }
}
