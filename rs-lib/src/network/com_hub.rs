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
use js_sys::Uint8Array;
use log::error;
use serde_wasm_bindgen::from_value;
use std::{collections::HashMap, rc::Rc, str::FromStr};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::{JsFuture, future_to_promise};
use web_sys::js_sys::{self, Promise};

use crate::{
    js_utils::{
        cast_from_dif_js_value, dif_js_value_to_value_container,
        value_container_to_dif_js_value,
    },
    network::com_interfaces::base_interface::BaseInterfaceHandle,
};

#[wasm_bindgen]
#[derive(Clone)]
pub struct JSComHub {
    // ignore for wasm bindgen
    pub(crate) runtime: Runtime,
    registered_interface_factories: HashMap<String, js_sys::Function>,
}

/**
 * Internal impl of the JSRuntime, not exposed to JavaScript
 */
impl JSComHub {
    pub fn new(runtime: Runtime) -> JSComHub {
        JSComHub {
            runtime,
            registered_interface_factories: HashMap::new(),
        }
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
        let interface = com_hub
            .create_interface(
                &interface_type,
                setup_data,
                InterfacePriority::from(priority),
            )
            .await?;
        Ok(interface)
    }
}

/**
 * Exposed properties and methods for JavaScript
 */
#[wasm_bindgen]
impl JSComHub {
    pub fn register_default_interface_factories(&self) {
        #[cfg(feature = "wasm_websocket_client")]
        self.com_hub().register_async_interface_factory::<crate::network::com_interfaces::websocket_client_js_interface::WebSocketClientJSInterfaceSetupData>();

        #[cfg(feature = "wasm_serial")]
        self.com_hub().register_async_interface_factory::<crate::network::com_interfaces::serial_js_interface::SerialInterfaceSetupDataJS>();

        // #[cfg(feature = "wasm_webrtc")]
        // self.com_hub().register_async_interface_factory::<crate::network::com_interfaces::webrtc_js_interface::WebRTCJSInterface>();
    }

    pub fn register_interface_factory(
        &mut self,
        interface_type: String,
        factory: js_sys::Function,
    ) {
        self.registered_interface_factories
            .insert(interface_type.clone(), factory.clone());
        let runtime = self.runtime.clone();
        self.com_hub().register_dyn_interface_factory(
            interface_type,
            Rc::new(move |setup_data| {
                let factory = factory.clone();
                let runtime = runtime.clone();
                Box::pin(async move {
                    let base_interface_holder =
                        BaseInterfaceHandle::create_interface().await;
                    let interface_properties_promise = factory
                        .call2(
                            &JsValue::UNDEFINED,
                            &JsValue::from(base_interface_holder),
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
                    let interface_properties = JsFuture::from(
                        interface_properties_promise,
                    )
                    .await
                    .expect("Failed to get interface properties from promise");

                    let properties = cast_from_dif_js_value::<ComInterfaceProperties>(
                        interface_properties,
                        runtime.memory(),
                    )
                    .map_err(|e| ComInterfaceCreateError::SetupDataParseError)?;
                ComInterfaceConfiguration::new(properties, 1)
                })
            }),
        );
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

    pub fn close_interface(
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

    #[cfg(feature = "debug")]
    pub fn get_metadata_string(&self) -> String {
        let metadata = self.com_hub().get_metadata();
        metadata.to_string()
    }

    #[cfg(feature = "debug")]
    pub fn get_metadata(&self) -> JsValue {
        let metadata = self.com_hub().get_metadata();
        serde_wasm_bindgen::to_value(&metadata).unwrap()
    }

    #[cfg(feature = "debug")]
    pub async fn get_trace_string(&self, endpoint: String) -> Option<String> {
        let endpoint = Endpoint::from_str(&endpoint);
        if let Ok(endpoint) = endpoint {
            let trace = self.com_hub().record_trace(endpoint).await;
            trace.map(|t| t.to_string())
        } else {
            println!("Invalid endpoint: {}", endpoint.unwrap_err());
            None
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
