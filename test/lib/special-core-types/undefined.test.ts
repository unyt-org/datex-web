import { Runtime } from "datex/runtime/runtime.ts";
import { assert, assertEquals } from "@std/assert";
import type { DIFValue } from "datex/dif/types/value.ts";
import { arrayTypeBinding, Endpoint } from "datex/lib/mod.ts";
import {
    isJsUndefined,
    isJsUndefinedTypeDefinition,
    JS_UNDEFINED,
    JS_UNDEFINED_TYPE_DEFINITION,
} from "datex/lib/special-core-types/undefined.ts";

let runtime: Runtime;
Deno.test.beforeEach(async () => {
    runtime = await Runtime.create({ endpoint: Endpoint.get("@test") });
});

Deno.test("undefined type definition", () => {
    assert(
        isJsUndefinedTypeDefinition(JS_UNDEFINED_TYPE_DEFINITION),
        "JS_UNDEFINED_TYPE_DEFINITION should have the correct impl type definition",
    );
});
Deno.test("undefined value", () => {
    assert(isJsUndefined(JS_UNDEFINED), "JS_UNDEFINED should be recognized as undefined");
});

Deno.test("undefined DIF representation", () => {
    const undefinedDifValue = runtime.dif.convertJSValueToDIFValueContainer(
        undefined,
    ) as DIFValue;

    assertEquals(
        undefinedDifValue,
        JS_UNDEFINED,
    );
});

Deno.test("undefined execution", () => {
    const executionResult = runtime.executeSync<undefined>("?", [undefined]);
    assertEquals(executionResult, undefined);
});
