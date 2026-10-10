use core::fmt::{Debug, Display};
use core::cell::RefCell;
use datex_core::{
    dif::serde_context::SerdeContext,
    runtime::cache::shared_values_cache::SharedValuesCache,
    values::value_container::ValueContainer,
};
use datex_core::runtime::cache::shared_references_cache::SharedReferencesCache;
use datex_core::dif::deserialize_with_serde_context::DeserializeWithSerdeContext;
use datex_core::dif::serialize_with_serde_context::SerializeWithSerdeContext;
use datex_core::traits::convert_value_container::ConvertValueContainer;
use serde::Deserialize;
use wasm_bindgen::{JsError, JsValue};
use web_sys::js_sys::{self, Array, ArrayBuffer, Object, Reflect};

pub trait TryAsByteSlice {
    fn try_as_u8_slice(&self) -> Result<Vec<u8>, JsError>;
}

/// Reports a JavaScript error to the console with a given message.
pub fn report_js_error(err: &str) {
    log::error!("JavaScript error: {}", err);
}

/// Unwraps a Result, and if it's an Err, reports it as a JavaScript error and returns None.
/// Works for errors that implement Display
pub fn unwrap_or_report_js_error_display<T, E: Display>(
    result: Result<T, E>,
) -> Option<T> {
    match result {
        Ok(value) => Some(value),
        Err(err) => {
            report_js_error(&err.to_string());
            None
        }
    }
}

/// Unwraps a Result, and if it's an Err, reports it as a JavaScript error and returns None.
/// Works for errors that implement Debug
pub fn unwrap_or_report_js_error_debug<T, E: Debug>(
    result: Result<T, E>,
) -> Option<T> {
    match result {
        Ok(value) => Some(value),
        Err(err) => {
            report_js_error(&format!("{:?}", err));
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

/// Converts a JSValue to a deserializable value
pub fn deserializable_from_js_value<'de, T>(
    value: impl Into<JsValue>,
) -> Result<T, JsError>
where
    T: Deserialize<'de>,
{
    T::deserialize(serde_wasm_bindgen::Deserializer::from(value.into()))
        .map_err(js_error)
}

/// Convert a DIF format JsValue to a concrete type [T],
/// using the DIF cache for resolving shared containers
pub fn from_js_dif<'de, T: DeserializeWithSerdeContext<'de>>(
    value: impl Into<JsValue>,
    value_cache: &RefCell<SharedValuesCache>,
) -> Result<T, JsError> {
    let ctx = SerdeContext::new(value_cache);
    T::deserialize_with_ctx(
        &ctx,
        serde_wasm_bindgen::Deserializer::from(value.into())
    )
    .map_err(js_error)
}

/// Convert a DIF format JsValue to a [ValueContainer] and then to a concrete type [T] using the [ConvertValueContainer] trait,
/// using the DIF cache for resolving shared containers
pub fn from_js_dif_value_container<'de, T: ConvertValueContainer>(
    value: impl Into<JsValue>,
    value_cache: &RefCell<SharedValuesCache>,
) -> Result<T, JsError> {
    let value_container: ValueContainer = from_js_dif(value, value_cache)?;
    Ok(T::try_cast_from_value_container(value_container))
}

/// Convert a DIF-serializable Rust value (e.g. [Value], [ValueContainer]) to a JsValue, using the DIF cache for resolving shared containers
pub fn to_js_dif<T>(
    value: &T,
    cache: &RefCell<SharedValuesCache>,
) -> JsValue
where
    T: SerializeWithSerdeContext,
{
    let context = SerdeContext::new(cache);
    value
        .serialize_with_ctx(&context, &serde_wasm_bindgen::Serializer::json_compatible())
        .unwrap()
}

/// Convert a [ConvertValueContainer] to a value container and serializes
/// the value container to a JsValue in the DIF format.
pub fn to_js_dif_value_container<T: ConvertValueContainer>(
    value: T,
    cache: &RefCell<SharedValuesCache>,
) -> JsValue {
    to_js_dif(&value.to_value_container(), cache)
}

/**
 * Convert an optional ValueContainer to an optional JsValue in the DIF format:
 *  * no result (None) is represented as null
 *  * a result (Some) is represented as [value] (wrapped in an array to differentiate from null)
 */
pub fn optional_value_container_to_optional_js_dif_value(
    value: Option<ValueContainer>,
    cache: &RefCell<SharedValuesCache>,
) -> JsValue {
    match value {
        Some(value) => {
            let inner_value =
                to_js_dif(&value, cache);
            // wrap in array
            js_array(&[inner_value])
        }
        None => JsValue::NULL,
    }
}