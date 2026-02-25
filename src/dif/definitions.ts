/**
 * @module
 * @description
 * This module contains all definitions related to the DIF (DATEX Interchange Format) interfaces of the DATEX runtime.
 */

/**
 * A DATEX pointer address representation in the DIF format.
 * (3, 5, or 26 byte hex string)
 */
export type DIFPointerAddress = string;
/**
 * A DATEX value representation in the DIF format,
 * which may optionally include type information.
 */
export type DIFValue = {
    type?: DIFTypeDefinition;
    value: DIFRepresentationValue;
};

/**
 * Mapping of DIF type kinds.
 */
export const DIFTypeDefinitionKind = {
    Structural: 1,
    Reference: 2,
    Type: 3,
    Intersection: 4,
    Union: 5,
    ImplType: 6,
    Unit: 7,
    Never: 8,
    Unknown: 9,
    Function: 10,
} as const;
/** A DIF type kind. */
export type DIFTypeDefinitionKind = typeof DIFTypeDefinitionKind[keyof typeof DIFTypeDefinitionKind];

/**
 * Representation of reference mutability (mutable or immutable) in DIF.
 */
export const DIFReferenceMutability = {
    Mutable: 0,
    Immutable: 1,
} as const;
/** A DIF reference mutability. */
export type DIFReferenceMutability = typeof DIFReferenceMutability[keyof typeof DIFReferenceMutability];

export type DIFType =
    | DIFPointerAddress // shorthand for DIFType with DIFTypeDefinitionKind.Reference
    | {
        name?: string;
        mut?: DIFReferenceMutability;
        def: DIFTypeDefinition;
    };

/** A DIF type definition based on its kind. */
export type DIFTypeDefinitionInner<
    Kind extends DIFTypeDefinitionKind = DIFTypeDefinitionKind,
> = Kind extends typeof DIFTypeDefinitionKind.Structural ? DIFValue
    : Kind extends typeof DIFTypeDefinitionKind.Reference ? DIFPointerAddress
    : Kind extends typeof DIFTypeDefinitionKind.Intersection ? Array<DIFType>
    : Kind extends typeof DIFTypeDefinitionKind.Union ? Array<DIFType>
    : Kind extends typeof DIFTypeDefinitionKind.Unit ? null
    : Kind extends typeof DIFTypeDefinitionKind.Function ? unknown // TODO
    : Kind extends typeof DIFTypeDefinitionKind.ImplType ? [DIFType, Array<DIFPointerAddress>]
    : never;

/** A DIF type definition representation. */
export type DIFTypeDefinition<
    Kind extends DIFTypeDefinitionKind = DIFTypeDefinitionKind,
> = Kind extends typeof DIFTypeDefinitionKind.Reference ? DIFPointerAddress
    : VerboseDIFTypeDefinition<Kind>;

type VerboseDIFTypeDefinition<
    Kind extends DIFTypeDefinitionKind = DIFTypeDefinitionKind,
> = {
    kind: Kind;
    def: DIFTypeDefinitionInner<Kind>;
};

/** A representation of a reference in DIF. */
export type DIFReference = {
    value: DIFValueContainer;
    allowed_type: DIFTypeDefinition;
    mut: DIFReferenceMutability;
};

/** A representation of a value or pointer address in DIF. */
export type DIFValueContainer = DIFValue | DIFPointerAddress;

/** A DIF object, mapping string keys to DIF value containers. */
export type DIFObject = Record<string, DIFValueContainer>;
/** A DIF array, containing DIF value containers. */
export type DIFArray = DIFValueContainer[];
/** A DIF map, containing key-value pairs of DIF value containers. */
export type DIFMap = [DIFValueContainer, DIFValueContainer][];

/** Any DIF representation value (JSON-compatible values). */
export type DIFRepresentationValue =
    | string
    | number
    | boolean
    | null
    | DIFObject
    | DIFMap
    | DIFArray;

/**
 * Representation of a property in DIF, which can be a text key, an index, or a generic value.
 */
export type DIFProperty =
    | { kind: "text"; value: string }
    | { kind: "index"; value: number } // FIXME shall we optimize this? as number of wrap pointer address in obj and use plain dif value container without nesting
    | { kind: "value"; value: DIFValueContainer };

/**
 * Kinds of updates that can be applied to a DIF value.
 */
export const DIFUpdateKind = {
    Replace: "replace",
    Append: "append",
    Set: "set",
    Delete: "delete",
    Clear: "clear",
    ListSplice: "list_splice",
} as const;
/** A DIF update kind. */
export type DIFUpdateKind = typeof DIFUpdateKind[keyof typeof DIFUpdateKind];

/** Different kinds of updates that can be applied to a DIF value. */
export type DIFUpdateBaseData<Kind extends DIFUpdateKind> = {
    kind: Kind;
};
export type DIFUpdateDataReplace =
    & DIFUpdateBaseData<typeof DIFUpdateKind.Replace>
    & {
        value: DIFValueContainer;
    };
export type DIFUpdateDataPush =
    & DIFUpdateBaseData<typeof DIFUpdateKind.Append>
    & {
        value: DIFValueContainer;
    };
export type DIFUpdateDataDelete =
    & DIFUpdateBaseData<typeof DIFUpdateKind.Delete>
    & {
        key: DIFProperty;
    };
export type DIFUpdateDataSet = DIFUpdateBaseData<typeof DIFUpdateKind.Set> & {
    key: DIFProperty;
    value: DIFValueContainer;
};
export type DIFUpdateDataClear = DIFUpdateBaseData<typeof DIFUpdateKind.Clear>;
export type DIFUpdateDataListSplice =
    & DIFUpdateBaseData<typeof DIFUpdateKind.ListSplice>
    & {
        start: number;
        delete_count: number;
        items: DIFValueContainer[];
    };

export type DIFUpdateData =
    | DIFUpdateDataReplace
    | DIFUpdateDataPush
    | DIFUpdateDataDelete
    | DIFUpdateDataSet
    | DIFUpdateDataClear
    | DIFUpdateDataListSplice;

/** A DIF update struct, associating a source ID with update data. */
export type DIFUpdate = {
    source_id: number;
    data: DIFUpdateData;
};

/** Options for observing DIF pointers. */
export type ObserveOptions = {
    relay_own_updates: boolean;
};
