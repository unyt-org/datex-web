use std::{cell::RefCell, rc::Rc};

use crate::define_registry;
use datex_core::network::com_hub::InterfacePriority;
use datex_core::network::com_interfaces::{
    com_interface::ComInterface,
    default_com_interfaces::webrtc::matchbox_client_interface::MatchboxClientInterface,
};
use log::error;
use wasm_bindgen::{prelude::wasm_bindgen, JsError, JsValue};
use wasm_bindgen_futures::future_to_promise;
use web_sys::js_sys::Promise;

define_registry!(MatchboxClientRegistry, MatchboxClientInterface);

#[wasm_bindgen]
impl MatchboxClientRegistry {
    pub async fn register(&self, address: String) -> Promise {
        let com_hub = self.runtime.com_hub().clone();
        let address_clone = address.clone();
        future_to_promise(async move {
            let mut webrtc_interface =
                MatchboxClientInterface::new_reliable(&address_clone, None)
                    .map_err(|e| JsError::new(&format!("{e:?}")))?;
            webrtc_interface.open().await.map_err(|e| {
                error!("Failed to open WebRTC interface: {e:?}");
                JsError::new(&format!("{e:?}"))
            })?;
            let interface_uuid = webrtc_interface.get_uuid().clone();
            com_hub
                .add_interface(
                    Rc::new(RefCell::new(webrtc_interface)),
                    InterfacePriority::default(),
                )
                .map_err(|e| JsError::new(&format!("{e:?}")))?;
            Ok(JsValue::from_str(&interface_uuid.0.to_string()))
        })
    }
}
