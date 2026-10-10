/**
 * This module implements the TypeRegistry and TypeBinding classes which allow registering custom type definitions and bindings to JS implementations.
 */

import { DEBUG_MODE } from "../global.ts";
import type { CoreLibTypeId } from "./core.ts";
import { type DIFTypeDefinition, type DIFUpdateData, DIFUpdateKind } from "./types/mod.ts";
import {
    type CachedSharedContainer,
    type CustomReferenceMetadata,
    type DIFHandler,
    IS_PROXY_ACCESS,
} from "./dif-handler.ts";
import type {
    BaseSharedContainer,
    PointerAddress,
    SharedContainerMutability,
    SharedRef,
} from "../shared-container/mod.ts";

type ImplMethod = {
    name: string;
    implementation: (...args: unknown[]) => unknown;
};

type OwnImpl = {
    methods: ImplMethod[];
};

type InterfaceImpl = {
    interfaceName: string;
    methods: ImplMethod[];
};

export type TypeDefinition = {
    name: string;
    structuralDefinition: DIFTypeDefinition; // TODO: generic definition
    ownImpls?: OwnImpl[]; // e.g. impl CustomMapMap
    interfaceImpls: InterfaceImpl[]; // e.g. impl GetProperty for CustomMap
};

export type TypeBindingContext<M extends CustomReferenceMetadata> = {
    readonly difHandler: DIFHandler;
    getCustomReferenceMetadata(
        value: WeakKey,
    ): M;
    allowOriginalValueAccess<R>(
        target: WeakKey,
        callback: () => R,
    ): R;
};

export type BindResult<T, M extends CustomReferenceMetadata> = {
    value: T;
    metadata: M;
};

export type TypeBindingDefinition<
    T extends object,
    M extends CustomReferenceMetadata = CustomReferenceMetadata,
> = {
    coreLibTypeId?: CoreLibTypeId;
    pointerAddress?: PointerAddress;
    bind(
        this: TypeBindingContext<M>,
        value: T,
        pointerAddress: PointerAddress,
    ): BindResult<T, M>;
    handleSet?(
        this: TypeBindingContext<M>,
        target: SharedRef<T, SharedContainerMutability>,
        key: unknown,
        value: unknown,
    ): void;
    handleAppend?(this: TypeBindingContext<M>, target: SharedRef<T, SharedContainerMutability>, value: unknown): void;
    handleReplace?(
        this: TypeBindingContext<M>,
        parent: SharedRef<T, SharedContainerMutability>,
        newValue: unknown,
    ): void;
    handleDelete?(this: TypeBindingContext<M>, target: SharedRef<T, SharedContainerMutability>, key: unknown): void;
    handleClear?(this: TypeBindingContext<M>, target: SharedRef<T, SharedContainerMutability>): void;
    handleListSplice?(
        this: TypeBindingContext<M>,
        target: SharedRef<T, SharedContainerMutability>,
        start: number,
        deleteCount: number,
        items: unknown[],
    ): void;
};

// interface GetProperty<K,V> = {
//     function getProperty<K>(self: Type, key: K) -> X;
// }

// type = {x: fn()->y),}
// impl Type {
//     fn autoSelectFamily() -> Family {
// }

// impl Type {
//     fn autoSelectFamily(self) -> Family {

//     }
// }

// Type.self(x);
// x->autoSelectFamily();
// MyTrait.autoSelectFamily(x);
// Type.autoSelectFamily(x);
// object->contains()
// obj.hasOwnPropety()

export class TypeRegistry {
    #difHandler: DIFHandler;
    #typePointerAddressBindings: Map<string, TypeBinding> = new Map();
    #coreLibTypeIdBindings: Map<CoreLibTypeId, TypeBinding> = new Map();

    constructor(difHandler: DIFHandler) {
        this.#difHandler = difHandler;
    }

    /**
     * Defines a completely new nominal type with optional implementations that can be bound to JS native functions.
     * @param definition
     */
    public registerTypeDefinition(_definition: TypeDefinition) {
        // TODO
    }

    /**
     * Binds an existing nominal type to a JS mirror implementation.
     * @param typePointerAddress The address of the type pointer in the Datex runtime.
     */
    public registerTypeBinding<T extends object>(
        typeBindingDefinition: TypeBindingDefinition<T>,
    ) {
        const binding = new TypeBinding(
            typeBindingDefinition as TypeBindingDefinition<
                object,
                CustomReferenceMetadata
            >,
            this.#difHandler,
        );
        if (typeBindingDefinition.pointerAddress != null) {
            this.#typePointerAddressBindings.set(
                typeBindingDefinition.pointerAddress,
                binding,
            );
        } else if (typeBindingDefinition.coreLibTypeId != null) {
            this.#coreLibTypeIdBindings.set(
                typeBindingDefinition.coreLibTypeId,
                binding,
            );
        } else {
            throw new Error(
                "TypeBindingDefinition must have either pointerAddress or coreLibTypeId defined",
            );
        }
    }

    /**
     * Gets the type binding for a given type pointer address.
     * @param typePointerAddress The pointer address of the type in the Datex runtime.
     * @returns The corresponding TypeBinding or null if no binding is found for the given pointer address.
     */
    public getTypeBinding(
        typePointerAddress: string,
    ): TypeBinding | null {
        return this.#typePointerAddressBindings.get(typePointerAddress) || null;
    }

    /**
     * Gets the type binding for a given core library type id.
     * @param coreLibTypeId
     * @returns
     */
    public getTypeBindingByCoreLibTypeId(
        coreLibTypeId: CoreLibTypeId,
    ): TypeBinding | null {
        return this.#coreLibTypeIdBindings.get(coreLibTypeId) || null;
    }
}

export class TypeBinding<
    T extends object = object,
    M extends CustomReferenceMetadata = CustomReferenceMetadata,
> {
    #difHandler: DIFHandler;
    #definition: TypeBindingDefinition<T, M>;

    get difHandler(): DIFHandler {
        return this.#difHandler;
    }

    public getCustomReferenceMetadata(value: CachedSharedContainer): M {
        return this.#difHandler.getReferenceMetadataUnsafe<M>(value)
            .customMetadata;
    }

    constructor(
        definition: TypeBindingDefinition<T, M>,
        difHandler: DIFHandler,
    ) {
        this.#definition = definition;
        this.#difHandler = difHandler;
    }

    /**
     * Binds a new JS value to this type binding.
     * @returns
     */
    public bindValue(value: T, pointerAddress: PointerAddress): BindResult<T, M> {
        return this.#definition.bind.call(
            this,
            value,
            pointerAddress,
        );
    }

    /**
     * Sets up observers for the given value and pointer address if there are update handlers defined for this type binding.
     */
    public handleDifUpdate(
        base: BaseSharedContainer<T>,
        pointerAddress: string,
        difUpdateData: DIFUpdateData,
    ): void {
        const updateHandlerTypes = this.getUpdateHandlerTypes();
        // add observer if there are update handlers
        if (updateHandlerTypes.size > 0) {
            const path = difUpdateData[0]; // TODO handle path
            const kind = difUpdateData[1];

            const value = base.value as SharedRef<T>;

            this.allowOriginalValueAccess(base, () => {
                // call appropriate handler based on update kind
                if (
                    kind === DIFUpdateKind.SetEntry &&
                    this.#definition.handleSet
                ) {
                    this.#definition.handleSet.call(
                        this,
                        value,
                        this.#difHandler.resolveDIFProperty(
                            difUpdateData[2],
                        ),
                        this.#difHandler.resolveDIFValueContainer(
                            difUpdateData[3],
                        ),
                    );
                } else if (
                    kind === DIFUpdateKind.AppendEntry &&
                    this.#definition.handleAppend
                ) {
                    this.#definition.handleAppend.call(
                        this,
                        value,
                        this.#difHandler.resolveDIFValueContainer(
                            difUpdateData[2],
                        ),
                    );
                } else if (
                    kind === DIFUpdateKind.Replace &&
                    this.#definition.handleReplace
                ) {
                    this.#definition.handleReplace.call(
                        this,
                        value,
                        this.#difHandler.resolveDIFValueContainer(
                            difUpdateData[2],
                        ),
                    );
                } else if (
                    kind === DIFUpdateKind.DeleteEntry &&
                    this.#definition.handleDelete
                ) {
                    this.#definition.handleDelete.call(
                        this,
                        value,
                        this.#difHandler.resolveDIFProperty(
                            difUpdateData[2],
                        ),
                    );
                } else if (
                    kind === DIFUpdateKind.Clear &&
                    this.#definition.handleClear
                ) {
                    this.#definition.handleClear.call(this, value);
                } else if (
                    kind === DIFUpdateKind.ListSplice &&
                    this.#definition.handleListSplice
                ) {
                    this.#definition.handleListSplice.call(
                        this,
                        value,
                        difUpdateData[2],
                        difUpdateData[3],
                        difUpdateData[4].map((item) => this.#difHandler.resolveDIFValueContainer(item)),
                    );
                }
            });
        }
    }

    public getUpdateHandlerTypes(): Set<DIFUpdateKind> {
        const updateHandlerTypes = new Set<DIFUpdateKind>();
        if (this.#definition.handleSet) {
            updateHandlerTypes.add(DIFUpdateKind.SetEntry);
        }
        if (this.#definition.handleAppend) {
            updateHandlerTypes.add(DIFUpdateKind.AppendEntry);
        }
        if (this.#definition.handleReplace) {
            updateHandlerTypes.add(DIFUpdateKind.Replace);
        }
        if (this.#definition.handleDelete) {
            updateHandlerTypes.add(DIFUpdateKind.DeleteEntry);
        }
        if (this.#definition.handleClear) {
            updateHandlerTypes.add(DIFUpdateKind.Clear);
        }
        return updateHandlerTypes;
    }

    public allowOriginalValueAccess<R>(
        target: CachedSharedContainer,
        callback: () => R,
    ): R {
        if (!DEBUG_MODE) {
            return callback();
        }
        const metadata = this.getCustomReferenceMetadata(target);
        metadata[IS_PROXY_ACCESS] = true;
        try {
            return callback();
        } finally {
            metadata[IS_PROXY_ACCESS] = false;
        }
    }
}
