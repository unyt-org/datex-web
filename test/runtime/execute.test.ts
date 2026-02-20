import { Runtime } from "../../src/runtime/runtime.ts";
import { assertEquals } from "@std/assert";
import { Endpoint } from "../../src/lib/special-core-types/endpoint.ts";
import { CoreTypeAddress } from "../../src/dif/core.ts";
Deno.test("execute sync with string result", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const script = "1 + 2";
    const result = runtime.executeSyncWithStringResult(script);
    assertEquals(result, "3");
    console.log(result);
});

Deno.test("execute sync dif value", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const script = "1 + 2";
    // NOTE: in an optimized version of DIF, we could also just return a plain number in this case.
    // For now, all DIF values are returned in the same format to reduce complexity.
    const result = runtime.dif.executeSyncDIF(script);
    assertEquals(result, {
        type: CoreTypeAddress.integer,
        value: "3",
    });
    console.log(result);
});

Deno.test("execute sync number", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.executeSync<number>("1 + 2");
    assertEquals(result, 3);
});

// FIXME
Deno.test("execute sync typed integer", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.dif.executeSyncDIF(
        "42u8",
    );
    assertEquals(result, {
        type: CoreTypeAddress.integer_u8,
        value: 42,
    });
});

Deno.test("execute sync normal integer", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.executeSync<number>(
        "123456781234567891234567812345678",
    );
    assertEquals(typeof result, "number");
    assertEquals(
        result,
        1.234567812345679e+32,
    );
});

Deno.test("execute sync bigint", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.executeSync<bigint>(
        "123456781234567891234567812345678ibig",
    );
    assertEquals(typeof result, "bigint");
    assertEquals(
        result,
        123456781234567891234567812345678n,
    );
});

Deno.test("execute sync string", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.executeSync<string>("'lol'");
    assertEquals(result, "lol");
});

Deno.test("execute sync boolean", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.executeSync<boolean>("true");
    assertEquals(result, true);
});

Deno.test("execute sync null", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.executeSync<null>("null");
    assertEquals(result, null);
});

Deno.test("execute sync array", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.executeSync<number[]>("[1, 2, 3]");
    assertEquals(result, [1, 2, 3]);
});

Deno.test("execute sync none", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.executeSync<number[]>("42;");
    assertEquals(result, undefined);
});

Deno.test("execute sync object", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.executeSync<Record<string, number | string>>(
        "{ a: 1, b: 'test' }",
    );
    assertEquals(
        result,
        { a: 1, b: "test" },
    );
});

Deno.test("execute sync endpoint", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.executeSync<Endpoint>("#endpoint");
    assertEquals(result, Endpoint.get("@jonas"));
});

Deno.test("execute sync pass number from JS", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.executeSync<number>("1 + ?", [41]);
    assertEquals(result, 42);
});

Deno.test("execute sync pass multiple values from JS", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.executeSync<number[]>("[?, 2, ?]", [1, 3]);
    assertEquals(result, [1, 2, 3]);
});

Deno.test("execute sync pass multiple values from JS with template syntax", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const result = runtime.executeSync<number[]>`[${1}, 2, ${3}]`;
    assertEquals(result, [1, 2, 3]);
});

Deno.test("execute with string result", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const script = "1 + 2";
    const result = await runtime.executeWithStringResult(script);
    assertEquals(result, "3");
    console.log(result);
});

Deno.test("execute remote with string result", async () => {
    const runtime = await Runtime.create({ endpoint: "@jonas" });
    const script = "1 + 2";
    const result = await runtime.executeWithStringResult(script);
    assertEquals(result, "3");
    console.log(result);
});
