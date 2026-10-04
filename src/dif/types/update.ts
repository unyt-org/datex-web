/**
 * @module DIF Update Types
 * @description
 * This module contains all type definitions related to the representation of updates in DIF.
 */

import type { DIFValueContainer } from "./value.ts";

/**
 * Representation of a property in DIF, which can be a text key, an index, or a generic value.
 */
export type DIFProperty =
    | string
    | number
    | { value: DIFValueContainer };

/**
 * Kinds of updates that can be applied to a DIF value.
 */
export const DIFUpdateKind = {
    Replace: "replace",
    AppendEntry: "append_entry",
    SetEntry: "set_entry",
    DeleteEntry: "delete_entry",
    Clear: "clear",
    ListSplice: "list_splice",
} as const;
/** A DIF update kind. */
export type DIFUpdateKind = typeof DIFUpdateKind[keyof typeof DIFUpdateKind];

/** Different kinds of updates that can be applied to a DIF value. */
export type DIFUpdateBaseData<Kind extends DIFUpdateKind> = {
    kind: Kind;
};
export type DIFUpdateDataReplace = [DIFValueContainer];
export type DIFUpdateDataPush = [DIFValueContainer];

export type DIFUpdateDataDelete = [DIFProperty];

export type DIFUpdateDataSet = [DIFProperty, DIFValueContainer];

export type DIFUpdateDataListSplice = [number, number, DIFValueContainer[]];

export type DIFUpdateReturn = ["none"] | ["single_value", DIFValueContainer] | [
    "multiple_values",
    ...DIFValueContainer[],
];

export type DIFUpdateData = [
    DIFProperty[],
    typeof DIFUpdateKind.Replace,
    ...DIFUpdateDataReplace,
] | [
    DIFProperty[],
    typeof DIFUpdateKind.AppendEntry,
    ...DIFUpdateDataPush,
] | [
    DIFProperty[],
    typeof DIFUpdateKind.DeleteEntry,
    ...DIFUpdateDataDelete,
] | [
    DIFProperty[],
    typeof DIFUpdateKind.SetEntry,
    ...DIFUpdateDataSet,
] | [
    DIFProperty[],
    typeof DIFUpdateKind.Clear,
] | [
    DIFProperty[],
    typeof DIFUpdateKind.ListSplice,
    ...DIFUpdateDataListSplice,
];

export type DIFTransceiverId = number;
export type DIFUpdate = [DIFTransceiverId, ...DIFUpdateData];

/** Options for observing DIF pointers. */
export type ObserveOptions = {
    relay_own_updates: boolean;
};
