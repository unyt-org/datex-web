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
    "[false, true]",
    '{"a": false, "b": "test"}',
    "[]",
    "{}",
];

import { Runtime } from "datex/runtime/runtime.ts";
import { assertEquals } from "@std/assert";
import { Endpoint, Tagged } from "datex/lib/mod.ts";
import type { FormattingMode } from "../../src/datex-web/types/decompiler/options.ts";

let runtime: Runtime;

Deno.test.beforeEach(async () => {
    runtime = await Runtime.create({ endpoint: Endpoint.get("@unyt") });
});

Deno.test(`JSON parse compatibility`, async (t) => {
    for (const input of TEXT_INPUTS) {
        await t.step(`Testing input: ${input}`, () => {
            const resultFromRuntime = runtime.executeSync(input);
            const resultFromJSON = JSON.parse(input);
            assertEquals(resultFromRuntime, resultFromJSON);
        });
    }
});

Deno.test(`JSON stringify compatibility`, async (t) => {
    for (const input of TEXT_INPUTS) {
        await t.step(`Testing input: ${input}`, () => {
            const value = JSON.parse(input);
            const stringFromRuntime = runtime.valueToString(value, {
                formatting_options: {
                    json_compat: true,
                    add_variant_suffix: false,
                    mode: new Tagged("Compact") as FormattingMode,
                    colorized: false,
                },
                resolve_slots: false,
            });
            const stringFromJSON = JSON.stringify(value);
            assertEquals(stringFromRuntime, stringFromJSON);
        });
    }
});
