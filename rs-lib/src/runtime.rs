use crate::{
    dif::JSDIFInterface,
    js_utils::{from_js_dif, js_array, js_error},
    network::com_hub::JSComHub,
};
use datex_core::{
    self,
    values::{
        core_values::endpoint::Endpoint, value::Value,
        value_container::ValueContainer,
    },
};
use datex_facades::crypto::Crypto;
use log::info;
use std::{borrow::Cow, ops::Deref};

use crate::js_utils::{
    from_js_dif_value_container,
    optional_value_container_to_optional_js_dif_value, to_js_dif,
};
use datex_core::{
    compiler::{
        CompileOptions, compilation_result::CompilationResult, compile_template,
    },
    core_compiler::core_compilation_context::DXBWithSharedValues,
    crypto::CryptoImpl,
    decompiler::{DecompileOptions, ast_to_source_code::value_to_source_code},
    dif::dif_interface::DIFInterface,
    runtime::{
        Runtime, RuntimeConfig, RuntimeInternal, RuntimeRunner,
        cache::{
            shared_references_cache::SharedReferencesCache,
            shared_values_cache::SharedValuesCache,
        },
        execution::{
            context::{ExecutionContext, RemoteExecutionTarget},
            remote_execution_options::RemoteExecutionOptions,
        },
    },
};
use indexmap::IndexMap;
use serde_wasm_bindgen::from_value;
use std::{cell::RefCell, fmt::Display, ops::DerefMut, rc::Rc, str::FromStr};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::{future_to_promise, spawn_local};
use web_sys::js_sys::Promise;

#[wasm_bindgen(getter_with_clone)]
#[derive(Clone)]
pub struct JSRuntime {
    runtime: Runtime,
    pub com_hub: JSComHub,
    dif_interface: JSDIFInterface,
}

/**
 * Internal impl of the JSRuntime, not exposed to JavaScript
 */
impl JSRuntime {
    pub fn runtime(&self) -> &Runtime {
        &self.runtime
    }

    pub(crate) async fn run(
        config: JsValue,
        device_type: String,
        versions: IndexMap<String, String>,
    ) -> JSRuntime {
        let config: RuntimeConfig = from_js_dif_value_container(
            config,
            &RefCell::new(SharedValuesCache::default()),
            &RefCell::new(SharedReferencesCache::default()),
        )
        .unwrap();
        info!(
            "Initializing runtime with config: {}",
            value_to_source_code(&config, DecompileOptions::colorized_pretty(),),
        );
        let runtime_runner = RuntimeRunner::new(
            config,
            datex_core::runtime::CustomRuntimeInfo {
                device_type: Some(device_type),
                other_versions: versions,
            },
        );
        // Note: JSRuntime::new must be called before runtime run to initialize com interface factories
        let js_runtime = JSRuntime::new(runtime_runner.runtime.clone());

        let (initialized_sender, initialized_receiver) =
            futures::channel::oneshot::channel();

        spawn_local(async {
            runtime_runner
                .run_forever(async |_| {
                    // Runtime is initialized and ready to use, we can now resolve the promise and return the JSRuntime instance to JavaScript
                    let _ = initialized_sender.send(());
                })
                .await;
        });
        initialized_receiver.await.unwrap();
        js_runtime
    }

    fn new(runtime: Runtime) -> JSRuntime {
        let dif_interface = JSDIFInterface::new(
            runtime.clone(),
            runtime.create_dif_interface(),
        );
        let com_hub =
            JSComHub::new(runtime.clone(), dif_interface.dif_interface_rc());
        JSRuntime {
            runtime,
            com_hub,
            dif_interface,
        }
    }
}

/**
 * Exposed properties and methods for JavaScript
 */
#[wasm_bindgen]
impl JSRuntime {
    #[wasm_bindgen(getter)]
    pub fn version(&self) -> String {
        self.runtime.version().to_string()
    }

    #[wasm_bindgen(getter)]
    pub fn endpoint(&self) -> String {
        self.runtime.endpoint().to_string()
    }

    /// Execute a DATEX script with optional inserted values, returning the result as a string
    pub async fn execute_with_string_result(
        &self,
        script: &str,
        inserted_values: Option<Vec<JsValue>>,
        decompile_options: JsValue,
        mark_as_debug: bool,
    ) -> Result<String, JsError> {
        let decompile_options: DecompileOptions = from_js_dif_value_container(
            decompile_options,
            self.dif_interface.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        )
        .unwrap_or_default();

        let val = &self.js_values_to_value_containers(inserted_values)?;
        let result = self
            .runtime
            .execute(script, val, None::<ExecutionContext>, mark_as_debug)
            .await
            .map_err(js_error)?;
        match result {
            None => Ok("".to_string()),
            Some(result) => {
                Ok(value_to_source_code(&result, decompile_options))
            }
        }
    }

    /// Executes a DATEX script with inserted values, returning the result as DIFValue
    pub async fn execute(
        &self,
        script: &str,
        inserted_values: Option<Vec<JsValue>>,
        mark_as_debug: bool,
    ) -> Result<JsValue, JsError> {
        let result = self
            .runtime
            .execute(
                script,
                &self.js_values_to_value_containers(inserted_values)?,
                None::<ExecutionContext>,
                mark_as_debug,
            )
            .await
            .map_err(js_error)?;
        Ok(optional_value_container_to_optional_js_dif_value(
            result,
            self.dif_interface.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        ))
    }

    /// Executes a DATEX script remotely with inserted values, returning the result as DIFValue
    pub async fn execute_remote(
        &self,
        target: String,
        script: &str,
        inserted_values: Option<Vec<JsValue>>,
        mark_as_debug: bool,
    ) -> Result<JsValue, JsError> {
        let target_endpoint = Endpoint::from_str(&target).map_err(|e| {
            JsError::new(&format!("Invalid target endpoint: {}", e))
        })?;

        let dxb = self.compile_script_with_values(script, inserted_values)?;

        let result = self
            .runtime
            .execute_remote_single_receiver(
                &RemoteExecutionTarget::new(vec![target_endpoint]),
                dxb,
                RemoteExecutionOptions {
                    mark_as_debug,
                    is_end_of_context: true,
                },
            )
            .await
            .map_err(js_error)?;
        Ok(optional_value_container_to_optional_js_dif_value(
            result,
            self.dif_interface.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        ))
    }

    pub fn execute_sync_with_string_result(
        &self,
        script: &str,
        dif_values: Option<Vec<JsValue>>,
        decompile_options: JsValue,
    ) -> Result<String, JsError> {
        let decompile_options: DecompileOptions = from_js_dif_value_container(
            decompile_options,
            self.dif_interface.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        )
        .unwrap_or_default();

        let input = self
            .runtime
            .execute_sync(
                script,
                &self.js_values_to_value_containers(dif_values)?,
                None::<ExecutionContext>,
            )
            .map_err(js_error)?;
        match input {
            None => Ok("".to_string()),
            Some(result) => {
                Ok(value_to_source_code(&result, decompile_options))
            }
        }
    }

    pub fn execute_sync(
        &self,
        script: &str,
        dif_values: Option<Vec<JsValue>>,
    ) -> Result<JsValue, JsError> {
        let result = self
            .runtime
            .execute_sync(
                script,
                &self.js_values_to_value_containers(dif_values)?,
                None::<ExecutionContext>,
            )
            .map_err(js_error)?;
        Ok(optional_value_container_to_optional_js_dif_value(
            result,
            self.dif_interface.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        ))
    }

    pub fn value_to_string(
        &self,
        dif_value: JsValue,
        decompile_options: JsValue,
    ) -> Result<String, JsError> {
        let value_container = self.js_value_to_value_container(dif_value)?;
        let decompile_options =
            from_js_dif_value_container::<Option<DecompileOptions>>(
                decompile_options,
                self.dif_interface.shared_values_cache(),
                self.runtime.shared_references_cache_refcell(),
            )
            .expect("DecompileOptions are invalid")
            .unwrap_or_default();
        Ok(value_to_source_code(&value_container, decompile_options))
    }

    /// Converts a list of [JsValue]s to a list of [ValueContainer], using the DIF cache for resolving shared containers if necessary
    fn js_values_to_value_containers(
        &self,
        js_values: Option<Vec<JsValue>>,
    ) -> Result<Vec<ValueContainer>, JsError> {
        js_values
            .unwrap_or_default()
            .into_iter()
            .map(|js_value| self.js_value_to_value_container(js_value))
            .collect()
    }

    /// Convert a [JsValue] (DIFValue) to a ValueContainer
    /// Returns an error if the [JsValue] cannot be converted to a [ValueContainer]
    fn js_value_to_value_container(
        &self,
        value: JsValue,
    ) -> Result<ValueContainer, JsError> {
        from_js_dif::<ValueContainer>(
            value,
            self.dif_interface.shared_values_cache(),
            self.runtime.shared_references_cache_refcell(),
        )
    }

    /// Get a handle to the DIF interface of the runtime
    pub fn dif_interface(&self) -> JSDIFInterface {
        self.dif_interface.clone()
    }

    /// Compiles a DATEX script with optional inserted values to a DXB body
    pub async fn compile(
        &self,
        script: &str,
        inserted_values: Option<Vec<JsValue>>,
    ) -> Result<Vec<u8>, JsError> {
        // TODO: handle dxb.values?
        self.compile_script_with_values(script, inserted_values)
            .map(|res| res.dxb)
    }

    fn compile_script_with_values(
        &self,
        script: &str,
        inserted_values: Option<Vec<JsValue>>,
    ) -> Result<DXBWithSharedValues, JsError> {
        let CompilationResult {
            dxb_with_shared_values,
            ..
        } = compile_template(
            script,
            self.js_values_to_value_containers(inserted_values)?
                .into_iter()
                .map(Some)
                .collect::<Vec<_>>(),
            CompileOptions::default(),
            self.runtime.clone(),
        )
        .map_err(js_error)?;

        Ok(dxb_with_shared_values)
    }

    /// Start the LSP server, returning a JS function to send messages to Rust
    #[cfg(feature = "lsp")]
    pub fn start_lsp(&self, send_to_js: js_sys::Function) -> js_sys::Function {
        use crate::lsp::start_lsp;
        start_lsp(self.runtime.clone(), send_to_js)
    }
}

#[cfg(test)]
mod tests {}
