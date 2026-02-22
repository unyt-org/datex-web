/**
 * @module
 * @description
 * Replacement module for js-runtime.ts, targeted explicitly for bundling for browser environments.
 */

import type { JsRuntimeInterface } from "./js-runtime-interface.ts";

import BrowserRuntimeInterface from "./runtimes/browser.ts";

/** The runtime interface for the current runtime environment */
export const runtimeInterface: JsRuntimeInterface = new BrowserRuntimeInterface();
