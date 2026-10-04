use core::fmt::{Debug, Display};
use core::cell::RefCell;
use datex_core::{
    dif::serde_context::SerdeContext,
    runtime::cache::shared_values_cache::SharedValuesCache,
    values::value_container::ValueContainer,
};
use datex_core::preludes::derive::ConvertValueContainer;
use datex_core::runtime::cache::shared_references_cache::SharedReferencesCache;
use datex_core::dif::deserialize_with_serde_context::DeserializeWithSerdeContext;
use datex_core::dif::serialize_with_serde_context::SerializeWithSerdeContext;
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

/// Converts a JSValue to a DIF-serializable Rust value (e.g. [Value], [ValueContainer])
pub fn from_js_value<'de, T>(
    value: impl Into<JsValue>,
    cache: &RefCell<SharedValuesCache>,
) -> Result<T, JsError>
where
    T: DeserializeWithSerdeContext<'de>,
{
    let context = SerdeContext::new(cache);
    DeserializeWithSerdeContext::deserialize_with_ctx(
        &context,
        serde_wasm_bindgen::Deserializer::from(value.into()),
    )
    .map_err(js_error)
}

/// Convert a DIF format JsValue to a #[Datex] struct
pub fn from_dif_js_value<T: ConvertValueContainer>(
    value: impl Into<JsValue>,
    cache: &RefCell<SharedValuesCache>,
) -> Result<T, JsError> {
    let value_container: ValueContainer = from_js_value(value, cache)?;
    value_container.try_into_value::<T>().map_err(|e| {
        js_error(format!(
            "Failed to convert ValueContainer to target type: {:?}",
            e
        ))
    })
}

/// Convert a DIF-serializable Rust value (e.g. [Value], [ValueContainer]) to a JsValue, using the DIF cache for resolving shared containers
pub fn to_js_value<T>(
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

/// Convert a serializable #[Datex] struct to a JsValue, using the DIF cache for resolving shared containers
pub fn to_dif_js_value<T: ConvertValueContainer>(
    value: T,
    cache: &RefCell<SharedValuesCache>,
) -> JsValue {
    to_js_value(&value.to_value_container(&mut SharedReferencesCache::default()), cache)
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
                to_js_value(&value, cache);
            // wrap in array
            js_array(&[inner_value])
        }
        None => JsValue::NULL,
    }
}