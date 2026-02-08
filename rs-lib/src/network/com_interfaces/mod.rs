pub mod base_interface;

#[cfg(feature = "wasm_serial")]
pub mod serial_js_interface;
// #[cfg(feature = "wasm_webrtc")]
// pub mod webrtc_js_interface;
// #[cfg(feature = "wasm_websocket_client")]
// pub mod websocket_client_js_interface;

#[cfg(feature = "wasm_websocket_server")]
pub mod websocket_server_js_interface;
