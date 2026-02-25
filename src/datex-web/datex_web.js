import * as imports from "./datex_web.internal.js";
import { runtimeInterface } from "../utils/js-runtime-compat/js-runtime.ts";
const wasm = (await runtimeInterface.instantiateWebAssembly(
    new URL("datex_web.wasm", import.meta.url),
    {
        "./datex_web_bg.js": imports,
    },
)).instance;
export * from "./datex_web.internal.js";
import { __wbg_set_wasm } from "./datex_web.internal.js";
__wbg_set_wasm(wasm.exports);
wasm.exports.__wbindgen_start();
