/**
 * This test suite is used to ensure that runtime.executeSync produces the exact same results as JSON.parse for the same inputs.
 * Additionally, it verifies that runtime.valueToString with json_compat enabled produces the same results as JSON.stringify for the same JSON-compatible inputs.
 */

/**
 * Test inputs that are used to verify JSON compatibility.
 */
const TEXT_INPUTS = [
    "42",
    "-10",
    "3.14",
    '"Hello, World!"',
    "true",
    "false",
    "null",
    "[1, 2, 3]",
    '{"a": 1, "b": "test"}',
    "[]",
    "{}",
];

import { Runtime } from "../../src/runtime/runtime.ts";
import { assertEquals } from "@std/assert";

const runtime = await Runtime.create({ endpoint: "@jonas" });

for (const input of TEXT_INPUTS) {
    Deno.test(`JSON parse compatibility for input: ${input}`, () => {
        const resultFromRuntime = runtime.executeSync(input);
        const resultFromJSON = JSON.parse(input);
        assertEquals(resultFromRuntime, resultFromJSON);
    });

    Deno.test(`JSON stringify compatibility for input : ${input}`, () => {
        const value = JSON.parse(input);
        const stringFromRuntime = runtime.valueToString(value, {
            formatting_options: { json_compat: true },
            resolve_slots: false,
        });
        const stringFromJSON = JSON.stringify(value);
        assertEquals(stringFromRuntime, stringFromJSON);
    });
}
