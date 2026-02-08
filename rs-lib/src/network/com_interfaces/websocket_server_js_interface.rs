use datex::network::{
    com_hub::managers::interface_manager::ComInterfaceAsyncFactoryResult,
    com_interfaces::com_interface::{
        ComInterfaceProxy, implementation::ComInterfaceAsyncFactory,
        properties::InterfaceProperties,
    },
};
use serde::{Deserialize, Serialize};
use std::{
    cell::RefCell, collections::HashMap, future::Future, ops::Deref, pin::Pin,
    rc::Rc, sync::Mutex, time::Duration,
};
// FIXME no-std

use datex::network::com_interfaces::default_com_interfaces::websocket::websocket_common::{WebSocketClientInterfaceSetupData, WebSocketError, WebSocketServerError, WebSocketServerInterfaceSetupData};
use datex::stdlib::sync::Arc;

use crate::{define_registry, network::com_hub::JSComHub, wrap_error_for_js};
use datex_macros::{com_interface, create_opener};
use log::{debug, error, info};
use wasm_bindgen::{
    JsCast, JsError, JsValue,
    prelude::{Closure, wasm_bindgen},
};
use web_sys::{ErrorEvent, MessageEvent, js_sys};

wrap_error_for_js!(JSWebSocketServerError, datex::network::com_interfaces::default_com_interfaces::websocket::websocket_common::WebSocketServerError);

#[derive(Serialize, Deserialize)]
pub struct WebSocketServerInterfaceSetupDataJS(
    WebSocketServerInterfaceSetupData,
);
impl Deref for WebSocketServerInterfaceSetupDataJS {
    type Target = WebSocketServerInterfaceSetupData;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl WebSocketServerInterfaceSetupDataJS {
    fn open(&mut self) -> Result<(), ()> {
        Ok(())
    }

    pub fn register_socket(
        &mut self,
        web_socket: web_sys::WebSocket,
    ) -> ComInterfaceSocketUUID {
        let interface_uuid = self.get_uuid().clone();
        let socket = ComInterfaceSocket::new(
            interface_uuid,
            InterfaceDirection::InOut,
            1,
        );
        let socket_uuid = socket.uuid.clone();
        self.add_socket(Arc::new(Mutex::new(socket)));

        web_socket.set_binary_type(web_sys::BinaryType::Arraybuffer);

        let on_message = self.create_onmessage_callback(socket_uuid.clone());
        web_socket.set_onmessage(Some(on_message.as_ref().unchecked_ref()));

        let on_error = self.create_onerror_callback(socket_uuid.clone());
        web_socket.set_onerror(Some(on_error.as_ref().unchecked_ref()));

        let on_close = self.create_onclose_callback(socket_uuid.clone());
        web_socket.set_onclose(Some(on_close.as_ref().unchecked_ref()));

        on_message.forget();
        on_error.forget();
        on_close.forget();
        self.sockets.insert(socket_uuid.clone(), web_socket);
        socket_uuid
    }

    fn create_onmessage_callback(
        &mut self,
        socket_uuid: ComInterfaceSocketUUID,
    ) -> Closure<dyn FnMut(MessageEvent)> {
        let sockets = self.get_sockets().clone();
        Closure::new(move |e: MessageEvent| {
            let sockets = sockets.clone();
            let sockets = sockets.lock().unwrap();
            let socket = sockets.sockets.get(&socket_uuid).unwrap();
            let receive_queue = socket.lock().unwrap().receive_queue.clone();
            if let Ok(abuf) = e.data().dyn_into::<js_sys::ArrayBuffer>() {
                let array = js_sys::Uint8Array::new(&abuf);
                receive_queue.lock().unwrap().extend(array.to_vec());
            } else {
                info!("message event, received Unknown: {:?}", e.data());
            }
        })
    }

    fn create_onerror_callback(
        &self,
        socket_uuid: ComInterfaceSocketUUID,
    ) -> Closure<dyn FnMut(ErrorEvent)> {
        Closure::new(move |e: ErrorEvent| {
            error!("Socket error event: {:?} {}", e.message(), socket_uuid);
        })
    }

    fn create_onclose_callback(
        &mut self,
        socket_uuid: ComInterfaceSocketUUID,
    ) -> Closure<dyn FnMut()> {
        let sockets = self.get_sockets().clone();
        Closure::new(move || {
            let mut sockets = sockets.lock().unwrap();
            sockets.sockets.remove(&socket_uuid);
        })
    }
}

impl ComInterfaceAsyncFactory for WebSocketServerInterfaceSetupDataJS {
    // TODO: how to handle create and bind to Deno.serve?
    fn create_interface(
        self,
        com_interface_proxy: ComInterfaceProxy,
    ) -> ComInterfaceAsyncFactoryResult {
        todo!()
    }

    fn get_default_properties() -> InterfaceProperties {
        InterfaceProperties {
            interface_type: "websocket-server".to_string(),
            channel: "websocket".to_string(),
            round_trip_time: Duration::from_millis(40),
            max_bandwidth: 1000,
            ..InterfaceProperties::default()
        }
    }
}

impl ComInterface for WebSocketServerJSInterface {
    fn send_block<'a>(
        &'a mut self,
        block: &'a [u8],
        socket_uuid: ComInterfaceSocketUUID,
    ) -> Pin<Box<dyn Future<Output = bool> + 'a>> {
        Box::pin(async move {
            debug!("Sending block: {block:?}");
            self.sockets
                .get(&socket_uuid)
                .ok_or_else(|| {
                    error!("Socket not found: {socket_uuid:?}");
                    WebSocketError::SendError
                })
                .and_then(|socket| {
                    socket.send_with_u8_array(block).map_err(|e| {
                        error!("Error sending message: {e:?}");
                        WebSocketError::SendError
                    })
                })
                .is_ok()
        })
    }

    fn init_properties(&self) -> InterfaceProperties {
        InterfaceProperties {
            // TODO: full address
            name: Some(self.port.to_string()),
            ..Self::get_default_properties()
        }
    }
    fn handle_close<'a>(
        &'a mut self,
    ) -> Pin<Box<dyn Future<Output = bool> + 'a>> {
        for (_, socket) in self.sockets.iter() {
            // FIXME
            // Do we have to remove the event listeners here
            // or is this done automatically when the socket is closed?
            let _ = socket.close().is_ok();
        }
        Box::pin(async move { true })
    }
}

#[wasm_bindgen]
impl JSComHub {
    pub fn websocket_server_interface_add_socket(
        &self,
        interface_uuid: String,
        websocket: web_sys::WebSocket,
    ) -> Result<String, JSWebSocketServerError> {
        let interface = self
            .get_interface_for_uuid::<WebSocketServerJSInterface>(
                interface_uuid,
            )?;

        Ok(interface
            .borrow_mut()
            .register_socket(websocket)
            .to_string())
    }
}
