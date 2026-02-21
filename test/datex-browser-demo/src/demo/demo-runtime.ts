import { Runtime, Ref } from "datex";

export const runtime = await Runtime.create(
    {
        interfaces: [
            {
                type: "websocket-client",
                config: {
                    url: "ws://localhost:8043",
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

runtime.comHub.printMetadata()

// @ts-ignore global variable for debugging
globalThis.Datex = runtime;
// @ts-ignore global variable for debugging
globalThis.Ref = Ref;