// @generated file -- do not edit
// deno-lint-ignore-file
// deno-fmt-ignore-file

import type { Endpoint } from "../../../lib/mod.ts";
import type { InterfaceDirection } from "./com_interfaces/com_interface/properties.ts";

export type SocketPropertiesPartial = {
    direction: InterfaceDirection;
    channel_factor: number;
    direct_endpoint: Endpoint | null;
};