use futures_channel::oneshot;
use gloo_timers::future::TimeoutFuture;
use std::{cell::RefCell, rc::Rc, sync::Mutex, time::Duration};

use datex::{
    network::{
        com_hub::{
            errors::InterfaceCreateError,
            managers::interfaces_manager::ComInterfaceAsyncFactoryResult,
        },
        com_interfaces::com_interface::{
            ComInterfaceEvent, ComInterfaceProxy,
            error::ComInterfaceError,
            factory::ComInterfaceAsyncFactory,
            properties::{InterfaceDirection, InterfaceProperties},
            state::ComInterfaceStateWrapper,
        },
    },
    task::spawn_with_panic_notify_default,
};

use datex::{
    network::com_interfaces::default_com_interfaces::websocket::websocket_common::WebSocketClientInterfaceSetupData,
    stdlib::sync::Arc,
};

use datex::network::com_interfaces::default_com_interfaces::websocket::websocket_common::parse_url;
use serde::{Deserialize, Serialize};

use crate::wrap_error_for_js;
use datex::channel::mpsc::{UnboundedReceiver, UnboundedSender};
use futures::{SinkExt, StreamExt, select};
use url::Url;
use wasm_bindgen::{JsCast, prelude::Closure};
use web_sys::js_sys;

wrap_error_for_js!(JSWebSocketError, datex::network::com_interfaces::default_com_interfaces::websocket::websocket_common::WebSocketError);

#[derive(Debug, Serialize, Deserialize)]
pub struct WebSocketClientJSInterfaceSetupData(
    pub WebSocketClientInterfaceSetupData,
);

impl WebSocketClientJSInterfaceSetupData {
    const OPEN_TIMEOUT_MS: Duration = Duration::from_secs(15);
    const MAX_RECONNECTS: usize = 5;
    const RECONNECT_BACKOFF_MS: Duration = Duration::from_secs(5);

    /// Creates the interface asynchronously
    async fn create_interface(
        self,
        com_interface_proxy: ComInterfaceProxy,
    ) -> Result<InterfaceProperties, InterfaceCreateError> {
        let address = parse_url(&self.0.url).map_err(|e| {
            InterfaceCreateError::InvalidSetupData(e.to_string())
        })?;
        let state = com_interface_proxy.state.clone();

        // WebSocket instance cell
        let ws_cell: Rc<RefCell<Option<web_sys::WebSocket>>> =
            Rc::new(RefCell::new(None));

        // Create socket
        let (socket_uuid, incoming_tx) = com_interface_proxy
            .create_and_init_socket(InterfaceDirection::InOut, 1);
        let (ready_tx, ready_rx) =
            oneshot::channel::<Result<(), InterfaceCreateError>>();

        // Spawn event handler task (uses the up to date ws)
        spawn_with_panic_notify_default(Self::event_handler_task(
            ws_cell.clone(),
            com_interface_proxy.event_receiver,
        ));

        // Spawn connection supervisor task
        spawn_with_panic_notify_default(Self::connection_supervisor_task(
            address.clone(),
            state.clone(),
            incoming_tx,
            ws_cell,
            Some(ready_tx),
        ));

        // Wait for ready or error
        match ready_rx.await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => return Err(e),
            Err(_) => return Err(InterfaceCreateError::InterfaceOpenFailed),
        }

        Ok(InterfaceProperties {
            name: Some(address.to_string()),
            created_sockets: Some(vec![socket_uuid]),
            ..Self::get_default_properties()
        })
    }

    /// Connection supervisor task - manages connection and reconnection
    async fn connection_supervisor_task(
        address: Url,
        state: Arc<Mutex<ComInterfaceStateWrapper>>,
        incoming_tx: UnboundedSender<Vec<u8>>,
        ws_cell: Rc<RefCell<Option<web_sys::WebSocket>>>,
        mut ready_tx: Option<oneshot::Sender<Result<(), InterfaceCreateError>>>,
    ) {
        let mut shutdown_receiver = state.lock().unwrap().shutdown_receiver();
        let mut attempts: usize = 0;

        loop {
            // Try to create connection
            match Self::create_websocket_client_connection(
                address.clone(),
                state.clone(),
            )
            .await
            {
                // If successful, set ws and spawn read task
                Ok(ws) => {
                    // Reset attempts on successful connect
                    attempts = 0;

                    // Set ws
                    *ws_cell.borrow_mut() = Some(ws.clone());

                    // Handle close and read
                    let (close_tx, close_rx) = oneshot::channel::<()>();
                    spawn_with_panic_notify_default(Self::read_task(
                        ws,
                        incoming_tx.clone(),
                        Some(close_tx),
                    ));

                    // Notify ready for the first successful connection
                    if let Some(tx) = ready_tx.take() {
                        let _ = tx.send(Ok(()));
                    }

                    // Wait for close or shutdown
                    futures::pin_mut!(close_rx);
                    let shutdown_fut = shutdown_receiver.wait().fuse();
                    futures::pin_mut!(shutdown_fut);
                    use futures::{FutureExt, select};
                    select! {
                        _ = shutdown_fut => {
                            // Clear ws and exit
                            *ws_cell.borrow_mut() = None;
                            return;
                        }
                        _ = close_rx.fuse() => {
                            // Connection closed - clear current ws and reconnect
                            *ws_cell.borrow_mut() = None;
                        }
                    }
                }
                Err(_e) => {
                    attempts += 1;
                    if attempts > Self::MAX_RECONNECTS {
                        *ws_cell.borrow_mut() = None;
                        return;
                    }
                }
            }

            // Backoff before next reconnect attempt
            let timeout =
                TimeoutFuture::new(Self::OPEN_TIMEOUT_MS.as_millis() as u32);
            futures::pin_mut!(timeout);

            use futures::{FutureExt, select};
            let mut shutdown_receiver =
                state.lock().unwrap().shutdown_receiver();
            let shutdown_fut = shutdown_receiver.wait().fuse();

            futures::pin_mut!(shutdown_fut);

            select! {
                stop = shutdown_fut => {
                    *ws_cell.borrow_mut() = None;
                    return;
                },
                _ = timeout.fuse() => {

                }
            }
        }
    }

    // Event handler task - handles sending and other events
    async fn event_handler_task(
        ws_cell: Rc<RefCell<Option<web_sys::WebSocket>>>,
        mut receiver: UnboundedReceiver<ComInterfaceEvent>,
    ) {
        while let Some(event) = receiver.next().await {
            match event {
                ComInterfaceEvent::SendBlock(block, _uuid) => {
                    let bytes = block.to_bytes();

                    if let Some(ws) = ws_cell.borrow().as_ref() {
                        // Ignore send errors if socket is mid-reconnect
                        let _ = ws.send_with_u8_array(bytes.as_slice());
                    } else {
                        // Not connected right now; drop or buffer (your call)
                    }
                }

                ComInterfaceEvent::Destroy => {
                    // Intentional close. This will trigger close_rx and then
                    // the supervisor will likely try reconnecting unless you gate it.
                    // If you want DESTROY to stop reconnecting, add a flag in state.
                    if let Some(ws) = ws_cell.borrow().as_ref() {
                        let _ = ws.close();
                    }
                    break;
                }

                _ => todo!(),
            }
        }
    }

    // Creates a WebSocket connection and waits for it to open
    async fn create_websocket_client_connection(
        address: Url,
        state: Arc<Mutex<ComInterfaceStateWrapper>>,
    ) -> Result<web_sys::WebSocket, InterfaceCreateError> {
        let ws = web_sys::WebSocket::new(address.as_ref()).map_err(
            |_: wasm_bindgen::JsValue| {
                InterfaceCreateError::InterfaceOpenFailed
            },
        )?;
        ws.set_binary_type(web_sys::BinaryType::Arraybuffer);
        let (open_tx, open_rx) = oneshot::channel::<()>();
        let (fail_tx, fail_rx) = oneshot::channel::<InterfaceCreateError>();

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
                        ComInterfaceError::connection_error_with_details(
                            e.to_string(),
                        )
                        .into(),
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
                        ComInterfaceError::connection_error_with_details(
                            "Closed before open",
                        )
                        .into(),
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
        let mut shutdown_receiver = state.lock().unwrap().shutdown_receiver();
        // futures::pin_mut!(shutdown_receiver);

        select! {
            _ = open_rx.fuse() => Ok(ws),
            stop = shutdown_receiver.wait().fuse() => {
                // Close the socket to avoid dangling connection attempt
                let _ = ws.close();
                Err(InterfaceCreateError::InterfaceError(ComInterfaceError::connection_error_with_details(
                    "Creation cancelled due to shutdown",
                )))
            },
            err = fail_rx.fuse() => Err(err.unwrap_or(ComInterfaceError::connection_error().into())),
            _ = timeout.fuse() => {
                // Close the socket to avoid dangling connection attempt
                let _ = ws.close();
                Err(InterfaceCreateError::Timeout)
            }
        }
    }

    /// Read task - handles incoming messages and close events
    async fn read_task(
        ws: web_sys::WebSocket,
        incoming_tx: UnboundedSender<Vec<u8>>,
        mut close_tx: Option<oneshot::Sender<()>>,
    ) {
        let mut incoming_tx_clone = incoming_tx.clone();
        let onmessage =
            Closure::wrap(Box::new(move |e: web_sys::MessageEvent| {
                if let Ok(abuf) = e.data().dyn_into::<js_sys::ArrayBuffer>() {
                    let array = js_sys::Uint8Array::new(&abuf);
                    let mut data = vec![0; array.byte_length() as usize];
                    array.copy_to(&mut data[..]);
                    let _ = incoming_tx_clone.start_send(data);
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
    }
}

impl ComInterfaceAsyncFactory for WebSocketClientJSInterfaceSetupData {
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
            interface_type: "websocket-client".to_string(),
            channel: "websocket".to_string(),
            round_trip_time: Duration::from_millis(40),
            max_bandwidth: 1000,
            ..InterfaceProperties::default()
        }
    }
}
