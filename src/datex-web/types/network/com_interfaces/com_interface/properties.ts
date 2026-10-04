// @generated file -- do not edit
// deno-lint-ignore-file
// deno-fmt-ignore-file

import type { Tagged } from "../../../../../lib/mod.ts";
import type { RuntimeConfigInterface } from "../../../runtime/config.ts";

export type InterfaceDirection = Tagged<"In"> | Tagged<"Out"> | Tagged<"InOut">;

export type ReconnectionConfig = Tagged<"NoReconnect"> | Tagged<"InstantReconnect"> | Tagged<"ReconnectWithTimeout", {
    timeout: number;
}> | Tagged<"ReconnectWithTimeoutAndAttempts", {
    timeout: number;
    attempts: number;
}>;

/**
 * The properties of a communication interface, which are used to describe the capabilities and characteristics of the interface.
 */
export type ComInterfaceProperties = {
    interface_type: string;
    channel: string;
    name: string | null;
    direction: InterfaceDirection;
    round_trip_time: number;
    max_bandwidth: number;
    continuous_connection: boolean;
    allow_redirects: boolean;
    is_secure_channel: boolean;
    reconnection_config: ReconnectionConfig;
    auto_identify: boolean;
    connectable_interfaces: RuntimeConfigInterface[] | null;
};