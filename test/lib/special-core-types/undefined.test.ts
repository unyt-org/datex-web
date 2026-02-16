import { Runtime } from "datex/runtime/runtime.ts";
import { assertEquals } from "@std/assert";
import {
    DIFTypeDefinitionKind,
    type DIFValue,
} from "datex/dif/definitions.ts";
import { JsLibTypeAddress } from "datex/dif/js-lib.ts";
import { CoreTypeAddress } from "datex/dif/core.ts";

const runtime = new Runtime({ endpoint: "@jonas", debug: true });

Deno.test("undefined", () => {
    // convert JS undefined to DIF representation
    const undefinedDifValue = runtime.dif.convertJSValueToDIFValueContainer(
        undefined,
    ) as DIFValue;
    assertEquals(
        undefinedDifValue.type,
        {
            kind: DIFTypeDefinitionKind.ImplType,
            def: [
                CoreTypeAddress.null,
                [JsLibTypeAddress.undefined],
            ],
        },
    );
    console.log(undefinedDifValue);

    // pass undefined to runtime and return value
    const executionResult = runtime._runtime.execute_sync("?", [
        undefinedDifValue,
    ]) as DIFValue;

    assertEquals(executionResult, {
        value: null,
        type: undefinedDifValue.type,
    });

    const executionResult2 = runtime.executeSync<undefined>("?", [undefined]);
    assertEquals(executionResult2, undefined);
});
