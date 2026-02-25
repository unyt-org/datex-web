import { Runtime } from "../../src/runtime/runtime.ts";
import { assertEquals } from "@std/assert";
Deno.test("decompile integer without formatting", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.valueToString(42);
    assertEquals(result, "42f64");
});

// FIXME: colorization in new decompiler
// Deno.test("decompile integer colorized", () => {
//     const runtime = await Runtime.create({ endpoint: "@jonas" });
//     const result = runtime.valueToString(42, { colorized: true });
//     assertEquals(
//         result,
//         "\x1B[38;2;231;139;71m42\x1B[38;2;212;212;212m.\x1B[38;2;231;139;71m0\x1B[0m",
//     );
// });
