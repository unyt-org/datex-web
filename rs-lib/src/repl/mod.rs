use datex_core::runtime::execution::context::{
    ExecutionContext, ExecutionMode,
};
use wasm_bindgen::{JsError, JsValue, prelude::wasm_bindgen};

use crate::{js_utils::js_error, runtime::JSRuntime};

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
                runtime.runtime().internal(),
            )
        } else {
            ExecutionContext::local(
                ExecutionMode::unbounded(),
                runtime.runtime().internal(),
            )
        };

        Self {
            runtime: runtime.clone(),
            execution_context,
        }
    }

    pub async fn execute(&mut self, script: &str) -> Result<JsValue, JsError> {
        let result = self
            .runtime
            .runtime()
            .execute(script, &[], Some(&mut self.execution_context))
            .await
            .map_err(js_error)?;
        Ok(self.runtime.maybe_value_container_to_dif(result))
    }
}
