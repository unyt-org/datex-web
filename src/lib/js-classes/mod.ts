import {DIFClassification, DIFCoreValueCallable, DIFCoreValueEntityTypeDefinition} from "../../dif/types/value.ts";
import {SharedContainer} from "../../shared-container/mod.ts";
import {DIFHandler} from "../../dif/dif-handler.ts";

export function createClassForEntityType(entityDef: DIFCoreValueEntityTypeDefinition, dif: DIFHandler) {
    const methods = entityDef[2].flatMap((impl) => impl[0]).map(([_id, method], i) => {
        let [_, name, requiresAsync] = method;
        // FIXME: should be set to async for owned external methods
        requiresAsync = true;
        const body = requiresAsync ?
            `return await dif.callMethodAsync(dif.convertJSValueToDIFValueContainer(this), "${name}", args)` :
            `return dif.callMethodSync(dif.convertJSValueToDIFValueContainer(this), "${name}", args)`;

        return `${requiresAsync ? "async " : ""}${name ?? `__method_${i}`}(...args) {\n    ${body}\n  }`;
    });
    // TODO: static methods

    const classBuilder = new Function("dif", `\n\nclass ${entityDef[0]} {\n${methods.map(m => `  ${m}`).join("\n")}\n}\n\nreturn ${entityDef[0]};`);

    return classBuilder(dif)
}