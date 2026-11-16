// @generated file -- do not edit
// deno-lint-ignore-file
// deno-fmt-ignore-file

import type { RTCIceServerDX, WebRTCRoleDX } from "../default_setup_data/webrtc/mod.ts";

export type WebRTCInterfaceSetupDataJS = {
    role: WebRTCRoleDX;
    data_channel_label: string;
    ice_servers: RTCIceServerDX[];
    negotiated_data_channel_id: number | null;
    ordered: boolean;
};