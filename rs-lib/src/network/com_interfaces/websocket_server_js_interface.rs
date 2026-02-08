use std::{net::SocketAddr, str::FromStr};

use datex::{
    channel::mpsc::{UnboundedReceiver, create_unbounded_channel},
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
            default_setup_data::{
                serial::serial_client::SerialClientInterfaceSetupData,
                websocket::websocket_server::WebSocketServerInterfaceSetupData,
            },
        },
    },
};

use log::{debug, error};
use wasm_bindgen::{JsCast, prelude::Closure};
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    ErrorEvent, MessageEvent, ReadableStreamDefaultReader, SerialOptions,
    SerialPort, WebSocket,
    js_sys::{self, Uint8Array},
};

derive_setup_data!(
    WebSocketServerInterfaceSetupDataJS,
    WebSocketServerInterfaceSetupData
);

type JsWsRead = UnboundedReceiver<Result<Vec<u8>, ()>>;
type JsWsWrite = WebSocket;

fn split_websocket(ws: WebSocket) -> (JsWsRead, JsWsWrite) {
    ws.set_binary_type(web_sys::BinaryType::Arraybuffer);

    let (tx, rx) = create_unbounded_channel::<Result<Vec<u8>, ()>>();

    let on_message = Closure::<dyn FnMut(MessageEvent)>::new({
        let mut tx = tx.clone();
        move |e: MessageEvent| {
            if let Ok(abuf) = e.data().dyn_into::<js_sys::ArrayBuffer>() {
                let arr = js_sys::Uint8Array::new(&abuf);
                let _ = tx.start_send(Ok(arr.to_vec()));
            } else {
                error!("Received non-binary message: {:?}", e.data());
                let _ = tx.start_send(Err(()));
            }
        }
    });
    ws.set_onmessage(Some(on_message.as_ref().unchecked_ref()));
    on_message.forget();

    let on_error = Closure::<dyn FnMut(ErrorEvent)>::new({
        let mut tx = tx.clone();
        move |e: ErrorEvent| {
            error!("WebSocket error: {:?}", e.message());
            let _ = tx.start_send(Err(()));
        }
    });
    ws.set_onerror(Some(on_error.as_ref().unchecked_ref()));
    on_error.forget();

    let on_close = Closure::<dyn FnMut()>::new({
        let mut tx = tx.clone();
        move || {
            debug!("WebSocket closed");
            let _ = tx.start_send(Err(()));
        }
    });
    ws.set_onclose(Some(on_close.as_ref().unchecked_ref()));
    on_close.forget();

    (rx, ws)
}

impl WebSocketServerInterfaceSetupDataJS {
    async fn create_interface(
        self,
    ) -> Result<ComInterfaceConfiguration, ComInterfaceCreateError> {
        let addr = SocketAddr::from_str(&self.bind_address)
            .map_err(ComInterfaceCreateError::invalid_setup_data)?;
        let (accept_tx, mut accept_rx) =
            create_unbounded_channel::<WebSocket>();
        Ok(ComInterfaceConfiguration::new(
            ComInterfaceProperties {
                name: Some(addr.to_string()),
                connectable_interfaces:
                    WebSocketServerInterfaceSetupData::get_clients_setup_data(
                        self.0.accept_addresses,
                    )?,
                ..Self::get_default_properties()
            },
            async gen move {
                loop {
                    let (mut read, write) = match accept_rx.next().await {
                        Some(ws) => split_websocket(ws),
                        None => {
                            error!("Accept channel closed");
                            break;
                        }
                    };
                }
            },
        ))
    }
}

impl ComInterfaceAsyncFactory for WebSocketServerInterfaceSetupDataJS {
    fn create_interface(self) -> ComInterfaceAsyncFactoryResult {
        Box::pin(self.create_interface())
    }

    fn get_default_properties() -> ComInterfaceProperties {
        WebSocketServerInterfaceSetupData::get_default_properties()
    }
}
