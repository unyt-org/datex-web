use datex_core::references::reference::Reference;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct JSPointer {
    reference: Reference,
}

/**
 * Internal impl of the JSRuntime, not exposed to JavaScript
 */
impl JSPointer {
    pub fn new(reference: Reference) -> JSPointer {
        JSPointer { reference }
    }
}

/**
 * Exposed properties and methods for JavaScript
 */
#[wasm_bindgen]
impl JSPointer {}
