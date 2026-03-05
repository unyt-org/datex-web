import { Endpoint, Range, Ref, Repl, Runtime } from "datex";

export const runtime = await Runtime.create(
    {
        interfaces: [
            {
                type: "websocket-client",
                config: {
                    url: "wss://example.unyt.land",
                },
            },
        ],
        env: {
            "example": "42",
        },
    },
    {
        log_level: "info",
    },
);

runtime.comHub.printMetadata();

// @ts-ignore global variable for debugging
globalThis.Datex = runtime;
// @ts-ignore global variable for debugging
globalThis.Ref = Ref;

// @ts-ignore global variable for debugging
globalThis.Range = Range;

// @ts-ignore global variable for debugging
globalThis.Endpoint = Endpoint;

// @ts-ignore global variable for debugging
globalThis.Repl = Repl;
