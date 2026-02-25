/**
 * @module
 * @description
 * This module contains helper functions to convert DIF structures to display strings.
 */
import {
    type DIFReference,
    DIFReferenceMutability,
    type DIFRepresentationValue,
    type DIFTypeDefinition,
    type DIFValueContainer,
} from "./definitions.ts";
import { CoreTypeAddress } from "./core.ts";

/**
 * Converts a DIF reference mutability to a display string.
 */
export function mutabilityToDisplayString(mut: DIFReferenceMutability): string {
    if (mut === DIFReferenceMutability.Mutable) {
        return "&mut ";
    } else if (mut === DIFReferenceMutability.Immutable) {
        return "&";
    }
    throw new Error("Unknown mutability: " + mut);
}

/**
 * Converts a DIF reference to a display string.
 */
export function difReferenceToDisplayString(
    reference: DIFReference,
): string {
    const typeString = difTypeDefinitionToDisplayString(reference.allowed_type);
    const valueString = difValueContainerToDisplayString(reference.value);
    const mutString = mutabilityToDisplayString(reference.mut);
    return `${mutString}${valueString} (allowed: ${typeString})`;
}

/**
 * Converts a DIF value container to a display string.
 */
export function difValueContainerToDisplayString(
    container: DIFValueContainer,
): string {
    if (typeof container === "string") {
        return addressToDisplayString(container);
    } else {
        const typeString = container.type ? difTypeDefinitionToDisplayString(container.type) : null;
        const valueString = difRepresentationValueToDisplayString(
            container.value,
        );
        if (typeString) {
            return `{ type: ${typeString}, value: ${valueString} }`;
        } else {
            return valueString;
        }
    }
}

/**
 * Converts a DIF representation value to a display string.
 */
export function difRepresentationValueToDisplayString(
    difRepValue: DIFRepresentationValue,
): string {
    if (Array.isArray(difRepValue)) {
        return `[${
            difRepValue.map((v) => {
                if (Array.isArray(v)) {
                    return `[${
                        v.map((vv) => difValueContainerToDisplayString(vv))
                            .join(", ")
                    }]`;
                } else {
                    return difValueContainerToDisplayString(v);
                }
            }).join(
                ", ",
            )
        }]`;
    } else if (difRepValue && typeof difRepValue === "object") {
        return `{ ${
            Object.entries(difRepValue).map(([k, v]) => `${k}: ${difValueContainerToDisplayString(v)}`).join(", ")
        } }`;
    } else {
        return JSON.stringify(difRepValue);
    }
}

/**
 * Converts a DIF type definition to a display string.
 */
export function difTypeDefinitionToDisplayString(
    difType: DIFTypeDefinition,
): string {
    if (typeof difType === "string") {
        return addressToDisplayString(difType);
    } else {
        return `{ kind: ${difType.kind}, def: ${JSON.stringify(difType.def)} }`;
    }
}

/**
 * Converts a core type address to a display string.
 */
export function addressToDisplayString(address: string): string {
    const found = Object.entries(CoreTypeAddress).find(([_, addr]) => {
        return addr === address;
    });
    if (found) {
        return found[0];
    } else {
        return "$" + address;
    }
}
