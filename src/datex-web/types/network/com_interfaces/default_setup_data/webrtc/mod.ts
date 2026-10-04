// @generated file -- do not edit
// deno-lint-ignore-file
// deno-fmt-ignore-file

import type { Tagged } from "../../../../../../lib/mod.ts";

/**
 * Represents the role of a WebRTC participant in a connection.
 */
export type WebRTCRoleDX = Tagged<"Offerer"> | Tagged<"Answerer">;

/**
 * Represents an ICE server configuration for WebRTC.
 */
export type RTCIceServerDX = {
    urls: string[];
    username: string | null;
    credential: string | null;
};

/**
 * Represents the setup data required for establishing a WebRTC interface.
 */
export type WebRTCInterfaceSetupData = {
    role: WebRTCRoleDX;
    data_channel_label: string;
    ice_servers: RTCIceServerDX[];
    negotiated_data_channel_id: number | null;
    ordered: boolean;
};

/**
 * Represents an ICE candidate initialization message in WebRTC.
 */
export type RTCIceCandidateInitDX = {
    candidate: string;
    sdp_mid: string | null;
    sdp_mline_index: number | null;
    username_fragment: string | null;
};

/**
 * Represents the type of a WebRTC session description.
 */
export type RTCSdpTypeDX = Tagged<"Unspecified"> | Tagged<"Answer"> | Tagged<"Offer">;

/**
 * Represents a WebRTC session description.
 */
export type RTCSessionDescriptionDX = {
    type: RTCSdpTypeDX;
    sdp: string;
};

export type WebRTCSignalDX = Tagged<"Description", {
    type: RTCSdpTypeDX;
    sdp: string;
}> | Tagged<"IceCandidate", {
    candidate: string;
    sdp_mid: string | null;
    sdp_mline_index: number | null;
    username_fragment: string | null;
}> | Tagged<"EndOfCandidates">;