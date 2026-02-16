import { assert } from "@std/assert/assert";
import { assertEquals } from "@std/assert/equals";
import { Runtime } from "datex/runtime/runtime.ts";
import * as uuid from "@std/uuid";
import { isNodeOrBun } from "../is-node.ts";
import { websocketServerDenoComInterfaceFactory } from "datex/network/interface-impls/websocket-server-deno.ts";
import { sleep } from "../utils.ts";

Deno.test("add and close interface", async () => {
    const runtime = new Runtime({ endpoint: "@unyt" });
    runtime.comHub.registerInterfaceFactory(
        websocketServerDenoComInterfaceFactory,
    );
    const serverInterfaceUUID = await runtime.comHub.createInterface(
        "websocket-server",
        { bind_address: "0.0.0.0:1234" },
    );
    assert(
        serverInterfaceUUID.startsWith("com_interface::"),
        "Invalid interface UUID",
    );
    assert(
        uuid.validate(serverInterfaceUUID.replace("com_interface::", "")),
        "Invalid UUID format",
    );
    runtime.comHub.closeInterface(serverInterfaceUUID);
});

Deno.test("connect two runtimes", async () => {
    // FIXME: temporarily disabled because Deno.serve is not yet supported for node.js/dnt
    if (isNodeOrBun) {
        console.warn(
            "Crypto tests are currently disabled in Node.js or Bun environments.",
        );
        return;
    }

    const PORT = 8082;
    const runtimeA = new Runtime({ endpoint: "@test_a" });
    runtimeA.comHub.registerInterfaceFactory(
        websocketServerDenoComInterfaceFactory,
    );

    const serverInterfaceUUID = await runtimeA.comHub.createInterface(
        "websocket-server",
        { bind_address: `0.0.0.0:${PORT}` },
    );

    const runtimeB = new Runtime({ endpoint: "@test_b" });
    const clientInterfaceUUID = await runtimeB.comHub.createInterface(
        "websocket-client",
        { url: `ws://localhost:${PORT}` },
    );

    await sleep(100);

    runtimeA.comHub.printMetadata();
    runtimeB.comHub.printMetadata();

    const serverInterfaceMetadata = runtimeA.comHub.getMetadata().interfaces
        .find((v) => v.uuid === serverInterfaceUUID);
    assert(serverInterfaceMetadata !== undefined);
    const serverSocketMetadata = serverInterfaceMetadata.sockets.find((v) =>
        v.endpoint === "@test_b"
    );
    assert(serverSocketMetadata !== undefined);
    assertEquals(serverSocketMetadata.direction, "InOut");
    assertEquals(serverSocketMetadata.properties!.is_direct, true);
    assertEquals(serverSocketMetadata.properties!.distance, 1);

    const clientInterfaceMetaData = runtimeB.comHub.getMetadata().interfaces
        .find((v) => v.uuid === clientInterfaceUUID);
    assert(clientInterfaceMetaData !== undefined);
    const clientSocketMetadata = clientInterfaceMetaData.sockets.find((v) =>
        v.endpoint === "@test_a"
    );
    assert(clientSocketMetadata !== undefined);
    assertEquals(clientSocketMetadata.direction, "InOut");
    assertEquals(clientSocketMetadata.properties!.is_direct, true);
    assertEquals(clientSocketMetadata.properties!.distance, 1);

    runtimeA.comHub.closeInterface(serverInterfaceUUID);
    runtimeB.comHub.closeInterface(clientInterfaceUUID);
});

Deno.test("send data between two runtimes", async () => {
    // FIXME: temporarily disabled because Deno.serve is not yet supported for node.js/dnt
    if (isNodeOrBun) {
        console.warn(
            "Crypto tests are currently disabled in Node.js or Bun environments.",
        );
        return;
    }

    const PORT = 8083;
    const runtimeA = await Runtime.create({ endpoint: "@test_a" }, {
        allow_unsigned_blocks: true,
    });
    runtimeA.comHub.registerInterfaceFactory(
        websocketServerDenoComInterfaceFactory,
    );
    const serverInterfaceUUID = await runtimeA.comHub.createInterface(
        "websocket-server",
        { bind_address: `0.0.0.0:${PORT}` },
    );

    const runtimeB = await Runtime.create({ endpoint: "@test_b" }, {
        allow_unsigned_blocks: true,
    });
    const clientInterfaceUUID = await runtimeB.comHub.createInterface(
        "websocket-client",
        { url: `ws://localhost:${PORT}` },
    );

    await sleep(100);

    const res = await runtimeA.executeWithStringResult("@test_b :: 1 + 2");
    assert(res === "3", "Expected result from remote execution to be 3");

    runtimeA.comHub.closeInterface(serverInterfaceUUID);
    runtimeB.comHub.closeInterface(clientInterfaceUUID);
});
