/**
 * Helper methods for creating update data dif structures.
 */
import type { DIFProperty, DIFValueContainer } from "./types/mod.ts";
import { type DIFUpdateData, DIFUpdateKind } from "./types/update.ts";

/**
 * The kinds of properties that can be used in a DIF update.
 * - Index: Represents an index in an array or list.
 * - Text: Represents a string key in an object or map.
 * - ValueContainer: Represents a value container that holds a DIF value.
 */
export enum DIFPropertyKind {
    /**
     * Represents an index in an array or list.
     */
    Index,
    /**
     * Represents a string key in an object or map.
     */
    Text,
    /**
     * Represents a value container that holds a DIF value.
     */
    ValueContainer,
}

/**
 * Creates a DIFUpdateData structure representing a clear operation.
 * @param path The path to the property being updated (optional).
 * @returns A DIFUpdateData structure representing the clear operation.
 */
export function clear(path: DIFProperty[] = []): DIFUpdateData {
    return [path, DIFUpdateKind.Clear];
}

/**
 * Creates a DIFUpdateData structure representing a replace operation.
 * @param value The new value to replace the existing value with.
 * @param path The path to the property being updated (optional).
 * @returns A DIFUpdateData structure representing the replace operation.
 */
export function replace(value: DIFValueContainer, path: DIFProperty[] = []): DIFUpdateData {
    return [path, DIFUpdateKind.Replace, value];
}

/**
 * Creates a DIFUpdateData structure representing an append entry operation.
 * @param value The value to append to the collection.
 * @param path The path to the property being updated (optional).
 * @returns A DIFUpdateData structure representing the append entry operation.
 */
export function appendEntry(value: DIFValueContainer, path: DIFProperty[] = []): DIFUpdateData {
    return [path, DIFUpdateKind.AppendEntry, value];
}

/**
 * Creates a DIFUpdateData structure representing a set entry operation.
 * @param key The key of the entry to set.
 * @param value The value to set for the specified key.
 * @param path The path to the property being updated (optional).
 * @returns A DIFUpdateData structure representing the set entry operation.
 */
export function setEntry(
    key: DIFProperty,
    value: DIFValueContainer,
    path: DIFProperty[] = [],
): DIFUpdateData {
    return [path, DIFUpdateKind.SetEntry, key, value];
}

/**
 * Creates a DIFUpdateData structure representing a delete entry operation.
 * @param key The key of the entry to delete.
 * @param path The path to the property being updated (optional).
 * @returns A DIFUpdateData structure representing the delete entry operation.
 */
export function deleteEntry(
    key: DIFProperty,
    path: DIFProperty[] = [],
): DIFUpdateData {
    return [path, DIFUpdateKind.DeleteEntry, key];
}

/**
 * Creates a DIFUpdateData structure representing a list splice operation.
 * @param start The starting index of the splice operation.
 * @param deleteCount The number of elements to delete.
 * @param items The items to insert at the specified start index.
 * @param path The path to the property being updated (optional).
 * @returns A DIFUpdateData structure representing the list splice operation.
 */
export function listSplice(
    start: number,
    deleteCount: number,
    items: DIFValueContainer[],
    path: DIFProperty[] = [],
): DIFUpdateData {
    return [path, DIFUpdateKind.ListSplice, start, deleteCount, items];
}
