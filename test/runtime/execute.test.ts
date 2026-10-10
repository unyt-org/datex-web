import { Runtime } from "datex/runtime/runtime.ts";
import { assertEquals } from "@std/assert";
import { Endpoint } from "datex/lib/special-core-types/endpoint.ts";
import { Range } from "datex/lib/special-core-types/range.ts";
import { i64, integer, u32, u8 } from "datex/dif/helpers/typed-integer.ts";

let runtime: Runtime;
Deno.test.beforeEach(async () => {
    runtime = await Runtime.create({ endpoint: Endpoint.get("@jonas") });
});

Deno.test("execute sync with string result", () => {
    const script = "1 + 2";
    const result = runtime.executeSyncWithStringResult(script);
    assertEquals(result, "3");
});

Deno.test("execute sync dif value", () => {
    const script = "1 + 2";
    const result = runtime.dif.executeSyncDIF(script);
    assertEquals(result, integer(3));
});

Deno.test("execute sync number", () => {
    const result = runtime.executeSync<number>("1u32 + 2u32");
    assertEquals(result, 3);
});

Deno.test("execute sync typed integer", () => {
    assertEquals(
        runtime.dif.executeSyncDIF(
            "42u8",
        ),
        u8(42),
    );

    assertEquals(
        runtime.dif.executeSyncDIF(
            "42u32",
        ),
        u32(42),
    );

    assertEquals(
        runtime.dif.executeSyncDIF(
            "42i64",
        ),
        i64(42),
    );
});

Deno.test("execute sync normal integer", () => {
    const result = runtime.executeSync<number>(
        "123456781",
    );
    assertEquals(typeof result, "number");
    assertEquals(
        result,
        123456781,
    );
});

Deno.test("execute sync bigint", () => {
    const result = runtime.executeSync<bigint>(
        "123456781234567891234567812345678ibig",
    );
    assertEquals(typeof result, "bigint");
    assertEquals(
        result,
        123456781234567891234567812345678n,
    );
});

Deno.test("execute sync string", () => {
    const result = runtime.executeSync<string>(`"lol"`);
    assertEquals(result, "lol");
});

Deno.test("execute sync boolean", () => {
    assertEquals(runtime.executeSync<boolean>("true"), true);
    assertEquals(runtime.executeSync<boolean>("false"), false);
});

Deno.test("execute sync null", () => {
    const result = runtime.executeSync<null>("null");
    assertEquals(result, null);
});

Deno.test("execute sync array", () => {
    const result = runtime.executeSync<number[]>("[1u32, 2u32, 3u32]");
    assertEquals(result, [1, 2, 3]);
});

Deno.test("execute sync none", () => {
    const result = runtime.executeSync<number[]>("42;");
    assertEquals(result, undefined);
});

Deno.test("execute sync object", () => {
    const result = runtime.executeSync<Record<string, number | string>>(
        '{ a: 1, b: "test" }',
    );
    assertEquals(
        result,
        { a: 1, b: "test" },
    );
});

Deno.test("execute sync endpoint", () => {
    const result = runtime.executeSync<Endpoint>("$.endpoint");
    assertEquals(result, Endpoint.get("@jonas"));
});

Deno.test("execute sync range", () => {
    const result = runtime.executeSync<Range>("1..2");
    assertEquals(result.start, 1);
    assertEquals(result.end, 2);
    assertEquals(result, new Range(1, 2));
});

Deno.test("execute sync pass number from JS", () => {
    const resultInteger = runtime.executeSync<bigint>("1ibig + ?", [41]);
    assertEquals(resultInteger, 42n);

    const resultTypedInteger = runtime.executeSync<number>("1 + ?", [41]);
    assertEquals(resultTypedInteger, 42);

    // The first part of the addition, defines the datatype, JS maps numbers to f64, so the result of the calculation will be a f64
    const resultFloat = runtime.executeSync<number>("? + 40", [2]);
    assertEquals(resultFloat, 42);
});

Deno.test("execute sync pass multiple values from JS", () => {
    const result = runtime.executeSync<number[]>("[?, 2u32, ?]", [1, 3]);
    assertEquals(result, [1, 2, 3]);
});

Deno.test("execute sync pass multiple values from JS with template syntax", () => {
    const result = runtime.executeSync<number[]>`[${1}, 2u32, ${3}]`;
    assertEquals(result, [1, 2, 3]);
});

Deno.test("execute with string result", () => {
    const script = "1 + 2";
    assertEquals(runtime.executeSyncWithStringResult(script), "3");
});
