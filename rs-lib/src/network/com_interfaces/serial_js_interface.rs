use datex::{
    derive_setup_data,
    global::dxb_block::DXBBlock,
    network::{
        com_hub::errors::ComInterfaceCreateError,
        com_interfaces::{
            com_interface::{
                factory::{
                    ComInterfaceAsyncFactory, ComInterfaceAsyncFactoryResult,
                    ComInterfaceConfiguration, SendCallback, SendFailure,
                    SocketConfiguration, SocketProperties,
                },
                properties::{ComInterfaceProperties, InterfaceDirection},
            },
            default_setup_data::serial::serial_client::SerialClientInterfaceSetupData,
        },
    },
};

use log::{debug, error};
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    ReadableStreamDefaultReader, SerialOptions, SerialPort, js_sys,
    js_sys::Uint8Array,
};

derive_setup_data!(
    SerialClientInterfaceSetupDataJS,
    SerialClientInterfaceSetupData
);

impl SerialClientInterfaceSetupDataJS {
    async fn create_interface(
        self,
    ) -> Result<ComInterfaceConfiguration, ComInterfaceCreateError> {
        let window = web_sys::window().expect("Could not get window object");
        let navigator = window.navigator();
        let serial = navigator.serial();

        let port_promise = serial.request_port();
        let port_js = JsFuture::from(port_promise).await.map_err(|e| {
            ComInterfaceCreateError::connection_error_with_details(format!(
                "Error requesting serial port: {e:?}"
            ))
        })?;
        let port: SerialPort = port_js.into();

        JsFuture::from(port.open(&SerialOptions::new(self.baud_rate)))
            .await
            .map_err(|e| {
                ComInterfaceCreateError::connection_error_with_details(format!(
                    "Error opening serial port: {e:?}"
                ))
            })?;

        let readable = port.readable();
        let reader = readable
            .get_reader()
            .dyn_into::<ReadableStreamDefaultReader>()
            .unwrap();
        let writable = port.writable();
        let writer = writable.get_writer().unwrap();

        Ok(ComInterfaceConfiguration::new_single_socket(
            ComInterfaceProperties {
                ..Self::get_default_properties()
            },
            SocketConfiguration::new(
                SocketProperties::new(InterfaceDirection::InOut, 1),
                async gen move {
                    loop {
                        let result = JsFuture::from(reader.read()).await;
                        match result {
                            Ok(value) => {
                                let value =
                                    value.dyn_into::<js_sys::Object>().unwrap();
                                let done = js_sys::Reflect::get(
                                    &value,
                                    &"done".into(),
                                )
                                .unwrap()
                                .as_bool()
                                .unwrap_or(false);
                                if done {
                                    break;
                                }
                                let value = js_sys::Reflect::get(
                                    &value,
                                    &"value".into(),
                                )
                                .unwrap();
                                if value.is_instance_of::<Uint8Array>() {
                                    let bytes = value
                                        .dyn_into::<Uint8Array>()
                                        .unwrap()
                                        .to_vec();
                                    debug!("Received bytes: {bytes:?}");
                                    yield Ok(bytes);
                                }
                            }
                            Err(e) => {
                                error!("Error reading from serial port: {e:?}");
                                return yield Err(());
                            }
                        }
                    }
                },
                SendCallback::new_async(move |block: DXBBlock| {
                    let js_array =
                        Uint8Array::from(block.to_bytes().as_slice());
                    let promise = writer.write_with_chunk(&js_array);
                    async move {
                        JsFuture::from(promise)
                            .await
                            .map_err(|e| SendFailure(Box::new(block)))
                            .map(|_| ())
                    }
                }),
            ),
        ))
    }
}

impl ComInterfaceAsyncFactory for SerialClientInterfaceSetupDataJS {
    fn create_interface(self) -> ComInterfaceAsyncFactoryResult {
        Box::pin(self.create_interface())
    }

    fn get_default_properties() -> ComInterfaceProperties {
        SerialClientInterfaceSetupData::get_default_properties()
    }
}
