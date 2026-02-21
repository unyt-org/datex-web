import { Runtime } from "datex";

export const Datex = await Runtime.create({
    interfaces: [
        {
            type: "websocket-client",
            config: {
                url: "ws://0.0.0.0:8043",
            },
        }
    ],
    debug: true,
}, {
    allow_unsigned_blocks: true,
});

Datex.comHub.printMetadata()

// @ts-ignore global variable for debugging
globalThis.Datex = Datex;