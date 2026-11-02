import {DIFClassification, DIFCoreValueCallable, DIFCoreValueEntityTypeDefinition} from "../../dif/types/value.ts";
import {SharedContainer} from "../../shared-container/mod.ts";

export function createClassForEntityType(entityDef: DIFCoreValueEntityTypeDefinition) {
    const methods = entityDef[2].flatMap((impl) => impl[0]).map(([_id, method], i) => {
        const [_, name, requiresAsync] = method;
        return `${requiresAsync ? "async " : ""}${name ?? `__method_${i}`}(...args) {}`;
    });
    // TODO: static methods

    const classBuilder = new Function(`\n\nclass ${entityDef[0]} {\n${methods.map(m => `  ${m}`).join("\n")}\n};\n\nreturn ${entityDef[0]};`);

    return classBuilder()
}