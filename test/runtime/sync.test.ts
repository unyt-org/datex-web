import { Runtime } from "datex/runtime/runtime.ts";
import { Endpoint } from "datex/lib/special-core-types/endpoint.ts";
import { websocketServerDenoComInterfaceFactory } from "../../src/network/interfaces/websocket-server-deno.ts";
import { sleep } from "../utils.ts";
import { assertEquals } from "@std/assert/equals";
import { assert } from "@std/assert/assert";
import type { ReferencedSharedContainer } from "../../src/shared-container/mod.ts";

async function getTwoConnectedRuntimes(): Promise<
    { runtimeA: Runtime; runtimeB: Runtime; cleanup: () => Promise<void> }
> {
    const PORT = 8099;
    const runtimeA = await Runtime.create({ endpoint: Endpoint.get("@test_a") }, { log_level: "info" });
    runtimeA.comHub.registerInterfaceFactory(
        websocketServerDenoComInterfaceFactory,
    );
    const serverInterfaceUUID = await runtimeA.comHub.createInterface(
        "websocket-server",
        { bind_address: `0.0.0.0:${PORT}` },
    );

    const runtimeB = await Runtime.create({ endpoint: Endpoint.get("@test_b") }, { log_level: "info" });
    const clientInterfaceUUID = await runtimeB.comHub.createInterface(
        "websocket-client",
        { url: `ws://localhost:${PORT}` },
    );

    return {
        runtimeA,
        runtimeB,
        cleanup: async () => {
            await runtimeA.comHub.removeInterface(serverInterfaceUUID);
            await runtimeB.comHub.removeInterface(clientInterfaceUUID);
            await sleep(100); // needed for cleanup, fixme
        },
    };
}

Deno.test("sync value between two runtimes", async () => {
    const { runtimeA, runtimeB, cleanup } = await getTwoConnectedRuntimes();

    // b = {}; a = {a: b}; b.a = a
    await runtimeA.execute(`
        var x = shared mut 42; 
        @test_b.x = 'mut x;
        @@local.x = 'mut x;
    `);

    const xOnA = runtimeA.executeSync<ReferencedSharedContainer<number>>("@@local.x");
    const xOnB = runtimeB.executeSync<ReferencedSharedContainer<number>>("@@local.x");

    assertEquals(xOnA.value, 42);
    assertEquals(xOnA.value, xOnB.value);

    assert(xOnA.isMutable(), "xOnA should be mutable");
    assert(xOnB.isMutable(), "xOnB should be mutable");

    // update on a
    xOnA.value = 43;
    await sleep(100);
    assertEquals(xOnB.value, 43);

    // update on b
    xOnB.value = 44;
    await sleep(100);
    assertEquals(xOnA.value, 44);

    await cleanup();
});
