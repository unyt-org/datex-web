import { Runtime } from "datex/runtime/runtime.ts";
import { Endpoint } from "datex/lib/special-core-types/mod.ts";
import { assertEquals, assertNotEquals } from "@std/assert";
import { tagged } from "datex/lib/special-core-types/tagged.ts";
import type { DIFValue } from "datex/dif/types/mod.ts";
import { CoreLibTypeId } from "datex/dif/core.ts";
import { arrayTypeBinding } from "../../../src/lib/js-core-types/array.ts";

let runtime: Runtime;
Deno.test.beforeEach(async () => {
    runtime = await Runtime.create({ endpoint: Endpoint.get("@test") });
});

Deno.test("tagged value DIF representation", () => {
    const taggedDifValue = runtime.dif.convertJSValueToDIFValueContainer(
        tagged("Example", 123),
    ) as DIFValue;

    assertEquals(
        taggedDifValue,
        [CoreLibTypeId.decimal_f64, 123, {
            tagged_type: [
                "Example",
                CoreLibTypeId.decimal_f64,
            ],
        }],
    );
});

Deno.test("tagged empty value DIF representation", () => {
    const taggedDifValue = runtime.dif.convertJSValueToDIFValueContainer(
        tagged("EmptyTag"),
    ) as DIFValue;

    assertEquals(
        taggedDifValue,
        [CoreLibTypeId.null, null, {
            tagged_type: [
                "EmptyTag",
                CoreLibTypeId.Unit,
            ],
        }],
    );
});

Deno.test("tagged value round-trip", () => {
    const originalValue = tagged("Example", 123);
    const difValue = runtime.dif.convertJSValueToDIFValueContainer(
        originalValue,
    ) as DIFValue;
    const jsValue = runtime.dif.resolveDIFValueContainer(difValue);

    assertEquals(jsValue, originalValue);
});

Deno.test("tagged empty value round-trip", () => {
    const originalValue = tagged("EmptyTag");
    const difValue = runtime.dif.convertJSValueToDIFValueContainer(
        originalValue,
    ) as DIFValue;
    const jsValue = runtime.dif.resolveDIFValueContainer(difValue);

    assertEquals(jsValue, originalValue);
});

Deno.test("tagged value from execution", () => {
    const result = runtime.executeSync("#Example(42)");
    assertEquals(result, tagged("Example", 42));

    const result2 = runtime.executeSync("#EmptyTag");
    assertEquals(result2, tagged("EmptyTag"));
    assertNotEquals(result2, tagged("EmptyTag", null));
});
