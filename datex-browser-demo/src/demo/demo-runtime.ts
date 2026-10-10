import { Builtins, Repl, Runtime, Shared } from "datex";
import { SharedContainerMutability } from "../../../src/shared-container/base-shared-container.ts";
import { SharedReferenceMutability } from "../../../src/shared-container/reference.ts";

export const runtime = await Runtime.create(
    {
        endpoint: Builtins.Endpoint.get("@web_" + Math.floor(Math.random() * 1000)),
        interfaces: [
            {
                priority: new Builtins.Tagged("Priority", 1),
                type: "websocket-client",
                config: {
                    url: "ws://0.0.0.0:8043",
                },
            },
        ],
        env: {
            "example": "42",
        },
    },
    {
        log_level: "warn",
    },
);

runtime.comHub.printMetadata();

// @ts-ignore global variable for debugging
globalThis.Datex = runtime;
// @ts-ignore global variable for debugging
globalThis.ReferencedSharedContainer = Shared.ReferencedSharedContainer;

// @ts-ignore global variable for debugging
globalThis.SharedContainerMutability = SharedContainerMutability;

// @ts-ignore global variable for debugging
globalThis.SharedReferenceMutability = SharedReferenceMutability;

// @ts-ignore global variable for debugging
globalThis.Range = Builtins.Range;

// @ts-ignore global variable for debugging
globalThis.Endpoint = Builtins.Endpoint;

// @ts-ignore global variable for debugging
globalThis.Repl = Repl;
