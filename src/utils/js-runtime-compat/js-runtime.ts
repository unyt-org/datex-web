/**
 * @module
 * @description
 * The runtime module provides a runtimeInterface object that contains common
 * runtime-specific functions for reading files, etc.
 * It automatically detects the runtime environment and provides the correct
 * runtime interface.
 * Supported runtimes are:
 * - Deno
 * - Node.js
 * - Bun
 * - Browser
 */

import type { JsRuntimeInterface, JSRuntimeType } from "./js-runtime-interface.ts";

import BrowserRuntimeInterface from "./runtimes/browser.ts";

export function detectRuntime(): JSRuntimeType {
    if (globalThis.navigator?.userAgent.startsWith("Node.js")) {
        return "node";
    } else if (globalThis.navigator?.userAgent.startsWith("Deno")) {
        return "deno";
    } else if (globalThis.navigator?.userAgent.startsWith("Bun")) {
        return "bun";
    } else {
        return "browser";
    }
}

async function getRuntimeInterface(type: JSRuntimeType) {
    if (type == "deno") {
        const { default: Interface } = (await import("./runtimes/deno.ts")) as {
            default: new () => JsRuntimeInterface;
        };
        return new Interface();
    } else if (type == "node" || type == "bun") {
        const { default: Interface } = (await import("./runtimes/node.ts")) as {
            default: new () => JsRuntimeInterface;
        };
        return new Interface();
    } else {
        return new BrowserRuntimeInterface();
    }
}

/** The runtime interface for the current runtime environment */
export const runtimeInterface: JsRuntimeInterface = await getRuntimeInterface(
    detectRuntime(),
);
