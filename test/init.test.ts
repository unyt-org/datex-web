import { assertEquals } from "@std/assert";
import { Runtime } from "../src/runtime/runtime.ts";

/**
 * Verify that the runtime is initialized correctly and the versions
 * match the expected versions defined in deno.json and Cargo.toml
 */
Deno.test("runtime version", async () => {
    const actual_js_version = await Deno.readTextFile(
        new URL("../deno.json", import.meta.url),
    ).then(JSON.parse).then((data: { version: string }) => data.version);

    // extract current version from Cargo.lock
    const actual_version = await Deno.readTextFile(
        new URL("../Cargo.lock", import.meta.url),
    ).then((data) => {
        const versionMatch = data.match(
            /name = "datex-core"\nversion = "(.*)"/,
        );
        return versionMatch ? versionMatch[1] : "unknown";
    });

    const runtime = await Runtime.create({ endpoint: "@unyt" });
    assertEquals(runtime.js_version, actual_js_version);
    assertEquals(runtime.version, actual_version);
    console.log(runtime);
});
