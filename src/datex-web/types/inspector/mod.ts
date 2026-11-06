// @generated file -- do not edit
// deno-lint-ignore-file
// deno-fmt-ignore-file

import { SharedContainerMutability, type SharedRef, SharedReferenceMutability } from "../../../shared-container/mod.ts";

/**
 * The Inspector is a built-in debug helper that provides access to the DATEX runtime and its properties.
 * It is currently publicly accessible, but will be restricted with permission rules in the future.
 */
export declare class Inspector {
    /**
     * Returns the name of the inspector.
     */ public name(): Promise<string>;
    /**
     * Streams the logs associated with the inspector.
     */ public logs(): Promise<SharedRef<ReadableStream<string>, SharedContainerMutability.Mutable, SharedReferenceMutability.Mutable>>;
    /**
     * Attempts to reboot the endpoint associated with the inspector.
     * Currently, this function is not implemented and will panic if called.
     */ public try_reboot_endpoint(): Promise<void>;
}