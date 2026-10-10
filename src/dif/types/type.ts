/**
 * @module DIF Types
 * @description
 * This module contains all type definitions related to the representation of types in DIF.
 */

import type {
    PointerAddress,
    PointerAddressWithOwnership,
    SharedContainerMutability,
} from "../../shared-container/mod.ts";
import type { CoreLibTypeId } from "../core.ts";

/**
 * A core lib is directly serialized as number.
 */
export type DIFCoreLibTypeDefinition = CoreLibTypeId;

export type DIFTypeDefinitionMap = {
    literal: DIFLiteralTypeDefinition;
    list: DIFListTypeDefinition;
    map: DIFMapTypeDefinition;
    range: DIFRangeTypeDefinition;
    collection: DIFCollectionTypeDefinition;
    shared: DIFSharedTypeDefinition;
    nested: DIFNestedTypeDefinition;
    callable: DIFCallableTypeDefinition;
    impl_type: DIFImplTypeDefinition;
    intersection: DIFIntersectionTypeDefinition;
    union: DIFUnionTypeDefinition;
    tagged_type: DIFTaggedTypeDefinition;
    marker_type: DIFTypeMarker;
};
export type DIFTypeKey = keyof DIFTypeDefinitionMap;

export const DIFLocalMutability = {
    Immutable: 0,
    Mutable: 1,
} as const;
export type DIFLocalMutability = typeof DIFLocalMutability[keyof typeof DIFLocalMutability];

export const DIFLocalOwnership = {
    Immutable: 0,
    Mutable: 1,
    Owned: null,
} as const;
export type DIFLocalOwnership = typeof DIFLocalOwnership[keyof typeof DIFLocalOwnership];

export const DIFSharedContainerOwnership = {
    ImmutableRef: 0,
    MutableRef: 1,
    Owned: null,
} as const;
export type DIFSharedContainerOwnership = typeof DIFSharedContainerOwnership[keyof typeof DIFSharedContainerOwnership];

export type DIFTypeMetadata = {
    kind: "local";
    mutability: DIFLocalMutability;
    ownership?: DIFLocalOwnership;
} | {
    kind: "shared";
    mutability: SharedContainerMutability;
    ownership: DIFSharedContainerOwnership;
};

export type DIFTypeDefinitionWithMetadata = [
    DIFTypeMetadata,
    DIFTypeDefinition,
];
export type SharedContainerContainingNominalType = PointerAddressWithOwnership; // $' <address>
export type DIFType = DIFTypeDefinitionWithMetadata | SharedContainerContainingNominalType | CoreLibTypeId; // TODO alias / nominal or core lib type id

/**
 * Creates an immutable local DIFType for a given DIFTypeDefinition.
 * @param def The DIFTypeDefinition to create the DIFType for.
 * @returns A DIFType with the given definition and immutable local metadata.
 */
export function defaultDIFTypeForDefinition(def: DIFTypeDefinition): DIFType {
    return [
        {
            kind: "local",
            mutability: DIFLocalMutability.Immutable,
        },
        def,
    ];
}
/**
 * The DIFTypeDefinition represents a structural (only for now) type definition in the DIF format.
 */
export type DIFTypeDefinition =
    | DIFCoreLibTypeDefinition
    | {
        [K in keyof DIFTypeDefinitionMap]: {
            [P in K]: DIFTypeDefinitionMap[K];
        };
    }[keyof DIFTypeDefinitionMap];

export type DIFLiteralTypeDefinition =
    | boolean // boolean
    | string // text
    | [typeof CoreLibTypeId.integer, number]
    | [typeof CoreLibTypeId.integer_u8, number]
    | [typeof CoreLibTypeId.integer_u16, number]
    | [typeof CoreLibTypeId.integer_u32, number]
    | [typeof CoreLibTypeId.integer_u64, number]
    | [typeof CoreLibTypeId.integer_u128, string]
    | [typeof CoreLibTypeId.integer_i8, number]
    | [typeof CoreLibTypeId.integer_i16, number]
    | [typeof CoreLibTypeId.integer_i32, number]
    | [typeof CoreLibTypeId.integer_i64, number]
    | [typeof CoreLibTypeId.integer_i128, string]
    | [typeof CoreLibTypeId.integer_ibig, string]
    | [typeof CoreLibTypeId.decimal, string]
    | [typeof CoreLibTypeId.decimal_f32, "nan" | "infinity" | "-infinity" | number]
    | [typeof CoreLibTypeId.decimal_f64, "nan" | "infinity" | "-infinity" | number]
    | [typeof CoreLibTypeId.decimal_dbig, string]
    | [typeof CoreLibTypeId.endpoint, string];

export type DIFListTypeDefinition = DIFType[];

export type DIFMapTypeDefinition = Array<[DIFType, DIFType]>;

export type DIFRangeTypeDefinition = [DIFType, DIFType];

export type DIFNestedTypeDefinition = DIFType;

export type DIFImplTypeDefinition = [DIFType, Array<PointerAddress>];

export type DIFIntersectionTypeDefinition = Array<DIFType>;

export type DIFUnionTypeDefinition = Array<DIFType>;

export type DIFTaggedTypeDefinition = [string, DIFType];

export type DIFTypeMarker = "";

export type DIFSharedTypeDefinition = PointerAddressWithOwnership; // TODO

export type DIFCollectionTypeDefinition =
    | DIFCollectionListTypeDefinition
    | DIFCollectionListSliceTypeDefinition
    | DIFCollectionMapTypeDefinition
    | DIFRangeTypeDefinition;

export type DIFCollectionListTypeDefinition = DIFType;
export type DIFCollectionListSliceTypeDefinition = [DIFType, number];
export type DIFCollectionMapTypeDefinition = Array<[DIFType, DIFType]>;

export const DIFCallableKind = {
    Function: "function",
    Procedure: "procedure",
} as const;
export type DIFCallableKind = typeof DIFCallableKind[keyof typeof DIFCallableKind];

export type DIFCallableTypeDefinition = {
    kind: DIFCallableKind,
    requires_async: boolean,
    parameters: [string|null, DIFType][],
    rest_parameter: [string|null, DIFType]|null,
    return_type: DIFType|null,
    yeet_type: DIFType|null,
}