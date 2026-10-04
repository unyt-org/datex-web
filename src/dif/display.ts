/**
 * @module
 * @description
 * This module contains helper functions to convert DIF structures to display strings.
 */

import { SharedContainerMutability } from "../shared-container/mod.ts";
import { CoreLibTypeId } from "./core.ts";
import type {
    DIFBaseSharedValueContainer,
    DIFCoreValue,
    DIFTypeDefinition,
    DIFTypeDefinitionMap,
    DIFTypeKey,
    DIFValueContainer,
} from "./types/mod.ts";
import type { PointerAddress } from "../shared-container/mod.ts";

/**
 * Converts a DIF reference mutability to a display string.
 */
export function mutabilityToDisplayString(mut: SharedContainerMutability): string {
    if (mut === SharedContainerMutability.Mutable) {
        return "&mut ";
    } else if (mut === SharedContainerMutability.Immutable) {
        return "&";
    }
    throw new Error("Unknown mutability: " + mut);
}

/**
 * Converts a DIF reference to a display string.
 */
export function difBaseSharedContainerToDisplayString(
    reference: DIFBaseSharedValueContainer,
): string {
    const valueString = difValueContainerToDisplayString(reference[0]);
    const mutString = mutabilityToDisplayString(reference[1]);
    const typeString = difTypeDefinitionToDisplayString(reference[2]);
    return `${mutString}${valueString} (allowed: ${typeString})`;
}

/**
 * Converts a DIF value container to a display string.
 */
export function difValueContainerToDisplayString(
    container: DIFValueContainer,
): string {
    if (typeof container === "object" && container !== null && "$" in container) {
        return container.$;
    } else if (Array.isArray(container)) {
        const [typeId, value, typeDef] = container;
        const typeString = typeDef ? difTypeDefinitionToDisplayString(typeDef) : null;
        const valueString = difCoreValueToDisplayString(
            typeId,
            value,
        );
        if (typeString) {
            return `{ type: ${typeString}, value: ${valueString} }`;
        } else {
            return valueString;
        }
    } else {
        return JSON.stringify(container);
    }
}

/**
 * Converts a DIF representation value to a display string.
 */
export function difCoreValueToDisplayString(
    id: CoreLibTypeId,
    coreValue: DIFCoreValue,
): string {
    switch (id) {
        case CoreLibTypeId.boolean:
        case CoreLibTypeId.text:
        case CoreLibTypeId.endpoint:
        case CoreLibTypeId.integer:
        case CoreLibTypeId.integer_i8:
        case CoreLibTypeId.integer_i16:
        case CoreLibTypeId.integer_i32:
        case CoreLibTypeId.integer_i64:
        case CoreLibTypeId.integer_i128:
        case CoreLibTypeId.integer_u8:
        case CoreLibTypeId.integer_u16:
        case CoreLibTypeId.integer_u32:
        case CoreLibTypeId.integer_u64:
        case CoreLibTypeId.integer_u128:
        case CoreLibTypeId.integer_ibig:
        case CoreLibTypeId.decimal_f32:
        case CoreLibTypeId.decimal_f64:
        case CoreLibTypeId.decimal_dbig:
        case CoreLibTypeId.null:
        case CoreLibTypeId.decimal:
            return JSON.stringify(coreValue);

        case CoreLibTypeId.Unit:
            return "()";
        case CoreLibTypeId.Never:
            return "never";
        case CoreLibTypeId.Any:
            return "unknown";
        case CoreLibTypeId.Range:
            if (Array.isArray(coreValue)) {
                return `[${difValueContainerToDisplayString(coreValue[0] as DIFValueContainer)}, ${
                    difValueContainerToDisplayString(coreValue[1] as DIFValueContainer)
                }]`;
            } else if (coreValue && typeof coreValue === "object") {
                return `{ start: ${difValueContainerToDisplayString(coreValue.start)}, end: ${
                    difValueContainerToDisplayString(coreValue.end)
                } }`;
            } else {
                throw new Error("Invalid range value: " + JSON.stringify(coreValue));
            }
        case CoreLibTypeId.Type:
            return difTypeDefinitionToDisplayString(coreValue as DIFTypeDefinition);
        case CoreLibTypeId.Map:
            if (Array.isArray(coreValue)) {
                return `[${
                    (coreValue as [DIFValueContainer, DIFValueContainer][])
                        .map((value) => {
                            if (Array.isArray(value)) {
                                return `[${
                                    value
                                        .map((item) => difValueContainerToDisplayString(item))
                                        .join(", ")
                                }]`;
                            }

                            return difValueContainerToDisplayString(value);
                        })
                        .join(", ")
                }]`;
            }

            if (coreValue && typeof coreValue === "object") {
                return `{ ${
                    Object.entries(coreValue)
                        .map(
                            ([key, value]) => `${key}: ${difValueContainerToDisplayString(value)}`,
                        )
                        .join(", ")
                } }`;
            }
            throw new Error("Invalid map value: " + JSON.stringify(coreValue));
        default:
            throw new Error("Unknown core lib type id: " + id);
    }
}

/**
 * Converts a DIF type definition to a display string.
 */
export function difTypeDefinitionToDisplayString(
    difType: DIFTypeDefinition,
): string {
    if (typeof difType === "number") {
        return coreLibTypeIdToDisplayString(difType);
    } else {
        const [key, def] = Object.entries(difType)[0] as [
            DIFTypeKey,
            DIFTypeDefinitionMap[DIFTypeKey],
        ];
        return `{ ${key}: ${JSON.stringify(def)} }`;
    }
}

/**
 * Converts a core type address to a display string.
 */
export function addressToDisplayString(address: PointerAddress): string {
    return `$${address}`;
}

/**
 * Converts a core lib type id to a display string.
 * @param typeId The core lib type id to convert.
 * @returns The display string for the given core lib type id.
 */
export function coreLibTypeIdToDisplayString(
    typeId: CoreLibTypeId,
): string {
    return Object.entries(CoreLibTypeId).find(
        ([, value]) => value === typeId,
    )?.[0] ?? "Unknown";
}
