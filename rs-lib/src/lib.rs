#![feature(gen_blocks)]
#![feature(async_iterator)]

extern crate core;

use std::sync::Once;

use serde_wasm_bindgen::from_value;
// use datex_cli_core::CLI;

use datex_core::{
    compiler::{CompileOptions, compile_script, compile_template},
    decompiler::decompile_body,
    runtime::execution::{ExecutionInput, ExecutionOptions, execute_dxb_sync},
};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

mod runtime;
use runtime::JSRuntime;

pub mod network;

pub mod js_utils;
pub mod pointer;
pub mod utils;

#[cfg(feature = "lsp")]
pub mod lsp;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, final)]
    pub fn log(s: &str);
}
static INIT: Once = Once::new();

#[derive(Debug, Deserialize, Serialize)]
pub struct JSDebugConfig {
    // optional log level for the runtime, can be "error", "warn", "info", "debug" or "trace"
    // if not specified, no logs will be printed to the console
    pub log_level: Option<String>,
}

impl JSDebugConfig {
    pub fn get_log_level(&self) -> Option<log::Level> {
        self.log_level.as_ref().map(|level| {
            match level.to_lowercase().as_str() {
                "error" => log::Level::Error,
                "warn" => log::Level::Warn,
                "info" => log::Level::Info,
                "debug" => log::Level::Debug,
                "trace" => log::Level::Trace,
                _ => {
                    log::warn!(
                        "Invalid log level '{}', defaulting to 'info'",
                        level
                    );
                    log::Level::Info
                }
            }
        })
    }
}

#[wasm_bindgen]
pub async fn create_runtime(
    config: JsValue,
    debug_config: JsValue,
) -> JSRuntime {
    let debug_config: Option<JSDebugConfig> =
        from_value(debug_config).unwrap_or_default();
    INIT.call_once(|| {
        console_error_panic_hook::set_once();
        // create a logger that logs to the browser console, with the log level specified in the debug config
        if let Some(log_level) = debug_config.and_then(|d| d.get_log_level()) {
            wasm_logger::init(wasm_logger::Config::new(log_level));
        }
    });

    JSRuntime::run(config).await
}

/// Executes a Datex script and returns the result as a string.
#[wasm_bindgen]
pub fn execute(datex_script: &str, decompile_options: JsValue) -> String {
    let result = compile_script(datex_script, CompileOptions::default());
    if let Ok((dxb, _)) = result {
        let input = ExecutionInput::new(
            &dxb,
            ExecutionOptions {
                verbose: true,
                ..ExecutionOptions::default()
            },
            None,
        );
        let result = execute_dxb_sync(input).unwrap_or_else(|err| {
            panic!("Failed to execute script: {err:?}");
        });
        let result = result.unwrap();
        let (result_dxb, _) =
            compile_template("?", &[Some(result)], CompileOptions::default())
                .unwrap();

        decompile_body(
            &result_dxb,
            from_value(decompile_options).unwrap_or_default(),
        )
        .unwrap_or_else(|err| {
            panic!("Failed to decompile result: {err:?}");
        })
    } else {
        panic!("Failed to compile script: {:?}", result.err());
    }
}

/// Executes a Datex script and returns true when execution was successful.
/// Does not return the result of the script, but only indicates success or failure.
#[wasm_bindgen]
pub fn execute_internal(datex_script: &str) -> bool {
    let result = compile_script(datex_script, CompileOptions::default());
    if let Ok((dxb, _)) = result {
        let input = ExecutionInput::new(
            &dxb,
            ExecutionOptions {
                verbose: true,
                ..ExecutionOptions::default()
            },
            None,
        );
        let result = execute_dxb_sync(input).unwrap_or_else(|err| {
            panic!("Failed to execute script: {err:?}");
        });
        result.is_some()
    } else {
        panic!("Failed to compile script: {:?}", result.err());
    }
}
