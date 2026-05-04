use datex_core::runtime::execution::context::{
    ExecutionContext, ExecutionMode,
};
use datex_core::runtime::execution::execution_input::ExecutionCallerMetadata;
use wasm_bindgen::{JsError, JsValue, prelude::wasm_bindgen};

use crate::{js_utils::js_error, runtime::JSRuntime};
use crate::js_utils::{to_js_value, to_js_value_with_cache};

#[wasm_bindgen]
pub struct Repl {
    runtime: JSRuntime,
    execution_context: ExecutionContext,
}

#[wasm_bindgen]
impl Repl {
    #[wasm_bindgen(constructor)]
    pub fn new(runtime: &JSRuntime, verbose: bool) -> Self {
        let execution_context = if verbose {
            ExecutionContext::local_debug(
                ExecutionMode::unbounded(),
                runtime.runtime().clone(),
                ExecutionCallerMetadata::local_default()
            )
        } else {
            ExecutionContext::local(
                ExecutionMode::unbounded(),
                runtime.runtime().clone(),
                ExecutionCallerMetadata::local_default()
            )
        };

        Self {
            runtime: runtime.clone(),
            execution_context,
        }
    }

    pub async fn execute(&mut self, script: &str) -> Result<Option<JsValue>, JsError> {
        let result = self
            .runtime
            .runtime()
            .execute(script, &[], Some(&mut self.execution_context))
            .await
            .map_err(js_error)?;
        result.map(|v| to_js_value_with_cache(&v, &mut self.runtime.dif_interface.cache())).transpose()
    }
}
