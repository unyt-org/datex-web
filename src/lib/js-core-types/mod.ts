/**
 * @module js-core-types
 * @description
 * This module contains all core type definitions that have a builtin JS mapping, such as arrays and maps.
 */
import { mapOrObjectTypeBinding } from "./map_or_object.ts";

export * from "./map.ts";
export * from "./array.ts";

import type { TypeRegistry } from "../../dif/type-registry.ts";
import { arrayTypeBinding } from "../mod.ts";

export function registerCoreTypeBindings(
    registry: TypeRegistry,
) {
    registry.registerTypeBinding(arrayTypeBinding);
    registry.registerTypeBinding(mapOrObjectTypeBinding);
}
