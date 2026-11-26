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

import { tagged } from "./lib/mod.ts";
import { Runtime } from "./runtime/runtime.ts";
import type { RuntimeConfig } from "./datex-web/types/runtime/config.ts";

/**
 * The default configuration for the Datex runtime.
 * This creates a new anonymous endpoint with a websocket client interface connected to "wss://example.unyt.land"..
 */
const defaultConfig: RuntimeConfig = {
    endpoint: null,
    name: null,
    interfaces: [{
        priority: tagged("Priority", 1),
        type: "websocket-client",
        config: { url: "wss://example.unyt.land" },
    }],
    env: null,
    vault_location: "local_storage",
};

/**
 * The default instance of the Datex runtime.
 */
export const Datex: Runtime = await Runtime.create(defaultConfig, {
    log_level: "warn",
});
