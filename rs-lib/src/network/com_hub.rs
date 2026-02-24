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
            ComInterfaceUUID,
            factory::{
                ComInterfaceConfiguration, SendCallback, SendFailure,
                SendSuccess, SocketConfiguration, SocketProperties,
            },
            properties::ComInterfaceProperties,
            socket::ComInterfaceSocketUUID,
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
use js_sys::{Function, JsFunction1, Object, Promise, Reflect};
use log::{error, info};
use serde_wasm_bindgen::from_value;
use std::{ops::Deref, rc::Rc, str::FromStr};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::{JsFuture, future_to_promise};
use web_sys::js_sys::{self};

use crate::js_utils::{
    dif_js_value_to_value_container, value_container_to_dif_js_value,
};

#[wasm_bindgen]
#[derive(Clone)]
pub struct JSComHub {
    // ignore for wasm bindgen
    pub(crate) runtime: Runtime,
}

// wrapper around AsyncGenerator that implements Drop
#[derive(Debug, Clone)]
pub struct JsReadableStream(pub web_sys::ReadableStream);
impl Deref for JsReadableStream {
    type Target = web_sys::ReadableStream;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

// TODO: implement AsyncDrop for JsReadableStream
// currently, theres a bug that does not call drop using the unstable async_drop feature
// impl Drop for JsReadableStream {
//     fn drop(&mut self) {
//         info!("sync drop!!!!")
//     }
// }

/**
 * Internal impl of the JSRuntime, not exposed to JavaScript
 */
impl JSComHub {
    pub fn new(runtime: Runtime) -> JSComHub {
        let com_hub = JSComHub { runtime };
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

                    let new_sockets_reader = new_sockets_generator.get_reader()
                        .unchecked_into::<web_sys::ReadableStreamDefaultReader>();
                    let new_sockets_reader_clone = new_sockets_reader.clone();

                    Ok(ComInterfaceConfiguration::new(
                        properties,
                        has_single_socket,
                        async gen move {
                            loop {
                                let read_result = match JsFuture::from(new_sockets_reader.read()).await {
                                    Ok(result) => result,
                                    Err(e) => {
                                        error!("Error awaiting next socket promise: {:?}", e);
                                        return yield Err(());
                                    }
                                }.unchecked_into::<web_sys::ReadableStreamReadResult>();

                                if let Some(done) = read_result.get_done() && done {
                                    return;
                                }

                                let (socket_properties, socket_iterator, send_callback) = match JSComHub::parse_socket_configuration(&read_result.get_value()) {
                                    Ok(result) => result,
                                    Err(e) => {
                                        error!("Error parse_socket_configuration: {:?}", e);
                                        return yield Err(());
                                    }
                                };
                                let send_callback = Rc::new(send_callback);
                                let socket_data_reader = socket_iterator.get_reader()
                                    .unchecked_into::<web_sys::ReadableStreamDefaultReader>();
                                let socket_data_reader_clone = socket_data_reader.clone();

                                yield Ok(SocketConfiguration::new(
                                    socket_properties,
                                    Some(async gen move {
                                        loop {
                                            let read_result = match JsFuture::from(socket_data_reader.read()).await {
                                                Ok(result) => result,
                                                Err(e) => {
                                                    error!("Error awaiting next block promise: {:?}", e);
                                                    return yield Err(());
                                                }
                                            }.unchecked_into::<web_sys::ReadableStreamReadResult>();

                                            if let Some(done) = read_result.get_done() && done {
                                                return;
                                            }
                                            let block_bytes = match read_result.get_value().dyn_into::<js_sys::ArrayBuffer>() {
                                                Ok(bytes) => bytes,
                                                Err(e) => {
                                                    error!("Error converting block to Uint8Array: {:?}", e);
                                                    return yield Err(());
                                                }
                                            };
                                            let block_bytes = js_sys::Uint8Array::new(&block_bytes).to_vec();
                                            yield Ok(block_bytes);
                                        }
                                    }),
                                    Some(SendCallback::new_async(move |dxb_block| {
                                        let send_callback = send_callback.clone();
                                        async move {
                                            send_callback.call1(&JsValue::UNDEFINED, &JsValue::from(dxb_block.to_bytes()))
                                                .map_err(|e| {
                                                    error!("Error calling send callback: {:?}", e);
                                                    SendFailure(Box::new(dxb_block))
                                                })
                                                .map(|_| ())
                                        }
                                    })),
                                    Some(async move || {
                                        let _ = JsFuture::from(socket_data_reader_clone.cancel()).await;
                                    })
                                ));
                            }
                        },
                        Some(async move || {
                            let _ = JsFuture::from(new_sockets_reader_clone.cancel()).await;
                        })
                    ))
                })
            }),
        );
    }

    fn parse_com_interface_configuration(
        interface_configuration: &JsValue,
    ) -> Result<
        (ComInterfaceProperties, bool, JsReadableStream),
        serde_wasm_bindgen::Error,
    > {
        let properties =
            Reflect::get(interface_configuration, &"properties".into())
                .and_then(|v| v.dyn_into::<Object>())?;

        let properties: ComInterfaceProperties = from_value(properties.into())?;

        // get bool has_single_socket from interface_configuration
        let has_single_socket =
            Reflect::get(interface_configuration, &"has_single_socket".into())
                .map(|v| v.as_bool())?;

        // get new_sockets_iterator from interface_configuration
        // NOTE: dyn_into does not work here, maybe a bug in js_sys?
        let new_sockets_iterator = Reflect::get(
            interface_configuration,
            &"new_sockets_iterator".into(),
        )
        .map(|v| v.unchecked_into::<web_sys::ReadableStream>())?;

        Ok((
            properties,
            has_single_socket.unwrap_or_default(),
            JsReadableStream(new_sockets_iterator),
        ))
    }

    fn parse_socket_configuration(
        socket_configuration: &JsValue,
    ) -> Result<
        (SocketProperties, JsReadableStream, Function),
        serde_wasm_bindgen::Error,
    > {
        let properties =
            Reflect::get(socket_configuration, &"properties".into())
                .and_then(|v| v.dyn_into::<Object>())?;

        // add uuid to properties since it is not set by the user but is required for the SocketProperties struct
        Reflect::set(
            &properties,
            &"uuid".into(),
            &ComInterfaceSocketUUID::new().to_string().into(),
        )?;

        let properties: SocketProperties = from_value(properties.into())?;

        // get iterator from socket_configuration
        // NOTE: dyn_into does not work here, maybe a bug in js_sys?
        let iterator =
            Reflect::get(socket_configuration, &"iterator".into())
                .map(|v| v.unchecked_into::<web_sys::ReadableStream>())?;

        // get send_callback
        let send_callback =
            Reflect::get(socket_configuration, &"send_callback".into())
                .and_then(|v| v.dyn_into::<Function>())?;

        Ok((properties, JsReadableStream(iterator), send_callback))
    }
}

/**
 * Exposed properties and methods for JavaScript
 */
#[wasm_bindgen]
impl JSComHub {
    pub fn register_default_interface_factories(&self) {
        #[cfg(feature = "websocket-client")]
        {
            self.com_hub().register_async_interface_factory::<crate::network::com_interfaces::websocket::websocket_client::WebSocketClientInterfaceSetupDataJS>();
        }

        #[cfg(feature = "serial-client")]
        self.com_hub().register_async_interface_factory::<crate::network::com_interfaces::serial::serial_client::SerialClientInterfaceSetupDataJS>();

        // #[cfg(feature = "webrtc")]
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
