// deno-lint-ignore-file

import { Runtime } from "../src/mod.ts";
import { parseStructure } from "https://cdn.jsdelivr.net/npm/@unyt/speck@0.0.10/esm/parser.js";
// import { WebRTCInterfaceImpl } from "../src/network/interface-impls/webrtc.ts";
import { ComInterfaceProperties } from "datex/datex.ts";

const definition = await (await fetch(
    "https://raw.githubusercontent.com/unyt-org/datex-specification/refs/heads/main/assets/structures/dxb.json",
)).json();

/**
 * The default instance of the Datex runtime.
 */
export const Datex: Runtime = await Runtime.create({
    interfaces: [],
    debug: true,
}, {
    allow_unsigned_blocks: true,
});

const config: ComInterfaceProperties = {
    name: "base",
    interface_type: "base",
    channel: "test",
    direction: "InOut",
    round_trip_time: 5,
    max_bandwidth: 1,
    continuous_connection: true,
    allow_redirects: true,
    is_secure_channel: true,
    reconnection_config: "NoReconnect",
    auto_identify: false,
    connectable_interfaces: undefined,
};

// @ts-ignore global variable for debugging
globalThis.Datex = Datex;
// const baseInterface = await Datex.comHub.createInterface<BaseInterfaceImpl>(
//     "base",
//     config,
// );
// baseInterface.impl.onSend(
//     (_block: Uint8Array, _receiver_socket_uuid: string) => {
//         return Promise.resolve(true);
//     },
// );
// const socketUUID = baseInterface.impl.registerSocket("InOut");

// document.getElementById("base")!.addEventListener("click", () => {
//     baseInterface.impl.receive(
//         socketUUID,
//         Uint8Array.from(
//             atob(
//                 "AWQBWQAQACoCAAAAAAAAAAAAAAAAAAAAAAAAAAACAGpvbmFzAAAAAAAAAAAAAAAAAAAAAGJlbgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKgD0AAAAAAAAAAA=",
//             ),
//             (c) => c.charCodeAt(0),
//         ),
//     );
// });

Datex.comHub.registerIncomingBlockInterceptor(
    (block: Uint8Array, socket_uuid: string) => {
        console.log(parseStructure(definition, block), socket_uuid);
    },
);

// document.getElementById("serial")!.addEventListener("click", async () => {
//     const serial = await Datex.comHub.createInterface(
//         SerialInterfaceImpl,
//         { baud_rate: 19200, port_name: undefined },
//     );
//     console.log(serial);
// });

// document.getElementById("webrtc")!.addEventListener("click", async () => {
//     const interface_a = await Datex.comHub.createInterface(
//         WebRTCInterfaceImpl,
//         {
//             peer_endpoint: "@jonas",
//             ice_servers: undefined,
//         },
//     );

//     const interface_b = await Datex.comHub.createInterface(
//         WebRTCInterfaceImpl,
//         {
//             peer_endpoint: "@ben",
//             ice_servers: undefined,
//         },
//     );
//     console.log("Interface A:", interface_a);
//     interface_a.impl.setOnIceCandidate((candidate: Uint8Array) => {
//         console.log("Interface A ICE candidate:", candidate);
//         interface_b.impl.addIceCandidate(candidate)
//             .then(() => console.log("ICE candidate added to interface B"))
//             .catch((e) =>
//                 console.error(
//                     "Error adding ICE candidate to interface B",
//                     e,
//                 )
//             );
//     });

//     interface_b.impl.setOnIceCandidate((candidate: Uint8Array) => {
//         interface_a.impl.addIceCandidate(candidate)
//             .then(() => console.log("ICE candidate added to interface A"))
//             .catch((e) =>
//                 console.error(
//                     "Error adding ICE candidate to interface A",
//                     e,
//                 )
//             );
//     });
//     const offer = await interface_a.impl.createOffer();
//     console.log("Offer from A:", offer);

//     const answer = await interface_b.impl.createAnswer(offer);
//     console.log("Answer from B:", answer);
//     await interface_a.impl.setAnswer(answer);

//     await interface_a.impl.waitForConnection();
//     console.log("Interface A connected");
//     await interface_b.impl.waitForConnection();
//     console.log("Interface B connected");

//     const success = await Datex.comHub.sendBlock(
//         new Uint8Array([1, 2, 3, 4]),
//         interface_a.uuid,
//         "",
//     ) && await Datex.comHub.sendBlock(
//         new Uint8Array([1, 2, 3, 4]),
//         interface_b.uuid,
//         "",
//     );

//     if (!success) {
//         console.error("Failed to send message");
//     } else {
//         console.log("Message sent successfully");
//     }
// });
