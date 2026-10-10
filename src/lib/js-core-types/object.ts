import type { TypeBindingDefinition } from "../../dif/type-registry.ts";
import { CoreLibTypeId } from "../../dif/core.ts";
import { type CustomReferenceMetadata, IS_PROXY_ACCESS } from "../../dif/dif-handler.ts";
import { DEBUG_MODE } from "../../global.ts";
import { interceptAccessors } from "../../dif/reflect-utils.ts";
import { Option } from "../../utils/option.ts";

export const objectTypeBinding: TypeBindingDefinition<
    Record<string | symbol, unknown>
> = {
    coreLibTypeId: CoreLibTypeId.Map,
    bind(target, pointerAddress) {
        const metadata: CustomReferenceMetadata = {};

        // catch access (get or set) to original object value, not via proxy - this check is only active in debug mode
        if (DEBUG_MODE) {
            interceptAccessors(
                target,
                () => {
                    if (!metadata[IS_PROXY_ACCESS]) {
                        throw new Error(
                            "Invalid access to original object value that was moved to a reference",
                        );
                    }
                    return Option.None();
                },
                () => {
                    if (!metadata[IS_PROXY_ACCESS]) {
                        throw new Error(
                            "Invalid access to original object value that was moved to a reference",
                        );
                    }
                },
            );
        }
        // deno-lint-ignore no-this-alias
        const self = this;
        const proxy: Record<string | symbol, unknown> = new Proxy(target, {
            get(_target, key) {
                return self.allowOriginalValueAccess(proxy, () => {
                    return Reflect.get(target, key);
                });
            },
            set(_target, prop, value, receiver) {
                return self.allowOriginalValueAccess(proxy, () => {
                    return Reflect.set(target, prop, value, receiver);
                });
            },
        });
        return {
            value: proxy,
            metadata,
        };
    },
    handleSet(target, key: unknown, value: unknown) {
        this.difHandler.getOriginalValueFromProxy(target)![key as string | symbol] = value;
    },
    handleDelete(target, key: string | symbol) {
        delete this.difHandler.getOriginalValueFromProxy(target)![key];
    },
    handleReplace(target, newValue: Record<string | symbol, unknown>) {
        const original = this.difHandler.getOriginalValueFromProxy(target)!;
        for (const key of Object.keys(original)) {
            delete original[key];
        }
        for (const [key, value] of Object.entries(newValue)) {
            original[key] = value;
        }
    },
};
