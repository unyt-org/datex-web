/**
 * @module mod.ts
 * @description
 * This module exports all public APIs of the DATEX runtime.
 *
 * @example
 * ```ts
 * import { Runtime } from "@unyt/datex";
 *
 * // Create a runtime instance
 * export const runtime: Runtime = await Runtime.create({
 *    interfaces: [{
 *         type: "websocket-client",
 *         config: { url: "wss://example.unyt.land" },
 *     }],
 * });
 *
 *  // Use the runtime instance
 * const result = await runtime.execute("@example :: 1 + 2");
 * ```
 */

export * from "./runtime/runtime.ts";
export * as DIF from "./dif/mod.ts";
export * as Network from "./network/mod.ts";
export * from "./refs/ref.ts";
import "./utils/devtools-formatter.ts";
