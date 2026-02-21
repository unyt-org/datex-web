import { Runtime, Ref } from "datex";

export const Datex = await Runtime.create(
    {
        interfaces: [
            {
                type: "websocket-client",
                config: {
                    url: "ws://0.0.0.0:8043",
                }
            }
        ],
        env: {
            "example": "42",
        }
    },
    {
        log_level: "warn"
    }
);

Datex.comHub.printMetadata()

// @ts-ignore global variable for debugging
globalThis.Datex = Datex;
// @ts-ignore global variable for debugging
globalThis.Ref = Ref;