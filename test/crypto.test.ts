import { Runtime } from "../src/runtime/runtime.ts";
import { isNodeOrBun } from "./is-node.ts";

Deno.test("crypto", async () => {
    // FIXME: temporarily disabled because of crypto problems with node.js
    if (isNodeOrBun) {
        console.warn(
            "Crypto tests are currently disabled in Node.js or Bun environments.",
        );
        return;
    }
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    console.log(
        await runtime._runtime.crypto_test_tmp(),
    );
    // .then(console.log)
    // .catch(console.error);
});
