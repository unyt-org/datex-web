// @generated file -- do not edit
// deno-lint-ignore-file
// deno-fmt-ignore-file

import { SharedContainerMutability, type SharedRef, SharedReferenceMutability } from "../../../shared-container/mod.ts";
import type { ComHubMetadata } from "../network/com_hub/metadata.ts";
import type { RuntimeInfo, RuntimeStats } from "../runtime/internal.ts";
import type { LogMessage } from "../utils/logger.ts";

/**
 * The Inspector is a built-in debug helper that provides access to the DATEX runtime and its properties.
 * It is currently publicly accessible, but will be restricted with permission rules in the future.
 */
export declare class Inspector {
    public name: string;
    public info: RuntimeInfo;
    /**
     * Returns a stream of all global log messages of the endpoint.
     */ public logs(): Promise<SharedRef<ReadableStream<LogMessage>, SharedContainerMutability.Mutable, SharedReferenceMutability.Mutable>>;
    /**
     * Returns the current metadata information (connected interfaces, sockets) of the endpoint's com hub.
     */ public com_hub_metadata(): Promise<ComHubMetadata>;
    /**
     * Returns the current runtime statistics of the endpoint.
     */ public stats(): Promise<RuntimeStats>;
    /**
     * Attempts to reboot the endpoint associated with the inspector.
     * Currently, this function is not implemented and will panic if called.
     */ public try_reboot_endpoint(): Promise<void>;
}