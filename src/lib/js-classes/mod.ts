import type { DIFHandler } from "../../dif/dif-handler.ts";
import type { DIFCoreValueEntityTypeDefinition } from "../../dif/types/mod.ts";
import { unreachable } from "../../utils/exceptions.ts";

export function createClassForEntityType(
    entityDef: DIFCoreValueEntityTypeDefinition,
    dif: DIFHandler,
) {
    const [className, _tyDefinition, impls] = entityDef;
    const methods: string[] = [];
    const seen = new Set<string>();

    let index = 0;

    function generateMethod(
        name: string | null,
        isStatic: boolean,
        requiresAsync: boolean,
    ): string {
        const methodName = name ?? `__method_${index}`;
        const key = `${isStatic ? "static" : "instance"}::${methodName}`;
        if (seen.has(key)) {
            unreachable(`Duplicate method key: ${key}`);
        }
        seen.add(key);

        // TODO: should be set to async for owned external methods
        requiresAsync = true;

        const nativeName = JSON.stringify(name);
        const callStr = requiresAsync ? "await dif.callMethodAsync" : "dif.callMethodSync";
        const staticStr = isStatic ? "static " : "";
        const asyncStr = requiresAsync ? "async " : "";

        index++;
        return `
            ${staticStr}${asyncStr}[${JSON.stringify(methodName)}](...args) {
                return ${callStr}(
                    dif.convertJSValueToDIFValueContainer(this),
                    ${nativeName},
                    args
                );
            }
        `;
    }

    for (const impl of impls) {
        const [instanceMethods, staticMethods] = impl;
        // instance methods
        for (const method of instanceMethods) {
            const [, definition] = method;
            const [, name, requiresAsync] = definition;
            methods.push(
                generateMethod(name, false, requiresAsync ?? false),
            );
        }
        // static methods
        for (const method of staticMethods) {
            const [, definition] = method;
            const [, name, requiresAsync] = definition;
            methods.push(
                generateMethod(name, true, requiresAsync ?? false),
            );
        }
    }

    const classBuilder = new Function(
        "dif",
        `
        class ${className} {
            ${methods.join("\n")}
        }

        return ${className};
        `,
    ) as (dif: DIFHandler) => new (...args: unknown[]) => unknown;
    return classBuilder(dif);
}
