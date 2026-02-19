import { assert, assertRejects } from "@std/assert";
import { createMockupServer } from "./WebsocketMockupServer.ts";
import { Runtime } from "../../src/runtime/runtime.ts";
import { sleep } from "../utils.ts";
import * as uuid from "@std/uuid";
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

// FIXME: this test takes very long (1min+), maybe due to auto reconnection attempts?
// Deno.test("websocket connect fail", async () => {
//     const runtime = await Runtime.create({ endpoint: "@unyt" });
//     await assertRejects(
//         async () =>
//             await runtime.comHub.createInterface("websocket-client", {
//                 url: "ws://invalid",
//             }),
//         "Failed to connect to WebSocket",
//     );
// });

Deno.test("websocket basic connect", async () => {
    // FIXME: temporarily disabled because Deno.serve is not yet supported for node.js/dnt
    if (isNodeOrBun) {
        console.warn(
            "Crypto tests are currently disabled in Node.js or Bun environments.",
        );
        return;
    }
    const port = 8484;
    const mockupServer = createMockupServer(port);
    const runtime = await Runtime.create({ endpoint: "@unyt", debug: true });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const interfaceUUID = await runtime.comHub.createInterface(
        "websocket-client",
        { url: `ws://localhost:${port}` },
    );
    assert(
        interfaceUUID.startsWith("com_interface::"),
        "Invalid interface UUID",
    );
    assert(
        uuid.validate(interfaceUUID.replace("com_interface::", "")),
        "Invalid UUID format",
    );

    runtime.comHub.printMetadata();
    await using _ = await mockupServer;

    // TODO: why sleep needed here?
    await sleep(100);

    runtime.comHub.closeInterface(interfaceUUID);
});

Deno.test("websocket block retrieval", async () => {
    // FIXME: temporarily disabled because Deno.serve is not yet supported for node.js/dnt
    if (isNodeOrBun) {
        console.warn(
            "Crypto tests are currently disabled in Node.js or Bun environments.",
        );
        return;
    }
    const port = 8485;
    const mockupServer = createMockupServer(port);

    const runtime = await Runtime.create({ endpoint: "@unyt" }, {
        allow_unsigned_blocks: true,
    });
    const interfaceUUID = await runtime.comHub.createInterface(
        "websocket-client",
        {
            url: `ws://localhost:${port}`,
        },
    );
    await using server = await mockupServer;

    const block = runtime._runtime._create_block(
        new Uint8Array([0x01, 0x02, 0x03, 0x04]),
        ["@unyt"],
    );
    server.send(block);
    await sleep(10);

    // TODO:
    // const blocks = runtime.comHub._drain_incoming_blocks();
    //
    // console.log("blocks", blocks);
    // assert(blocks.length === 1);
    // const incoming_block = blocks[0];
    // assert(incoming_block.length === block.length);
    // assertEquals(incoming_block, block);

    runtime.comHub.printMetadata();
    runtime.comHub.closeInterface(interfaceUUID);
});
