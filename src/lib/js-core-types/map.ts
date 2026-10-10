import { CoreLibTypeId } from "../../dif/core.ts";
import { JsLibTypeAddress } from "../../dif/js-lib.ts";
import type { TypeBindingDefinition } from "../../dif/type-registry.ts";
import type { DIFImplTypeDefinition, DIFTypeDefinition } from "../../dif/types/mod.ts";
import type { SharedRef } from "datex/shared-container/mod.ts";

const ORIGINAL_SET = Symbol("ORIGINAL_SET");
const ORIGINAL_DELETE = Symbol("ORIGINAL_DELETE");
const ORIGINAL_CLEAR = Symbol("ORIGINAL_CLEAR");

export type MapMetadata<K = unknown, V = unknown> = {
    [ORIGINAL_SET]: Map<K, V>["set"];
    [ORIGINAL_DELETE]: Map<K, V>["delete"];
    [ORIGINAL_CLEAR]: Map<K, V>["clear"];
};

export const mapTypeBinding: TypeBindingDefinition<
    Map<unknown, unknown>,
    MapMetadata
> = {
    coreLibTypeId: CoreLibTypeId.Map,
    bind(value, pointerAddress) {
        const originalSet = value.set.bind(value) as (key: unknown, value: unknown) => SharedRef<Map<unknown, unknown>>;
        const originalDelete = value.delete.bind(value);
        const originalClear = value.clear.bind(value);
        Object.defineProperties(value, {
            set: {
                value: (key: unknown, val: unknown) => {
                    this.difHandler.triggerSet(pointerAddress, key, val);
                    return originalSet.call(value, key, val);
                },
                configurable: true,
                writable: true,
            },
            delete: {
                value: (key: unknown) => {
                    this.difHandler.triggerDelete(pointerAddress, key);
                    return originalDelete.call(value, key);
                },
                configurable: true,
                writable: true,
            },
            clear: {
                value: () => {
                    console.warn("triggering clear for pointer address:", pointerAddress);

                    this.difHandler.triggerClear(pointerAddress);
                    return originalClear.call(value);
                },
                configurable: true,
                writable: true,
            },
        });

        return {
            value,
            metadata: {
                [ORIGINAL_SET]: originalSet,
                [ORIGINAL_DELETE]: originalDelete,
                [ORIGINAL_CLEAR]: originalClear,
            },
        };
    },
    handleSet(target, key: unknown, value: unknown) {
        const set = this.getCustomReferenceMetadata(target)[ORIGINAL_SET];
        set.call(target, key, value);
    },
    handleDelete(target, key: unknown) {
        const del = this.getCustomReferenceMetadata(target)[ORIGINAL_DELETE];
        del.call(target, key);
    },
    handleClear(target) {
        const clear = this.getCustomReferenceMetadata(target)[ORIGINAL_CLEAR];
        clear.call(target);
    },
    handleReplace(target, newValue: unknown) {
        const metadata = this.getCustomReferenceMetadata(target);
        metadata[ORIGINAL_CLEAR].call(target);
        for (
            const [key, value] of (newValue as Map<unknown, unknown>).entries()
        ) {
            metadata[ORIGINAL_SET].call(
                target,
                key,
                value,
            );
        }
    },
};

const JS_MAP_IMPL_TYPE_DEFINITION: DIFImplTypeDefinition = [
    CoreLibTypeId.Map,
    [JsLibTypeAddress.map],
];
function isJsMapImplTypeDefinition(impl: unknown): impl is DIFImplTypeDefinition {
    return (
        Array.isArray(impl) &&
        impl.length === 2 &&
        impl[0] === CoreLibTypeId.Map &&
        Array.isArray(impl[1]) &&
        impl[1].length === 1 &&
        impl[1][0] === JsLibTypeAddress.map
    );
}

export const JS_MAP_TYPE_DEFINITION: DIFTypeDefinition = {
    impl_type: JS_MAP_IMPL_TYPE_DEFINITION,
};

export function isJsMapTypeDefinition(typeDef: DIFTypeDefinition): boolean {
    return (
        typeof typeDef === "object" &&
        typeDef !== null &&
        "impl_type" in typeDef &&
        isJsMapImplTypeDefinition(typeDef.impl_type)
    );
}
