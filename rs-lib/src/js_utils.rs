use datex_core::{
    dif::{cache::DIFSharedContainerCache, serde_context::SerdeContext},
    utils::serde_serialized_owned::SerializeSeedOwned,
};
use serde::{
    Serialize,
    de::{DeserializeOwned, DeserializeSeed},
};
use wasm_bindgen::{JsError, JsValue};
use web_sys::js_sys::{self, Array, ArrayBuffer, Object, Reflect};

pub trait TryAsByteSlice {
    fn try_as_u8_slice(&self) -> Result<Vec<u8>, JsError>;
}

/// Reports a JavaScript error to the console with a given message.
pub fn report_js_error<T: std::fmt::Display>(err: T) {
    let js_error = JsError::new(&err.to_string());
    log::error!("JavaScript error: {:?}", js_error);
}

/// Unwraps a Result, and if it's an Err, reports it as a JavaScript error and returns None.
pub fn unwrap_or_report_js_error<T, E: std::error::Error + 'static>(
    result: Result<T, E>,
) -> Option<T> {
    match result {
        Ok(value) => Some(value),
        Err(err) => {
            report_js_error(err);
            None
        }
    }
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

/// Convert a serializable value to a JsValue (JSON compatible)
pub fn to_js_value<T: Serialize>(value: &T) -> Result<JsValue, JsError> {
    value
        .serialize(&serde_wasm_bindgen::Serializer::json_compatible())
        .map_err(|e| js_error(e.to_string()))
}

/// Convert a JsValue to a deserializable Rust type
pub fn from_js_value<T: DeserializeOwned>(
    value: impl Into<JsValue>,
) -> Result<T, JsError> {
    T::deserialize(serde_wasm_bindgen::Deserializer::from(value.into()))
        .map_err(js_error)
}

/// Convert a JsValue to a deserializable Rust type, using the DIF cache for resolving shared containers
pub fn from_js_value_with_cache<'ctx, T>(
    value: JsValue,
    cache: &'ctx mut DIFSharedContainerCache,
) -> Result<T, JsError>
where
    SerdeContext<'ctx, T>: DeserializeSeed<'ctx, Value = T>,
{
    let context = SerdeContext::new(cache);
    DeserializeSeed::deserialize(
        context,
        serde_wasm_bindgen::Deserializer::from(value),
    )
    .map_err(js_error)
}

/// Convert a serializable Rust value to a JsValue, using the DIF cache for resolving shared containers
pub fn to_js_value_with_cache<'ctx, T>(
    value: T,
    cache: &'ctx mut DIFSharedContainerCache,
) -> Result<JsValue, JsError>
where
    T: SerializeSeedOwned,
    SerdeContext<'ctx, T>: SerializeSeedOwned<Value = T>,
{
    let mut context = SerdeContext::<T>::new(cache);
    context
        .serialize_owned(
            value,
            &serde_wasm_bindgen::Serializer::json_compatible(),
        )
        .map_err(|e| js_error(e.to_string()))
}
