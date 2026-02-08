import type { JSRuntime, RuntimeDIFHandle } from "../datex-web.ts";
import { Ref } from "../refs/ref.ts";
import { Endpoint } from "../lib/special-core-types/endpoint.ts";
import {
    type DIFArray,
    type DIFMap,
    type DIFObject,
    type DIFPointerAddress,
    type DIFProperty,
    type DIFReference,
    DIFReferenceMutability,
    type DIFTypeDefinition,
    DIFTypeDefinitionKind,
    type DIFUpdate,
    type DIFUpdateData,
    DIFUpdateKind,
    type DIFValue,
    type DIFValueContainer,
    type ObserveOptions,
} from "./definitions.ts";
import { CoreTypeAddress, CoreTypeAddressRanges } from "./core.ts";
import { type TypeBinding, TypeRegistry } from "./type-registry.ts";
import { panic } from "../utils/exceptions.ts";
import { JsLibTypeAddress } from "./js-lib.ts";

export const IS_PROXY_ACCESS = Symbol("IS_PROXY_ACCESS");

export type CustomReferenceMetadata = Record<string | symbol, unknown> & {
    [IS_PROXY_ACCESS]?: boolean;
};

export type ReferenceMetadata<M extends CustomReferenceMetadata> = {
    address: string;
    customMetadata: M;
};

/**
 * The DIFHandler class provides methods to interact with the DATEX Core DIF runtime,
 * including executing Datex scripts, creating and managing references, and observing changes.
 * It includes a local reference cache to optimize performance and reduce cross-language calls.
 */
export class DIFHandler {
    /** The JSRuntime interface for the underlying Datex Core runtime */
    #runtime: JSRuntime;
    readonly #handle: RuntimeDIFHandle;

    // always 0 for now - potentially used for multi DIF transceivers using the same underlying runtime
    readonly #transceiver_id = 0;

    /**
     * The reference cache for storing and reusing object instances on the JS side
     * The observerId is only set if the reference is being observed (if not final).
     */
    readonly #cache = new Map<
        string,
        {
            value: WeakRef<WeakKey>;
            originalValue: WeakKey | null;
            observerId: number | null;
        }
    >();

    /**
     * Maps the original value to a proxy value
     * (if the values is bound to a custom proxy wrapper)
     */
    readonly #proxyMapping = new WeakMap<WeakKey, WeakRef<WeakKey>>();

    /**
     * The reference metadata map, storing metadata for each cached reference.
     */
    readonly #referenceMetadata = new WeakMap<
        WeakKey,
        ReferenceMetadata<CustomReferenceMetadata>
    >();

    readonly #observers = new Map<
        string,
        Map<number, (value: DIFUpdateData) => void>
    >();

    readonly #type_registry = new TypeRegistry(this);

    /**
     * Internal property
     * @returns The map of observers for each pointer address.
     */
    get _observers(): Map<string, Map<number, (value: DIFUpdateData) => void>> {
        return this.#observers;
    }

    /**
     * Internal property
     * @returns The RuntimeDIFHandle instance.
     */
    get _handle(): RuntimeDIFHandle {
        return this.#handle;
    }

    /**
     * Internal property
     * @returns The transceiver ID of the DIF client.
     */
    get _transceiver_id(): number {
        return this.#transceiver_id;
    }

    get type_registry(): TypeRegistry {
        return this.#type_registry;
    }

    /**
     * Creates a new DIFHandler instance.
     * @param runtime - The JSRuntime instance for executing Datex scripts.
     * @param pointerCache - The PointerCache instance for managing object pointers. If not provided, a new PointerCache will be created.
     */
    constructor(
        runtime: JSRuntime,
    ) {
        this.#runtime = runtime;
        this.#handle = runtime.dif();
    }

    /**
     * Executes a Datex script asynchronously and returns a Promise that resolves to a DIFContainer.
     * @param datexScript - The Datex script source code to execute.
     * @param values - An optional array of values to inject into the script.
     * @returns A Promise that resolves to the execution result as a DIFContainer.
     * @throws If an error occurs during execution.
     */
    public executeDIF(
        datexScript: string,
        values: unknown[] | null = [],
    ): Promise<DIFValueContainer> {
        return this.#runtime.execute(
            datexScript,
            this.convertToDIFValues(values),
        );
    }

    /**
     * Executes a Datex script synchronously and returns the result as a DIFContainer.
     * @param datexScript - The Datex script source code to execute.
     * @param values - An optional array of values to inject into the script.
     * @returns The execution result as a DIFContainer.
     * @throws If an error occurs during execution.
     */
    public executeSyncDIF(
        datexScript: string,
        values: unknown[] | null = [],
    ): DIFValueContainer {
        return this.#runtime.execute_sync(
            datexScript,
            this.convertToDIFValues(values),
        );
    }

    /**
     * Creates a new pointer for the specified DIF value.
     * @param difValueContainer - The DIFValueContainer value to create a pointer for.
     * @param allowedType - The allowed type for the pointer.
     * @param mutability - The mutability of the pointer.
     * @returns The created pointer address.
     */
    public createReferenceFromDIFValue(
        difValueContainer: DIFValueContainer,
        allowedType: DIFTypeDefinition | null = null,
        mutability: DIFReferenceMutability,
    ): string {
        return this.#handle.create_pointer(
            difValueContainer,
            allowedType,
            mutability,
        );
    }

    /**
     * Updates the DIF value at the specified address.
     * @param address - The address of the DIF value to update.
     * @param dif - The DIFUpdate object containing the update information.
     */
    public updateReference(address: string, dif: DIFUpdateData) {
        this.#handle.update(this.#transceiver_id, address, dif);
    }

    /**
     * Registers an observer callback for changes to the DIF value at the specified address
     * directly on the DATEX core runtime.
     * This method should only be used internally, since it comes with additional overhead.
     * For normal use cases, use the observePointer method instead.
     * The callback will be invoked whenever the value at the address is updated.
     * @param address - The address of the DIF value to observe.
     * @param callback - The callback function to invoke on updates.
     * @returns An observer ID that can be used to unregister the observer.
     * @throws If the pointer is final.
     */
    public observePointerBindDirect(
        address: string,
        callback: (value: DIFUpdate) => void,
        options: ObserveOptions = { relay_own_updates: false },
    ): number {
        return this.#runtime.dif().observe_pointer(
            this.#transceiver_id,
            address,
            options,
            callback,
        );
    }

    /**
     * Updates the observe options for a registered observer.
     * @param address - The address of the DIF value being observed.
     * @param observerId - The observer ID returned by the observePointer method.
     * @param options - The new observe options to apply.
     */
    private updateObserverOptions(
        address: string,
        observerId: number,
        options: ObserveOptions,
    ) {
        this.#runtime.dif().update_observer_options(
            address,
            observerId,
            options,
        );
    }

    /**
     * Enables propagation of own updates for a registered observer.
     * @param address - The address of the DIF value being observed.
     * @param observerId - The observer ID returned by the observePointer method.
     */
    public enableOwnUpdatesPropagation(
        address: string,
        observerId: number,
    ) {
        this.updateObserverOptions(address, observerId, {
            relay_own_updates: true,
        });
    }

    /**
     * Disables propagation of own updates for a registered observer.
     * @param address - The address of the DIF value being observed.
     * @param observerId - The observer ID returned by the observePointer method.
     */
    public disableOwnUpdatesPropagation(
        address: string,
        observerId: number,
    ) {
        this.updateObserverOptions(address, observerId, {
            relay_own_updates: false,
        });
    }

    /**
     * Unregisters an observer that was registered directly on the DATEX core runtime
     * with the observePointerBindDirect method.
     * For internal use only.
     * @param address - The address of the DIF value being observed.
     * @param observerId - The observer ID returned by the observePointer method.
     */
    public unobserveReferenceBindDirect(address: string, observerId: number) {
        this.#runtime.dif().unobserve_pointer(address, observerId);
    }

    /**
     * Registers a local observer callback for changes to the DIF value at the specified address.
     * The callback will be invoked whenever the value at the address is updated.
     * In contrast to observePointerBindDirect, this method does not register the observer
     * directly on the DATEX core runtime, but keeps it local in the JS side, which prevents
     * unnecessary overhead from additional cross-language calls.
     * @param address - The address of the DIF value to observe.
     * @param callback - The callback function to invoke on updates.
     * @returns An observer ID that can be used to unregister the observer.
     * @throws If the pointer is final.
     */
    public observePointer(
        address: string,
        callback: (value: DIFUpdateData) => void,
    ): number {
        let cached = this.#cache.get(address);
        if (!cached) {
            // first resolve the pointer to make sure it's loaded in the cache
            this.resolvePointerAddressSync(address);
            cached = this.#cache.get(address)!;
        }

        // make sure the pointer is not final (no observer)
        if (cached.observerId === null) {
            throw new Error(`Cannot observe final reference $${address}`);
        }

        // directly add to observers map
        let observers = this.#observers.get(address);
        if (!observers) {
            observers = new Map();
            this.#observers.set(address, observers);
            // first local observer for this address - enable own updates propagation
            this.enableOwnUpdatesPropagation(address, cached.observerId);
        }
        // FIXME make this more robust for delete/re-add cases
        const observerId = observers.size + 1;
        observers.set(observerId, callback);
        return observerId;
    }

    /**
     * Unregisters an observer that was registered with the observePointer method.
     * @param address - The address of the DIF value being observed.
     * @param observerId - The observer ID returned by the observePointer method.
     * @returns True if the observer was successfully unregistered, false otherwise.
     */
    public unobservePointer(address: string, observerId: number): boolean {
        const observers = this.#observers.get(address);
        if (observers) {
            observers.delete(observerId);
            if (observers.size === 0) {
                // no local observers left - disable own updates propagation and remove from map
                const cached = this.#cache.get(address);
                if (cached?.observerId) {
                    this.disableOwnUpdatesPropagation(
                        address,
                        cached.observerId,
                    );
                } else {
                    console.error(`No observer found for address ${address}`);
                }
                return this.#observers.delete(address);
            }
        }
        return false;
    }

    /**
     * Resolves a DIFValue to its corresponding JS value.
     * This function handles core types and custom types (not yet implemented).
     * It returns the resolved value as the specified type T.
     * @param value
     */
    public resolveDIFValue<T extends unknown>(
        value: DIFValue,
    ): T | Promise<T> {
        let type = value.type;

        let convertMapToJSObject = false;

        // no type specified since it is inferable from the value
        if (type === undefined) {
            if (Array.isArray(value.value)) {
                // [[x,y,]] -> map
                if (Array.isArray(value.value[0])) {
                    type = CoreTypeAddress.map;
                } // [x,y] or [] -> list
                else {
                    type = CoreTypeAddress.list;
                }
            } else if (
                typeof value.value === "object" && value.value !== null
            ) {
                type = CoreTypeAddress.map;
                convertMapToJSObject = true;
            } // primitive JS value, no type specified
            else {
                return value.value as T;
            }
        }

        // null, boolean and text types values are just returned as is
        if (
            type === CoreTypeAddress.boolean ||
            type == CoreTypeAddress.text ||
            type === CoreTypeAddress.null
        ) {
            return value.value as T;
        } // small integers are interpreted as JS numbers
        else if (
            typeof type === "string" && (
                type == CoreTypeAddress.integer ||
                this.isPointerAddressInAdresses(
                    type,
                    CoreTypeAddressRanges.small_signed_integers,
                ) ||
                this.isPointerAddressInAdresses(
                    type,
                    CoreTypeAddressRanges.small_unsigned_integers,
                )
            )
        ) {
            return Number(value.value as number) as T;
        } // big integers are interpreted as JS BigInt
        else if (
            typeof type === "string" && (
                this.isPointerAddressInAdresses(
                    type,
                    CoreTypeAddressRanges.big_signed_integers,
                )
            )
        ) {
            return BigInt(value.value as number) as T;
        } // decimal types are interpreted as JS numbers
        else if (
            typeof type === "string" &&
            this.isPointerAddressInAdresses(
                type,
                CoreTypeAddressRanges.decimals,
            )
        ) {
            return (Number(value.value) as number) as T;
        } // endpoint types are resolved to Endpoint instances
        else if (type === CoreTypeAddress.endpoint) {
            return Endpoint.get(value.value as string) as T;
        } else if (type === CoreTypeAddress.list) {
            return this.promiseAllOrSync(
                (value.value as DIFArray).map((v) =>
                    this.resolveDIFValueContainer(v)
                ),
            ) as T | Promise<T>;
        } // map types are resolved from a DIFObject (aka JS Map) or Array of key-value pairs to a JS object
        else if (type === CoreTypeAddress.map) {
            if (Array.isArray(value.value)) {
                const resolvedMap = new Map<unknown, unknown>();
                for (const [key, val] of (value.value as DIFMap)) {
                    resolvedMap.set(
                        this.resolveDIFValueContainer(key),
                        this.resolveDIFValueContainer(val),
                    );
                }
                // TODO: map promises
                return resolvedMap as unknown as T | Promise<T>;
            } else {
                if (convertMapToJSObject) {
                    const resolvedObj: { [key: string]: unknown } = {};
                    for (
                        const [key, val] of Object.entries(
                            value.value as DIFObject,
                        )
                    ) {
                        resolvedObj[key] = this.resolveDIFValueContainer(val);
                    }
                    return resolvedObj as unknown as T | Promise<T>;
                } else {
                    const resolvedMap = new Map<string, unknown>();
                    for (
                        const [key, val] of Object.entries(
                            value.value as DIFObject,
                        )
                    ) {
                        resolvedMap.set(
                            key,
                            this.resolveDIFValueContainer(val),
                        );
                    }
                    return resolvedMap as
                        | T
                        | Promise<T>;
                }
            }
        } // impl types
        else if (
            typeof type == "object" &&
            type.kind === DIFTypeDefinitionKind.ImplType
        ) {
            // undefined (null + js.undefined)
            if (
                type.def[0] === CoreTypeAddress.null &&
                type.def[1].length === 1 &&
                type.def[1][0] == JsLibTypeAddress.undefined
            ) {
                return undefined as T;
            }
        }

        // custom types not implemented yet
        throw new Error("Custom type resolution not implemented yet");
    }

    /**
     * Converts an array of Promises or resolved values to either a Promise of an array of resolved values,
     * or an array of resolved values if all values are already resolved.
     */
    promiseAllOrSync<T>(values: (T | Promise<T>)[]): Promise<T[]> | T[] {
        if (values.some((v) => v instanceof Promise)) {
            return Promise.all(values);
        } else {
            return values as T[];
        }
    }

    /**
     * Converts an object with values that may be Promises to either a Promise of an object with resolved values,
     * or an object with resolved values if all values are already resolved.
     */
    public promiseFromObjectOrSync<T>(
        values: { [key: string]: T | Promise<T> },
    ): Promise<{ [key: string]: T }> | { [key: string]: T } {
        const valueArray = Object.values(values);
        if (valueArray.some((v) => v instanceof Promise)) {
            return Promise.all(valueArray).then((resolvedValues) => {
                const resolvedObj: { [key: string]: T } = {};
                let i = 0;
                for (const key of Object.keys(values)) {
                    resolvedObj[key] = resolvedValues[i++];
                }
                return resolvedObj;
            });
        } else {
            return values as { [key: string]: T };
        }
    }

    /**
     * Maps a value or Promise of a value to another value or Promise of a value using the provided onfulfilled function.
     */
    public mapPromise<T, N>(
        value: T | Promise<T>,
        onfulfilled: (value: T) => N,
    ): N | Promise<N> {
        if (value instanceof Promise) {
            return value.then(onfulfilled);
        } else {
            return onfulfilled(value);
        }
    }

    /**
     * Resolves a DIFValueContainer (either a DIFValue or a pointer address) to its corresponding JS value.
     * If the container contains pointers that are not yet loaded in memory, it returns a Promise that resolves to the value.
     * Otherwise, it returns the resolved value directly.
     * @param value - The DIFValueContainer to resolve.
     * @returns The resolved value as type T, or a Promise that resolves to type T.
     */
    public resolveDIFValueContainer<T extends unknown>(
        value: DIFValueContainer,
    ): T | Promise<T> {
        if (typeof value !== "string") {
            return this.resolveDIFValue(value);
        } else {
            return this.resolvePointerAddress(value);
        }
    }

    /**
     * Synchronous version of resolveDIFValueContainer.
     * This method can only be used if the value only contains pointer addresses that are already loaded in memory -
     * otherwise, use the asynchronous `resolveDIFValueContainer` method instead.
     * @param value - The DIFValueContainer to resolve.
     * @returns The resolved value as type T.
     * @throws If the resolution would require asynchronous operations.
     */
    public resolveDIFValueContainerSync<T extends unknown>(
        value: DIFValueContainer,
    ): T {
        const result = this.resolveDIFValueContainer(value);
        if (result instanceof Promise) {
            throw new Error(
                "resolveDIFValueContainerSync cannot return a Promise. Use resolveDIFValueContainer() instead.",
            );
        }
        return result as T;
    }

    /**
     * Resolves a DIFProperty to its corresponding JS value.
     */
    public resolveDIFPropertySync<T extends unknown>(
        property: DIFProperty,
    ): T {
        if (property.kind === "text") {
            return property.value as T;
        } else if (property.kind === "index") {
            return property.value as T;
        } else {
            return this.resolveDIFValueContainerSync(property.value);
        }
    }

    /**
     * Resolves a pointer address to its corresponding JS value.
     * If the pointer address is not yet loaded in memory, it returns a Promise that resolves to the value.
     * Otherwise, it returns the resolved value directly.
     * @param address - The pointer address to resolve.
     * @returns The resolved value as type T, or a Promise that resolves to type T.
     */
    public resolvePointerAddress<T extends unknown>(
        address: string,
    ): Promise<T> | T {
        // check cache first
        const cached = this.getCachedReference(address);
        if (cached) {
            return cached as T;
        }
        // if not in cache, resolve from runtime
        const reference: DIFReference | Promise<DIFReference> = this
            .#handle.resolve_pointer_address(address);
        return this.mapPromise(reference, (reference) => {
            const value: T | Promise<T> = this.resolveDIFValueContainer(
                reference.value,
            );
            return this.mapPromise(value, (v) => {
                // init pointer
                this.initReference(
                    address,
                    v,
                    reference.mut,
                    reference.allowed_type,
                );
                return v;
            });
        }) as Promise<T> | T;
    }

    /**
     * Resolves a pointer address to its corresponding JS value synchronously.
     * If the pointer address is not yet loaded in memory, it returns a Promise that resolves to the value.
     * Otherwise, it returns the resolved value directly.
     * @param address - The pointer address to resolve.
     * @returns The resolved value as type T, or a Promise that resolves to type T.
     * @throws If the resolution would require asynchronous operations.
     */
    public resolvePointerAddressSync<T extends unknown>(
        address: string,
    ): T {
        // check cache first
        const cached = this.getCachedReference(address);
        if (cached) {
            return cached as T;
        }
        // if not in cache, resolve from runtime
        const entry: DIFReference = this.#handle
            .resolve_pointer_address_sync(address);
        const value: T = this.resolveDIFValueContainerSync(
            entry.value,
        );
        this.initReference(address, value, entry.mut, entry.allowed_type);
        return value;
    }

    /**
     * Retrieves the original value from a proxy value if available
     * @param proxy
     * @returns
     */
    public getOriginalValueFromProxy<T extends WeakKey>(
        proxy: T,
    ): T | null {
        const address = this.getPointerAddressForValue(proxy);
        if (address) {
            const cached = this.#cache.get(address);
            if (cached && cached.originalValue) {
                return cached.originalValue as T;
            }
        }
        return null;
    }

    /**
     * Retrieves the proxy value for a given original value if available
     * @param original
     * @returns
     */
    public getProxyValueFromOriginal<T extends WeakKey>(
        original: T,
    ): T | null {
        const ref = this.#proxyMapping.get(original);
        if (ref) {
            const proxied = ref.deref();
            if (proxied) {
                return proxied as T;
            }
        }
        return null;
    }

    /**
     * Converts an array of JS values to an array of DIFValues.
     * If the input is null, it returns null.
     * @param values
     */
    public convertToDIFValues<T extends unknown[]>(
        values: T | null,
    ): DIFValueContainer[] | null {
        return values?.map((value) =>
            this.convertJSValueToDIFValueContainer(value)
        ) ||
            null;
    }

    /**
     * Returns true if the given address is within the specified address range.
     */
    protected isPointerAddressInAdresses(
        address: DIFPointerAddress,
        range: Set<string>,
    ): boolean {
        return range.has(address);
    }

    /**
     * Initializes a reference with the given value and mutability, by
     * adding a proxy wrapper if necessary, and setting up observation and caching on the JS side.
     */
    protected initReference<T>(
        pointerAddress: string,
        value: T,
        mutability: DIFReferenceMutability,
        allowedType: DIFTypeDefinition | null = null,
    ): T | Ref<T> {
        let wrappedValue = this.wrapJSValue(
            value,
            pointerAddress,
            allowedType,
        );

        let typeBinding: TypeBinding | null = null;
        let metadata: CustomReferenceMetadata | undefined = undefined;

        // bind js value (if mutable, nominal type)
        const bindJSValue = mutability !== DIFReferenceMutability.Immutable &&
            typeof allowedType == "string";
        if (bindJSValue && !(wrappedValue instanceof Ref)) {
            typeBinding = this.type_registry.getTypeBinding(allowedType);
            if (typeBinding) {
                const { value, metadata: newMetadata } =
                    (typeBinding as TypeBinding<T & WeakKey>)
                        .bindValue(
                            wrappedValue,
                            pointerAddress,
                        );
                metadata = newMetadata;
                wrappedValue = value;
            }
        }

        // if not immutable, observe to keep the pointer 'live' and receive updates
        let observerId: number | null = null;
        if (mutability !== DIFReferenceMutability.Immutable) {
            observerId = this.observePointerBindDirect(
                pointerAddress,
                (update) => {
                    // if source_id is not own transceiver id, handle pointer update
                    if (update.source_id !== this.#transceiver_id) {
                        try {
                            this.handlePointerUpdate(
                                pointerAddress,
                                wrappedValue,
                                update.data,
                                typeBinding,
                            );
                        } catch (e) {
                            console.error(
                                "Error handling pointer update",
                                e,
                            );
                            throw e;
                        }
                    }
                    // call all local observers
                    const observers = this.#observers.get(pointerAddress);
                    if (observers) {
                        for (const cb of observers.values()) {
                            try {
                                cb(update.data);
                            } catch (e) {
                                console.error(
                                    "Error in pointer observer callback",
                                    e,
                                );
                            }
                        }
                    }
                    console.debug("Pointer update received", update);
                },
            );
        }

        this.cacheWrappedReferenceValue(
            pointerAddress,
            value,
            wrappedValue,
            observerId,
            metadata,
        );

        // set up observers
        return wrappedValue as T | Ref<T>;
    }

    /**
     * Handles a pointer update received from the DATEX core runtime.
     * for non-primitive values.
     * If the pointer is cached and has a dereferenceable value, it updates the value.
     * @param pointerAddress - The address of the pointer being updated.
     * @param update - The DIFUpdateData containing the update information.
     * @returns True if the pointer was found and updated, false otherwise.
     */
    protected handlePointerUpdate<T extends WeakKey>(
        pointerAddress: string,
        value: T,
        update: DIFUpdateData,
        typeBinding: TypeBinding<T> | null,
    ): boolean;
    /**
     * Handles a pointer update received from the DATEX core runtime.
     * for primitive values (typeBinding not supported).
     * If the pointer is cached and has a dereferenceable value, it updates the value.
     * @param pointerAddress - The address of the pointer being updated.
     * @param update - The DIFUpdateData containing the update information.
     * @returns True if the pointer was found and updated, false otherwise.
     */
    protected handlePointerUpdate<T>(
        pointerAddress: string,
        value: T,
        update: DIFUpdateData,
        typeBinding: null,
    ): boolean;
    protected handlePointerUpdate<T>(
        pointerAddress: string,
        value: T,
        update: DIFUpdateData,
        typeBinding?: TypeBinding<WeakKey & T> | null,
    ): boolean {
        const cached = this.#cache.get(pointerAddress);
        if (!cached) return false;
        const deref = cached.value.deref();
        if (!deref) return false;

        if (deref instanceof Ref && update.kind === DIFUpdateKind.Replace) {
            deref.updateValueSilently(this.resolveDIFValueContainerSync(
                update.value,
            ));
        }
        // handle generic updates for values (depending on type interface definition)
        if (typeBinding) {
            typeBinding.handleDifUpdate(
                value as WeakKey & T,
                pointerAddress,
                update,
            );
        }

        return true;
    }

    /**
     * Caches the given reference value with the given address in the JS side cache.
     * The reference must already be wrapped if necessary.
     */
    protected cacheWrappedReferenceValue(
        address: string,
        originalValue: unknown,
        proxiedValue: WeakKey,
        observerId: number | null,
        metadata: CustomReferenceMetadata = {},
    ): void {
        const isProxifiedValue = this.isWeakKey(originalValue) &&
            originalValue !== proxiedValue;

        this.#cache.set(address, {
            value: new WeakRef(proxiedValue),
            originalValue: isProxifiedValue ? originalValue : null,
            observerId,
        });

        this.#referenceMetadata.set(proxiedValue, {
            address,
            customMetadata: metadata,
        });

        // store in proxy mapping if original value is not identical to proxied value
        // and original value is a weak key
        if (isProxifiedValue) {
            this.#proxyMapping.set(
                originalValue,
                new WeakRef(proxiedValue),
            );
        }

        // register finalizer to clean up the cache and free the reference in the runtime
        // when the object is garbage collected
        const finalizationRegistry = new FinalizationRegistry(
            (address: string) => {
                const originalValue = this.#cache.get(address)?.originalValue;
                // remove from proxy mapping if applicable
                if (originalValue) {
                    this.#proxyMapping.delete(originalValue);
                }
                this.#cache.delete(address);
                // remove local observers
                this.#observers.delete(address);
                // if observer is active, unregister it
                if (observerId !== null) {
                    this.unobserveReferenceBindDirect(address, observerId);
                }
            },
        );
        finalizationRegistry.register(proxiedValue, address);
    }

    protected getCachedReference(address: string): WeakKey | undefined {
        const cached = this.#cache.get(address);
        if (cached) {
            const deref = cached.value.deref();
            if (deref) {
                return deref;
            }
        }
        return undefined;
    }

    /**
     * Creates a new reference containg the given JS value.
     * The returned value is a proxy object that behaves like the original object,
     * but also propagates changes between JS and the DATEX runtime.
     * If a reference for the given value already exists, an error is thrown.
     */
    public createTransparentReference<
        V,
        M extends DIFReferenceMutability =
            typeof DIFReferenceMutability.Mutable,
    >(
        value: V,
        allowedType: DIFTypeDefinition | null = null,
        mutability: M = DIFReferenceMutability.Mutable as M,
    ): PointerOut<V, M> {
        // if already bound to a reference, return the existing reference proxy (or the value itself)
        const pointerAddress = this.getPointerAddressForValue(value as WeakKey);
        if (pointerAddress) {
            throw new Error(
                `Value is already bound to a reference ($${pointerAddress}). Cannot create a new reference for the same value.`,
            );
        }

        const difValue = this.convertJSValueToDIFValueContainer(value);
        const ptrAddress = this.createReferenceFromDIFValue(
            difValue,
            allowedType,
            mutability,
        );
        // get inferred allowed type from pointer if not explicitly set
        if (!allowedType) {
            allowedType = (this.#handle.resolve_pointer_address_sync(
                ptrAddress,
            ) as DIFReference).allowed_type;
        }
        return this.initReference(
            ptrAddress,
            value,
            mutability,
            allowedType,
        ) as PointerOut<V, M>;
    }

    protected isPrimitiveValue(
        value: unknown,
    ): value is null | undefined | boolean | number | bigint | string | symbol {
        return value === null || value === undefined ||
            typeof value === "boolean" ||
            typeof value === "number" || typeof value === "bigint" ||
            typeof value === "string" || typeof value === "symbol";
    }
    protected isWeakKey(
        value: unknown,
    ): value is WeakKey {
        // non-registered symbols are valid WeakKeys
        return (typeof value === "symbol" && !Symbol.keyFor(value)) ||
            !this.isPrimitiveValue(value);
    }

    /**
     * Wraps a given JS value in a Ref proxy if necessary.
     */
    protected wrapJSValue<T>(
        value: T,
        pointerAddress: string,
        _type: DIFTypeDefinition | null = null,
    ): (T | Ref<unknown>) & WeakKey {
        // primitive values are always wrapped in a Ref proxy
        if (this.isWeakKey(value)) {
            return value;
        } else {
            return new Ref(value, pointerAddress, this);
        }
    }

    private isRef(value: unknown): value is Ref<unknown> {
        return value instanceof Ref;
    }

    private wrapJSObjectInProxy<T extends object>(
        value: T,
    ): (T | Ref<unknown>) & WeakKey {
        // deno-lint-ignore no-this-alias
        const self = this;
        return new Proxy(value, {
            get(target, prop, receiver) {
                const val = Reflect.get(target, prop, receiver);
                if (val && typeof val === "object" && !self.isRef(val)) {
                    return self.wrapJSObjectInProxy(val);
                }
                return val;
            },
            set(target, prop, newValue, receiver) {
                const oldValue = Reflect.get(target, prop, receiver);
                if (!self.isRef(oldValue)) {
                    throw new Error(
                        `Cannot modify non-Ref property "${String(prop)}"`,
                    );
                }
                oldValue.value = newValue;
                return true;
            },
            deleteProperty() {
                throw new Error(
                    "Cannot delete properties from a Refs-only object",
                );
            },
            defineProperty() {
                throw new Error(
                    "Cannot define new properties on a Refs-only object",
                );
            },
        });
    }

    /**
     * Returns the pointer address for the given value if it is already cached, or null otherwise.
     */
    public getPointerAddressForValue<T extends WeakKey>(
        value: T,
    ): string | null {
        return this.#referenceMetadata.get(value)?.address || null;
    }

    /**
     * Returns the reference metadata for the given value if it is registered.
     * The caller must ensure that the correct type M is used and the reference is already registered.
     * If the reference is not found, an error is thrown.
     */
    public getReferenceMetadataUnsafe<
        M extends CustomReferenceMetadata,
        T extends WeakKey,
    >(
        value: T,
    ): ReferenceMetadata<M> {
        const metadata = this.tryGetReferenceMetadata<M, T>(value);
        if (!metadata) {
            panic("Reference metadata not found for the given value");
        }
        return metadata;
    }

    /**
     * Returns the reference metadata for the given value if it is registered, or null otherwise.
     */
    public tryGetReferenceMetadata<
        M extends CustomReferenceMetadata,
        T extends WeakKey,
    >(
        value: T,
    ): ReferenceMetadata<M> | null {
        return (
            this.#referenceMetadata.get(value) ??
                this.#referenceMetadata.get(
                    this.#proxyMapping.get(value)?.deref() as WeakKey,
                ) ??
                null
        ) as ReferenceMetadata<M> | null;
    }

    public isReference(value: WeakKey): boolean {
        return this.#referenceMetadata.has(value) ||
            this.#proxyMapping.has(value);
    }

    public getReferenceProxy<T extends WeakKey>(value: T): T | null {
        const reference = this.#referenceMetadata.get(value);
        if (reference) {
            return value;
        }
        const proxyRef = this.#proxyMapping.get(value);
        if (proxyRef) {
            const deref = proxyRef.deref();
            if (deref) {
                return deref as T;
            } else {
                panic("Reference proxy has been garbage collected");
            }
        } else {
            return null;
        }
    }

    /**
     * Converts a given JS value to its DIFValueContainer representation.
     * This method can be called statically or with an instance to use the instance's DIFHandler context.
     * NOTE: When called statically, there is no cache for already registered references, meaning that new references will be created
     * for the same object each time this method is called.
     */
    public static convertJSValueToDIFValueContainer<T extends unknown>(
        value: T,
        difHandlerInstance?: DIFHandler,
    ): DIFValueContainer {
        // if the value is a registered reference, return its address
        const existingReference = difHandlerInstance &&
            difHandlerInstance.tryGetReferenceMetadata(
                value as WeakKey,
            );
        if (existingReference) {
            return existingReference.address;
        }
        // assuming core values
        // TODO: handle custom types
        if (value === null) {
            return {
                value: null,
            };
        } else if (value === undefined) {
            return {
                type: {
                    kind: DIFTypeDefinitionKind.ImplType,
                    def: [
                        CoreTypeAddress.null,
                        [JsLibTypeAddress.undefined],
                    ],
                },
                value: null,
            };
        } else if (typeof value === "boolean") {
            return {
                value,
            };
        } else if (typeof value === "number") {
            return {
                value,
            };
        } else if (typeof value === "bigint") {
            return {
                type: CoreTypeAddress.integer_ibig,
                value: value.toString(), // convert bigint to string for DIFValue
            };
        } else if (typeof value === "string") {
            return {
                value,
            };
        } else if (value instanceof Endpoint) {
            return {
                type: CoreTypeAddress.endpoint,
                value: value.toString(),
            };
        } else if (Array.isArray(value)) {
            return {
                value: value.map((v) =>
                    this.convertJSValueToDIFValueContainer(v)
                ),
            };
        } else if (value instanceof Map) {
            const map: [DIFValueContainer, DIFValueContainer][] = value
                .entries().map((
                    [k, v],
                ) => [
                    this.convertJSValueToDIFValueContainer(k),
                    this.convertJSValueToDIFValueContainer(v),
                ] satisfies [DIFValueContainer, DIFValueContainer]).toArray();
            return {
                type: CoreTypeAddress.map,
                value: map,
            };
        } else if (typeof value === "object") {
            const map: Record<string, DIFValueContainer> = {};
            for (const [key, val] of Object.entries(value)) {
                map[key] = this.convertJSValueToDIFValueContainer(val);
            }
            return {
                value: map,
            };
        }
        throw new Error("Unsupported type for conversion to DIFValue");
    }

    /**
     * Instance method wrapper for static convertJSValueToDIFValueContainer
     * Converts a given JS value to its DIFValueContainer representation.
     * @param value
     */
    public convertJSValueToDIFValueContainer<T extends unknown>(
        value: T,
    ): DIFValueContainer {
        return DIFHandler.convertJSValueToDIFValueContainer(
            value,
            this,
        );
    }

    /** DIF update handler utilities */

    /**
     * Triggers a 'set' update for the given pointer address, key and value.
     */
    public triggerSet<K, V>(
        pointerAddress: string,
        key: K,
        value: V,
    ) {
        const difKey = this.convertJSValueToDIFValueContainer(key);
        const difValue = this.convertJSValueToDIFValueContainer(value);
        const update: DIFUpdateData = {
            kind: DIFUpdateKind.Set,
            key: { kind: "value", value: difKey },
            value: difValue,
        };
        console.log("Triggering set update", update);
        this.updateReference(pointerAddress, update);
    }

    /**
     * Triggers a 'set' update for the given pointer address, index and value.
     */
    public triggerIndexSet<V>(
        pointerAddress: string,
        index: number | bigint,
        value: V,
    ) {
        if (typeof index !== "bigint" && !Number.isInteger(index)) {
            throw new Error("Index must be a non-negative integer");
        }
        const difValue = this.convertJSValueToDIFValueContainer(value);
        const update: DIFUpdateData = {
            kind: DIFUpdateKind.Set,
            key: { kind: "index", value: Number(index) },
            value: difValue,
        };
        console.log("Triggering index set update", update);
        this.updateReference(pointerAddress, update);
    }

    /**
     * Triggers an 'append' update for the given pointer address and value.
     */
    public triggerAppend<V>(
        pointerAddress: string,
        value: V,
    ) {
        const difValue = this.convertJSValueToDIFValueContainer(value);
        const update: DIFUpdateData = {
            kind: DIFUpdateKind.Append,
            value: difValue,
        };
        console.log("Triggering append update", update);
        this.updateReference(pointerAddress, update);
    }

    /**
     * Triggers a 'replace' update for the given pointer address and key.
     */
    public triggerReplace<V>(
        pointerAddress: string,
        value: V,
    ) {
        const difValue = this.convertJSValueToDIFValueContainer(value);
        const update: DIFUpdateData = {
            kind: DIFUpdateKind.Replace,
            value: difValue,
        };
        console.log("Triggering replace update", update);
        this.updateReference(pointerAddress, update);
    }

    /**
     * Triggers a 'delete' update for the given pointer address and key.
     */
    public triggerDelete<K>(
        pointerAddress: string,
        key: K,
    ) {
        const difKey = this.convertJSValueToDIFValueContainer(key);
        const update: DIFUpdateData = {
            kind: DIFUpdateKind.Delete,
            key: { kind: "value", value: difKey },
        };
        console.log("Triggering delete update", update);
        this.updateReference(pointerAddress, update);
    }

    /**
     * Triggers a 'clear' update for the given pointer address.
     */
    public triggerClear(pointerAddress: string) {
        const update: DIFUpdateData = {
            kind: DIFUpdateKind.Clear,
        };
        console.log("Triggering clear update", update);
        this.updateReference(pointerAddress, update);
    }

    /**
     * Triggers a 'list splice' update for the given pointer address.
     */
    public triggerListSplice<V>(
        pointerAddress: string,
        start: number,
        deleteCount: number,
        items: V[],
    ) {
        const difItems = items.map((item) =>
            this.convertJSValueToDIFValueContainer(item)
        );
        const update: DIFUpdateData = {
            kind: DIFUpdateKind.ListSplice,
            start,
            delete_count: deleteCount,
            items: difItems,
        };
        console.log("Triggering list splice update", update);
        this.updateReference(pointerAddress, update);
    }
}

type PrimitiveValue = string | number | boolean | bigint | symbol;

type WidenLiteral<T> = T extends string ? string
    : T extends number ? number
    : T extends boolean ? boolean
    : T extends bigint ? bigint
    : T extends symbol ? symbol
    : T;

type IsRef<T> = T extends Ref<unknown> ? true : false;
type ContainsRef<T> = IsRef<T> extends true ? true
    : T extends object
        ? { [K in keyof T]: ContainsRef<T[K]> }[keyof T] extends true ? true
        : false
    : false;

/** A type representing an assignable reference or a plain value **/
export type AssignableRef<T> = Ref<T> | T & { value?: T };

type Builtins =
    | ((...args: unknown[]) => unknown)
    | Date
    | RegExp
    | Map<unknown, unknown>
    | Set<unknown>
    | WeakMap<WeakKey, unknown>
    | WeakSet<WeakKey>
    | Array<unknown>;

type IsPlainObject<T> = T extends Builtins ? false
    : T extends object ? true
    : false;

type ObjectFieldOut<T, M extends DIFReferenceMutability> = T extends
    Ref<infer U> ? M extends typeof DIFReferenceMutability.Immutable ? Ref<U>
    : AssignableRef<U>
    : IsPlainObject<T> extends true ? (
            ContainsRef<T> extends true
                ? M extends typeof DIFReferenceMutability.Immutable
                    ? { readonly [K in keyof T]: ObjectFieldOut<T[K], M> }
                : { [K in keyof T]: ObjectFieldOut<T[K], M> }
                : { readonly [K in keyof T]: ObjectFieldOut<T[K], M> }
        )
    : T;

export type PointerOut<V, M extends DIFReferenceMutability> = V extends
    Ref<infer U> ? M extends typeof DIFReferenceMutability.Immutable ? Ref<U>
    : AssignableRef<U>
    : IsPlainObject<V> extends true ? (
            M extends typeof DIFReferenceMutability.Immutable
                ? { readonly [K in keyof V]: V[K] }
                : { [K in keyof V]: V[K] }
            // ContainsRef<V> extends true
            //     ? M extends typeof DIFReferenceMutability.Immutable
            //         ? { readonly [K in keyof V]: ObjectFieldOut<V[K], M> }
            //     : { [K in keyof V]: ObjectFieldOut<V[K], M> }
            //     : { [K in keyof V]: ObjectFieldOut<V[K], M> }
        )
    : V extends PrimitiveValue ? Ref<
            M extends typeof DIFReferenceMutability["Immutable"] ? V
                : WidenLiteral<V>
        >
    : V;
