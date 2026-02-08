use futures::StreamExt;
use wasm_bindgen::{JsCast, JsValue, prelude::Closure};
mod io;
use datex::runtime::Runtime;
use futures_channel::mpsc;
use js_sys::Uint8Array;
use wasm_bindgen_futures::spawn_local;

use crate::lsp::io::{Reader, Writer};

pub fn start_lsp(
    runtime: Runtime,
    send_to_js: js_sys::Function,
) -> js_sys::Function {
    let (tx_to_lsp, rx_from_js) = mpsc::unbounded::<Vec<u8>>();
    let (tx_to_js, mut rx_from_lsp) = mpsc::unbounded::<Vec<u8>>();

    let reader = Reader::new(rx_from_js);
    let writer = Writer::new(tx_to_js);

    spawn_local(async move {
        use datex::lsp::create_lsp;
        create_lsp(runtime, reader, writer).await;
    });

    spawn_local(async move {
        while let Some(bytes) = rx_from_lsp.next().await {
            let js_array = Uint8Array::from(bytes.as_slice());
            if let Err(err) = send_to_js.call1(&JsValue::NULL, &js_array) {
                log::error!("Error sending data to JS: {:?}", err);
            }
        }
    });

    let send_to_rust_closure =
        Closure::wrap(Box::new(move |data: Uint8Array| {
            let vec = data.to_vec();
            tx_to_lsp.unbounded_send(vec).unwrap();
        }) as Box<dyn FnMut(Uint8Array)>);

    send_to_rust_closure.into_js_value().unchecked_into()
}
