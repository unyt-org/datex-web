import { Runtime } from "datex/runtime/runtime.ts";
import { assertEquals, assertNotStrictEquals, assertThrows } from "@std/assert";
import { Endpoint } from "datex/lib/mod.ts";
import { SharedContainerMutability } from "datex/shared-container/mod.ts";

let runtime: Runtime;
Deno.test.beforeEach(async () => {
    runtime = await Runtime.create({ endpoint: Endpoint.get("@jonas") });
});

Deno.test("detect illegal use of moved original value", () => {
    const original = [1, 2];
    // original is "moved" to reference
    const reference = runtime.createSharedValueFromJSValue(
        original,
        null,
        SharedContainerMutability.Mutable,
    );
    assertNotStrictEquals(original, reference.value);

    // should be allowed
    reference.value.push(4);
    reference.value[0] = 10;

    assertEquals(reference.value.length, 3);
    assertEquals(reference.value[2], 4);
    assertEquals(reference.value, [10, 2, 4]);

    // should not be allowed
    assertThrows(
        () => original.push(3),
    );
    assertThrows(
        () => original[0],
    );
    assertThrows(
        () => original[0] = 10,
    );
    assertThrows(
        () => JSON.stringify(original),
    );
});
