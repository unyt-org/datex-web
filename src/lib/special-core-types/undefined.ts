import { JsLibTypeAddress } from "../../dif/js-lib.ts";
import type { DIFValue } from "../../dif/types/mod.ts";
import { hasImplClassification } from "../../dif/helpers/values.ts";

export const JS_UNDEFINED: DIFValue = {
    _: "c",
    c: [null, [JsLibTypeAddress.undefined]],
    v: null,
};

export function isJsUndefined(value: DIFValue): boolean {
    return hasImplClassification(value, JsLibTypeAddress.undefined);
}
