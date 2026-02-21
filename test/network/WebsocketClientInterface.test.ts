import { assert, assertRejects } from "@std/assert";
import {
    createMockupServer,
    type MockupServerInstance,
} from "./WebsocketMockupServer.ts";
import { Runtime } from "../../src/runtime/runtime.ts";
import { sleep } from "../utils.ts";
import { isNodeOrBun } from "../is-node.ts";

Deno.test("invalid url construct", async () => {
    const runtime = await Runtime.create({ endpoint: "@unyt" });
    await assertRejects(
        async () =>
            await runtime.comHub.createInterface("websocket-client", {
                url: "invalid url",
            }),
        "InvalidURL",
    );
});

Deno.test("invalid url scheme construct", async () => {
    const runtime = await Runtime.create({ endpoint: "@unyt" });
    await assertRejects(
        async () =>
            await runtime.comHub.createInterface("websocket-client", {
                url: "ftp://invalid",
            }),
        "InvalidURL",
    );
});

Deno.test("websocket connect fail", async () => {
    const runtime = await Runtime.create({ endpoint: "@unyt" });
    await assertRejects(
        async () =>
            await runtime.comHub.createInterface("websocket-client", {
                url: "ws://invalid",
            }),
        "Failed to connect to WebSocket",
    );
});

// NOTE: this test is a bit pointless with a mock server that never send a hello block,
// so the websocket client connect never resolves.
// We can only test that the client connection does not resolve after some time
Deno.test("websocket basic connect", async () => {
    // FIXME: temporarily disabled because Deno.serve is not yet supported for node.js/dnt
    if (isNodeOrBun) {
        console.warn(
            "Crypto tests are currently disabled in Node.js or Bun environments.",
        );
        return;
    }
    const port = 8484;
    const runtime = await Runtime.create({ endpoint: "@unyt" }, {
        log_level: "debug",
    });

    let mockupServer: MockupServerInstance;

    // run mockup server and interface creation in parallel
    const res = await Promise.race([
        createMockupServer(port).then(async (server) => {
            mockupServer = server;
            // timeout after 1s
            await sleep(1000);
            return true;
        }),
        runtime.comHub.createInterface(
            "websocket-client",
            { url: `ws://localhost:${port}` },
        ).then((uuid) => {
            console.log("Interface created with UUID:", uuid);
            return false;
        }),
    ]);
    assert(res);

    await mockupServer![Symbol.asyncDispose]();
});
