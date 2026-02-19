/**
 * This test suite is used as a verification that all JS values that are passed to
 * the DATEX runtime come out as the exact same values after execution.
 * This is a test for the full integration of the JS runtime with the DATEX runtime.
 * NOTE: as more JS values are supported, this test should be extended to cover all of them.
 */
import { Runtime } from "../../src/runtime/runtime.ts";
import { assertEquals } from "@std/assert";

/**
 * Test values that are used to verify the value parity.
 * These values should cover all basic JS types and some complex types.
 * If you add new types, make sure to also add them to the `TEST_VALUES`
 * array below.
 */
const TEST_VALUES = [
    // simple JSON values
    42,
    -10,
    3.14,
    "Hello, World!",
    true,
    false,
    null,
    0,
    // arrays and objects
    [1, 2, 3],
    [],
    { a: 1, b: "test" },
    {},
    // non-JSON values
    // TODO: map type gets lost during DATEX execution, special JS map marker type needed here
    // new Map([["key", "value"]]),
    // new Map(),
    new Map([[1, 2]]),
    undefined,
    NaN,
    Infinity,
    -Infinity,
    2000n,
] as const;

// initialization of the test cases
const valueTypeCounter = new Map<string, number>();
for (const value of TEST_VALUES) {
    // class name or primitive type
    const valueType = value === null
        ? "null"
        : typeof value === "undefined"
        ? "undefined"
        : value?.constructor.name;
    // increment counter for this type
    const count = valueTypeCounter.get(valueType) || 0;
    valueTypeCounter.set(valueType, count + 1);
    Deno.test(`test value parity for value of type ${valueType} #${count + 1}`, async () => {
        const runtime = await Runtime.create({ endpoint: "@jonas", debug: true });
        const result = runtime.executeSync<typeof value>(
            "?",
            [value],
        );
        assertEquals(result, value);
    });
}
