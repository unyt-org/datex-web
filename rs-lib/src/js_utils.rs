use std::cell::RefCell;

use datex::{
    dif::value::{DIFReferenceNotFoundError, DIFValueContainer},
    runtime::memory::Memory,
    serde::deserializer::from_value_container,
    values::value_container::ValueContainer,
};
use log::info;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_wasm_bindgen::{Error, from_value};
use wasm_bindgen::{JsError, JsValue};
use web_sys::js_sys::{self, Array, ArrayBuffer, Object, Reflect};

pub trait TryAsByteSlice {
    fn try_as_u8_slice(&self) -> Result<Vec<u8>, JsError>;
}

pub trait AsByteSlice {
    fn as_u8_slice(&self) -> Vec<u8>;
}

impl TryAsByteSlice for JsValue {
    fn try_as_u8_slice(&self) -> Result<Vec<u8>, JsError> {
        let buffer: ArrayBuffer = self.clone().try_into().map_err(|_| {
            JsError::new("Failed to convert JsValue to ArrayBuffer")
        })?;

        Ok(buffer.as_u8_slice())
    }
}

impl AsByteSlice for ArrayBuffer {
    fn as_u8_slice(&self) -> Vec<u8> {
        let uint8_array = js_sys::Uint8Array::new(self);
        let mut bytes = vec![0; uint8_array.length() as usize];
        uint8_array.copy_to(&mut bytes);
        bytes
    }
}

pub fn js_object<T: Into<JsValue>>(values: Vec<(&str, T)>) -> Object {
    let obj = Object::new();
    for (key, value) in values {
        let js_value: JsValue = value.into();
        let _ = Reflect::set(&obj, &key.into(), &js_value);
    }
    obj
}

pub fn js_array<T>(values: &[T]) -> JsValue
where
    T: Into<JsValue> + Clone,
{
    // FIXME TODO can we avoid clone here?
    let js_array = values
        .iter()
        .map(|x| <T as Into<JsValue>>::into(x.clone()))
        .collect::<Array>();

    JsValue::from(js_array)
}

pub fn js_error<T: std::fmt::Display>(err: T) -> JsError {
    JsError::new(&err.to_string())
}

trait ToJsError<T> {
    fn js(self) -> Result<T, JsError>;
}

impl<T, E: std::error::Error + 'static> ToJsError<T> for Result<T, E> {
    fn js(self) -> Result<T, JsError> {
        self.map_err(js_error)
    }
}

/// Deserialize a JsValue into a Rust type T using DIFValueContainer as an intermediary,
pub fn cast_from_dif_js_value<T>(
    value: JsValue,
    memory: &RefCell<Memory>,
) -> Result<T, ()>
where
    T: DeserializeOwned,
{
    let unresolved_value_container: DIFValueContainer = from_value(value)
        .expect("Failed to deserialize JsValue to DIFValueContainer");

    let value_container = unresolved_value_container
        .to_value_container(memory)
        .map_err(|_| ())?;

    from_value_container::<T>(&value_container).map_err(|e| {
        info!("Deserialization error: {}", e);
        ()
    })
}

/// Converts a JsValue to a DIFValueContainer using the provided Memory instance.
pub fn dif_js_value_to_value_container(
    value: JsValue,
    memory: &RefCell<Memory>,
) -> Result<ValueContainer, DIFReferenceNotFoundError> {
    let unresolved_value_container: DIFValueContainer = from_value(value)
        .expect("Failed to deserialize JsValue to DIFValueContainer");
    unresolved_value_container.to_value_container(memory)
}

pub fn value_container_to_dif_js_value(
    value_container: &ValueContainer,
    memory: &RefCell<Memory>,
) -> JsValue {
    let dif_value_container =
        DIFValueContainer::from_value_container(&value_container, memory);
    to_js_value(&dif_value_container)
        .expect("Failed to serialize DIFValueContainer to JsValue")
}

/// Convert a serializable value to a JsValue (JSON compatible)
pub fn to_js_value<T: Serialize>(value: &T) -> Result<JsValue, Error> {
    value.serialize(&serde_wasm_bindgen::Serializer::json_compatible())
}
