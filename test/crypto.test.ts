import { Runtime } from "datex/runtime/runtime.ts";
import { isNodeOrBun } from "./is-node.ts";
import { Endpoint } from "datex/lib/special-core-types/endpoint.ts";

Deno.test("crypto", async () => {
    // FIXME: temporarily disabled because of crypto problems with node.js
    if (isNodeOrBun) {
        console.warn(
            "Crypto tests are currently disabled in Node.js or Bun environments.",
        );
        return;
    }
    const runtime = await Runtime.create({ endpoint: Endpoint.get("@jonas") });
    await runtime._runtime.crypto_test_tmp();
});

/*
 * { type: "map", value: [
 *   [{type: "text", value: "endpoint"}, {type: "endpoint", value: "@jonas"}]
 * ], custom_type: "sdf"})
 *
 * {$: "'mut 234234"} -> SharedConatiner
 *
 * ----
 * ["integer/u8", 42, {$: "234234"}]
 * "23442"
 * 234234
 * true
 * null
 * ["list", []]
 *
 * Types:
 * TypeDefinition:
 *
 * {literal: 20}
 * {union: [
 *   {$: "234234"} // nominal shared Type
 *   ["'mut", {literal: "sdfsdf"}],
 *   ["&", {core: 42}]
 * ]}
 */
