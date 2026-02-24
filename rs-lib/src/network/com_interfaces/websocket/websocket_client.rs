use datex_core::{
    derive_setup_data,
    network::com_interfaces::com_interface::factory::ComInterfaceAsyncFactory,
};
use futures_channel::oneshot;
use gloo_timers::future::TimeoutFuture;
use std::{
    cell::RefCell,
    rc::Rc,
    sync::{Arc, Mutex},
    time::Duration,
};

use datex_core::{
    channel::mpsc::{UnboundedReceiver, create_unbounded_channel},
    global::dxb_block::DXBBlock,
    network::{
        com_hub::errors::ComInterfaceCreateError,
        com_interfaces::{
            com_interface::{
                factory::{
                    ComInterfaceAsyncFactoryResult, ComInterfaceConfiguration,
                    SendCallback, SendFailure, SocketConfiguration,
                    SocketProperties,
                },
                properties::{ComInterfaceProperties, InterfaceDirection},
            },
            default_setup_data::{
                http_common::parse_url,
                websocket::websocket_client::WebSocketClientInterfaceSetupData,
            },
        },
    },
};
use log::info;
use url::Url;
use wasm_bindgen::{JsCast, prelude::Closure};
use web_sys::js_sys;

derive_setup_data!(
    WebSocketClientInterfaceSetupDataJS,
    WebSocketClientInterfaceSetupData
);

impl WebSocketClientInterfaceSetupDataJS {
    const OPEN_TIMEOUT_MS: Duration = Duration::from_secs(15);
    const MAX_RECONNECTS: usize = 5;
    const RECONNECT_BACKOFF_MS: Duration = Duration::from_secs(5);

    /// Creates the interface asynchronously
    async fn create_interface(
        self,
    ) -> Result<ComInterfaceConfiguration, ComInterfaceCreateError> {
        let address = parse_url(&self.url).map_err(|_| {
            ComInterfaceCreateError::InvalidSetupData(
                "Invalid WebSocket URL".to_string(),
            )
        })?;
        if address.scheme() != "ws" && address.scheme() != "wss" {
            return Err(ComInterfaceCreateError::InvalidSetupData(
                "Invalid WebSocket URL scheme".to_string(),
            ));
        }

        let ws =
            Self::create_websocket_client_connection(address.clone()).await?;
        let ws_rc = Rc::new(Mutex::new(ws.clone()));

        // TODO: cleanup reader task
        let mut reader =
            Self::create_incoming_data_reader(ws.clone(), None).await;
        Ok(ComInterfaceConfiguration::new_single_socket(
            ComInterfaceProperties {
                name: Some(self.url.clone()),
                ..Self::get_default_properties()
            },
            SocketConfiguration::new_in_out(
                SocketProperties::new(InterfaceDirection::InOut, 1),
                async gen move {
                    loop {
                        while let Some(data) = reader.next().await {
                            yield Ok(data);
                        }
                    }
                },
                SendCallback::new_async(move |block: DXBBlock| {
                    let ws = ws_rc.clone();
                    async move {
                        ws.lock()
                            .unwrap()
                            .send_with_u8_array(&block.to_bytes())
                            .map_err(|_| SendFailure(Box::new(block)))?;
                        Ok(())
                    }
                }),
            ),
        ))
    }

    // TODO: reimplement using abstraction of ReconnectingWebSocket
    /// Connection supervisor task - manages connection and reconnection
    // async fn connection_supervisor_task(
    //     address: Url,
    //     state: Arc<Mutex<ComInterfaceStateWrapper>>,
    //     incoming_tx: UnboundedSender<Vec<u8>>,
    //     ws_cell: Rc<RefCell<Option<web_sys::WebSocket>>>,
    //     mut ready_tx: Option<oneshot::Sender<Result<(), InterfaceCreateError>>>,
    // ) {
    //     let mut shutdown_receiver = state.lock().unwrap().shutdown_receiver();
    //     let mut attempts: usize = 0;
    //
    //     loop {
    //         // Try to create connection
    //         match Self::create_websocket_client_connection(
    //             address.clone(),
    //             state.clone(),
    //         )
    //         .await
    //         {
    //             // If successful, set ws and spawn read task
    //             Ok(ws) => {
    //                 // Reset attempts on successful connect
    //                 attempts = 0;
    //
    //                 // Set ws
    //                 *ws_cell.borrow_mut() = Some(ws.clone());
    //
    //                 // Handle close and read
    //                 let (close_tx, close_rx) = oneshot::channel::<()>();
    //                 spawn_with_panic_notify_default(Self::create_incoming_data_reader(
    //                     ws,
    //                     incoming_tx.clone(),
    //                     Some(close_tx),
    //                 ));
    //
    //                 // Notify ready for the first successful connection
    //                 if let Some(tx) = ready_tx.take() {
    //                     let _ = tx.send(Ok(()));
    //                 }
    //
    //                 // Wait for close or shutdown
    //                 futures::pin_mut!(close_rx);
    //                 let shutdown_fut = shutdown_receiver.wait().fuse();
    //                 futures::pin_mut!(shutdown_fut);
    //                 use futures::{FutureExt, select};
    //                 select! {
    //                     _ = shutdown_fut => {
    //                         // Clear ws and exit
    //                         *ws_cell.borrow_mut() = None;
    //                         return;
    //                     }
    //                     _ = close_rx.fuse() => {
    //                         // Connection closed - clear current ws and reconnect
    //                         *ws_cell.borrow_mut() = None;
    //                     }
    //                 }
    //             }
    //             Err(_e) => {
    //                 attempts += 1;
    //                 if attempts > Self::MAX_RECONNECTS {
    //                     *ws_cell.borrow_mut() = None;
    //                     return;
    //                 }
    //             }
    //         }
    //
    //         // Backoff before next reconnect attempt
    //         let timeout =
    //             TimeoutFuture::new(Self::OPEN_TIMEOUT_MS.as_millis() as u32);
    //         futures::pin_mut!(timeout);
    //
    //         use futures::{FutureExt, select};
    //         let mut shutdown_receiver =
    //             state.lock().unwrap().shutdown_receiver();
    //         let shutdown_fut = shutdown_receiver.wait().fuse();
    //
    //         futures::pin_mut!(shutdown_fut);
    //
    //         select! {
    //             stop = shutdown_fut => {
    //                 *ws_cell.borrow_mut() = None;
    //                 return;
    //             },
    //             _ = timeout.fuse() => {
    //
    //             }
    //         }
    //     }
    // }

    // Creates a WebSocket connection and waits for it to open
    async fn create_websocket_client_connection(
        address: Url,
    ) -> Result<web_sys::WebSocket, ComInterfaceCreateError> {
        let ws = web_sys::WebSocket::new(address.as_ref()).map_err(
            |_: wasm_bindgen::JsValue| {
                ComInterfaceCreateError::connection_error()
            },
        )?;
        ws.set_binary_type(web_sys::BinaryType::Arraybuffer);
        let (open_tx, open_rx) = oneshot::channel::<()>();
        let (fail_tx, fail_rx) = oneshot::channel::<ComInterfaceCreateError>();

        let open_cell = Rc::new(RefCell::new(Some(open_tx)));
        let fail_cell = Rc::new(RefCell::new(Some(fail_tx)));

        // onopen
        {
            let open_cell = Rc::clone(&open_cell);
            let onopen = Closure::once(move |_e: web_sys::Event| {
                if let Some(tx) = open_cell.borrow_mut().take() {
                    let _ = tx.send(());
                }
            });
            ws.set_onopen(Some(onopen.as_ref().unchecked_ref()));
            onopen.forget();
        }

        // onerror
        {
            let fail_cell = Rc::clone(&fail_cell);
            let onerror = Closure::once(move |e: web_sys::ErrorEvent| {
                if let Some(tx) = fail_cell.borrow_mut().take() {
                    let _ = tx.send(
                        ComInterfaceCreateError::connection_error_with_details(
                            e.to_string(),
                        ),
                    );
                }
            });
            ws.set_onerror(Some(onerror.as_ref().unchecked_ref()));
            onerror.forget();
        }

        // onclose (before open)
        {
            let fail_cell = Rc::clone(&fail_cell);
            let onclose = Closure::once(move |_e: web_sys::Event| {
                if let Some(tx) = fail_cell.borrow_mut().take() {
                    let _ = tx.send(
                        ComInterfaceCreateError::connection_error_with_details(
                            "Closed before open",
                        ),
                    );
                }
            });
            ws.set_onclose(Some(onclose.as_ref().unchecked_ref()));
            onclose.forget();
        }

        futures::pin_mut!(open_rx);
        futures::pin_mut!(fail_rx);

        let timeout =
            TimeoutFuture::new(Self::OPEN_TIMEOUT_MS.as_millis() as u32);
        futures::pin_mut!(timeout);

        use futures::{FutureExt, select};

        select! {
            _ = open_rx.fuse() => Ok(ws),
            err = fail_rx.fuse() => Err(err.unwrap_or(ComInterfaceCreateError::connection_error())),
            _ = timeout.fuse() => {
                // Close the socket to avoid dangling connection attempt
                let _ = ws.close();
                Err(ComInterfaceCreateError::connection_error_with_details("Connection timed out"))
            }
        }
    }

    /// Creates an incoming data reader that listens for messages and passes them via the returned receiver.
    /// Also handles close and error events to clean up resources.
    async fn create_incoming_data_reader(
        ws: web_sys::WebSocket,
        mut close_tx: Option<oneshot::Sender<()>>,
    ) -> UnboundedReceiver<Vec<u8>> {
        let (mut tx, rx) = create_unbounded_channel::<Vec<u8>>();

        let onmessage =
            Closure::wrap(Box::new(move |e: web_sys::MessageEvent| {
                if let Ok(buf) = e.data().dyn_into::<js_sys::ArrayBuffer>() {
                    let array = js_sys::Uint8Array::new(&buf);
                    let mut data = vec![0; array.byte_length() as usize];
                    array.copy_to(&mut data[..]);
                    let _ = tx.start_send(data);
                }
            }) as Box<dyn FnMut(_)>);
        ws.set_onmessage(Some(onmessage.as_ref().unchecked_ref()));
        onmessage.forget();

        // onerror
        let onerror = Closure::once(move |_: web_sys::ErrorEvent| {
            // pass
        });
        ws.set_onerror(Some(onerror.as_ref().unchecked_ref()));
        onerror.forget();

        let ws_clone = ws.clone();
        // onclose
        let onclose = Closure::once(move |e: web_sys::Event| {
            if let Some(close_tx) = close_tx.take() {
                let _ = close_tx.send(());
                // clear event handlers
                ws_clone.set_onmessage(None);
                ws_clone.set_onopen(None);
                ws_clone.set_onerror(None);
                ws_clone.set_onclose(None);
            }
        });
        ws.set_onclose(Some(onclose.as_ref().unchecked_ref()));
        onclose.forget();

        rx
    }
}

impl ComInterfaceAsyncFactory for WebSocketClientInterfaceSetupDataJS {
    fn create_interface(self) -> ComInterfaceAsyncFactoryResult {
        Box::pin(self.create_interface())
    }

    fn get_default_properties() -> ComInterfaceProperties {
        WebSocketClientInterfaceSetupData::get_default_properties()
    }
}
