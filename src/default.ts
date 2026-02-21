/**
 * @module default.ts
 * @description
 * This module exports an instance of the DATEX runtime.
 *
 * @example
 * ```ts
 * import { Datex } from "@unyt/datex/default";
 *
 * // Use the Datex runtime instance
 * const result = await Datex.execute("@example :: 1 + 2");
 * ```
 */

import {Runtime, type RuntimeConfig} from "./runtime/runtime.ts";

/**
 * The default configuration for the Datex runtime.
 */
const defaultConfig: RuntimeConfig = {
    interfaces: [{
        type: "websocket-client",
        config: { url: "wss://example.unyt.land" },
    }],
};

/**
 * The default instance of the Datex runtime.
 */
export const Datex: Runtime = await Runtime.create(defaultConfig, {
    log_level: "warn",
});
