#![feature(coroutines)]
#![feature(iter_from_coroutine)]
#![feature(gen_blocks)]
#![feature(async_iterator)]

// FIXME no-std

extern crate core;

use serde_wasm_bindgen::from_value;
// use datex_cli_core::CLI;

use datex::{
    compiler::{CompileOptions, compile_script, compile_template},
    decompiler::decompile_body,
    runtime::execution::{ExecutionInput, ExecutionOptions, execute_dxb_sync},
};
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

#[wasm_bindgen]
pub fn create_runtime(config: JsValue, debug_flags: JsValue) -> JSRuntime {
    // let debug_flags: Option<JSDebugFlags> =
    //     from_value(debug_flags).unwrap_or_default();
    JSRuntime::run(config)
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
            compile_template("?", &[result], CompileOptions::default())
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
