import type { PointerAddressWithOwnership } from "../../shared-container/mod.ts";
import type { DIFCoreLibTypeDefinition, DIFTypeDefinition } from "../types/type.ts";

/**
 * Checks if a given DIFTypeDefinition is a core library type definition.
 * @param type The DIFTypeDefinition to check.
 * @returns True if the type is a core library type definition, false otherwise.
 */
export function isCoreLibTypeDefinition(type: DIFTypeDefinition): type is DIFCoreLibTypeDefinition {
    return typeof type === "number";
}

/**
 * Checks if a given DIFTypeDefinition is a shared container type definition.
 * @param type The DIFTypeDefinition to check.
 * @returns True if the type is a shared container type definition, false otherwise.
 */
export function isSharedContainerTypeDefinition(
    type: DIFTypeDefinition,
): type is { shared: PointerAddressWithOwnership } {
    return typeof type === "object" && type != null && "shared" in type;
}
