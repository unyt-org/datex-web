// import { ComInterfaceImpl } from "../com-interface.ts";
// import { ComHub } from "../com-hub.ts";
// import type { WebRTCInterfaceSetupData } from "../../datex.ts";

// /**
//  * Implementation of the WebRTC communication interface.
//  */
// export class WebRTCInterfaceImpl
//     extends ComInterfaceImpl<WebRTCInterfaceSetupData> {
//     /**
//      * Sets the callback to be invoked when an ICE candidate is received.
//      * @param onIceCandidate The callback to be invoked when an ICE candidate is received.
//      */
//     public setOnIceCandidate(
//         onIceCandidate: (candidate: Uint8Array) => void,
//     ): void {
//         this.jsComHub.webrtc_interface_set_on_ice_candidate(
//             this.uuid,
//             onIceCandidate,
//         );
//     }

//     /**
//      * Adds an ICE candidate to the connection.
//      * @param candidate The ICE candidate to add.
//      * @returns A promise that resolves when the candidate has been added.
//      */
//     public addIceCandidate(candidate: Uint8Array): Promise<void> {
//         return this.jsComHub.webrtc_interface_add_ice_candidate(
//             this.uuid,
//             candidate,
//         );
//     }

//     /**
//      * Creates an offer for the WebRTC connection.
//      * @returns A promise that resolves to the created offer.
//      */
//     public createOffer(): Promise<Uint8Array> {
//         return this.jsComHub.webrtc_interface_create_offer(this.uuid);
//     }

//     /**
//      * Creates an answer for the WebRTC connection.
//      * @param offer The offer to respond to.
//      * @returns A promise that resolves to the created answer.
//      */
//     public createAnswer(offer: Uint8Array): Promise<Uint8Array> {
//         return this.jsComHub.webrtc_interface_create_answer(
//             this.uuid,
//             offer,
//         );
//     }

//     /**
//      * Sets the answer for the WebRTC connection.
//      * @param answer The answer to set.
//      * @returns A promise that resolves when the answer has been set.
//      */
//     public setAnswer(answer: Uint8Array): Promise<void> {
//         return this.jsComHub.webrtc_interface_set_answer(this.uuid, answer);
//     }

//     /**
//      * Waits for the WebRTC connection to be established.
//      * @returns A promise that resolves when the connection is established.
//      */
//     public waitForConnection(): Promise<void> {
//         return this.jsComHub.webrtc_interface_wait_for_connection(this.uuid);
//     }
// }

// ComHub.registerInterfaceImpl("webrtc", WebRTCInterfaceImpl);
