import type { TypeBindingContext, TypeBindingDefinition } from "../../dif/type-registry.ts";
import { CoreLibTypeId } from "../../dif/core.ts";
import type { CustomReferenceMetadata } from "../../dif/dif-handler.ts";
import { type MapMetadata, mapTypeBinding } from "./map.ts";
import { objectTypeBinding } from "./object.ts";

export const mapOrObjectTypeBinding: TypeBindingDefinition<
    Map<unknown, unknown> | Record<string | symbol, unknown>,
    MapMetadata | CustomReferenceMetadata
> = {
    coreLibTypeId: CoreLibTypeId.Map,
    bind(value, pointerAddress) {
        if (value instanceof Map) {
            return mapTypeBinding.bind.call(this as TypeBindingContext<MapMetadata>, value, pointerAddress);
        } else {
            return objectTypeBinding.bind.call(this, value, pointerAddress);
        }
    },

    handleSet(target, key: unknown, value: unknown) {
        if (target instanceof Map) {
            mapTypeBinding.handleSet!.call(this as TypeBindingContext<MapMetadata>, target, key, value);
        } else {
            objectTypeBinding.handleSet!.call(this, target, key, value);
        }
    },
    handleDelete(target, key: unknown) {
        if (target instanceof Map) {
            mapTypeBinding.handleDelete!.call(this as TypeBindingContext<MapMetadata>, target, key);
        } else {
            objectTypeBinding.handleDelete!.call(this, target, key as string | symbol);
        }
    },
    handleClear(target) {
        if (target instanceof Map) {
            mapTypeBinding.handleClear!.call(this as TypeBindingContext<MapMetadata>, target);
        } else {
            throw new Error("Clear operation is not supported for objects");
        }
    },
    handleReplace(target, newValue: unknown) {
        if (target instanceof Map) {
            mapTypeBinding.handleReplace!.call(this as TypeBindingContext<MapMetadata>, target, newValue);
        } else {
            objectTypeBinding.handleReplace!.call(this, target, newValue);
        }
    },
};
