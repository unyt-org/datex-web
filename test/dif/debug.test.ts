import { Runtime } from "datex/runtime/runtime.ts";
import { arrayTypeBinding } from "datex/lib/js-core-types/array.ts";
import { assertEquals, assertNotStrictEquals, assertThrows } from "@std/assert";

const runtime = await Runtime.create({ endpoint: "@jonas" });
runtime.dif.type_registry.registerTypeBinding(arrayTypeBinding);

Deno.test("detect illegal use of moved original value", () => {
    const original = [1, 2];
    // original is "moved" to reference
    const reference = runtime.createTransparentReference(original);
    assertNotStrictEquals(original, reference);

    // should be allowed
    reference.push(4);
    reference[0] = 10;

    assertEquals(reference.length, 3);
    assertEquals(reference[2], 4);
    assertEquals(reference, [10, 2, 4]);

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
