/**
 * @module DIF Handler
 * Represents the main interface for interacting with the DATEX Core via DIF from JavaScript.
 */

import type {JSDIFInterface, JSRuntime} from "../datex.ts";
import {Endpoint} from "../lib/special-core-types/endpoint.ts";
import {Range} from "../lib/special-core-types/range.ts";
import {
    DIFCallableKind,
    DIFCallableTypeDefinition,
    type DIFCoreValue,
    DIFCoreValueCallable,
    type DIFOptionalValueContainer,
    type DIFProperty,
    type DIFTypeDefinition,
    type DIFUpdate,
    type DIFUpdateData,
    DIFUpdateKind,
    type DIFValue,
    type DIFValueContainer,
    type ObserveOptions,
} from "./types/mod.ts";
import {CoreLibTypeId} from "./core.ts";
import {type TypeBinding, TypeRegistry} from "./type-registry.ts";
import {panic, unimplemented, unreachable} from "../utils/exceptions.ts";
import {isJsUndefined, JS_UNDEFINED} from "../lib/special-core-types/undefined.ts";
import type {DIFBaseSharedValueContainer} from "./types/value.ts";
import {SharedContainerMutability} from "../shared-container/base-shared-container.ts";
import {
    addressWithoutOwnership,
    type AsShared,
    BaseSharedContainer,
    combinePointerAddressWithOwnership,
    type MaybeSharedRef,
    type PointerAddress,
    ReferencedSharedContainer,
    type SharedContainer,
    type SharedRef,
    splitPointerAddressWithOwnership,
} from "../shared-container/mod.ts";
import {DIFSharedContainerOwnership} from "./types/type.ts";
import type {DIFUpdateReturn} from "./types/update.ts";
import {appendEntry, clear, deleteEntry, DIFPropertyKind, listSplice, replace, setEntry} from "./update.ts";
import {JsLibTypeAddress} from "./js-lib.ts";
import {isJsMapTypeDefinition, registerCoreTypeBindings} from "../lib/mod.ts";
import {OwnedSharedContainer} from "../shared-container/owned.ts";
import {EMPTY_TAG, Tagged} from "../lib/special-core-types/tagged.ts";
import {ibig} from "./helpers/mod.ts";
import {isCoreLibTypeDefinition, isSharedContainerTypeDefinition} from "./helpers/type-definition.ts";
import {getCoreLibTypeIdForJSValue} from "./helpers/type-id.ts";

/**
 * Some DIF methods may return an optional ValueContainer, so does the execute_sync, when no result is returned.
 * DIF must differentiate between null and no result, so we wrap DIFOptionalValueContainer.
 * @param value - The DIFOptionalValueContainer to collapse.
 * @returns The contained DIFValueContainer if present, or undefined if the value is not present.
 */
function collapseDIFOption(value: DIFOptionalValueContainer): DIFValueContainer | undefined {
    if (value === null) {
        return undefined;
    } else {
        if (Array.isArray(value) && value.length === 1) {
            return value[0];
        } else {
            throw new Error("Invalid DIFOptionalValueContainer format: expected an array of length 1 or null");
        }
    }
}

/**
 * Converts special float string representations ("nan", "infinity", "-infinity") to the JS values NaN, Infinity and -Infinity respectively.
 * @param value - The string representation of the float value.
 * @returns The corresponding JS number value for the special float representation.
 * @throws If the input value is not a valid special float representation.
 */
function specialDIFFloatToNumber(value: string): number {
    if (!isSpecialDIFFloatString(value)) {
        throw new Error(`Expected a special float string ("nan", "infinity", "-infinity"), got ${value}`);
    }
    if (value === "nan") {
        return NaN;
    } else if (value === "infinity") {
        return Infinity;
    } else if (value === "-infinity") {
        return -Infinity;
    }
    unreachable(`Invalid special float string: ${value}`);
}
function isSpecialDIFFloatString(value: string): boolean {
    return ["nan", "infinity", "-infinity"].includes(value);
}

export const IS_PROXY_ACCESS = Symbol("IS_PROXY_ACCESS");

export type CustomReferenceMetadata = Record<string | symbol, unknown> & {
    [IS_PROXY_ACCESS]?: boolean;
};

export type ReferenceMetadata<M extends CustomReferenceMetadata> = {
    address: PointerAddress;
    customMetadata: M;
};

export type CachedSharedContainer =
    | SharedRef<object>
    | BaseSharedContainer<unknown, SharedContainerMutability>
    | OwnedSharedContainer<unknown>
    | ReferencedSharedContainer<unknown>;

/**
 * A value that can either be a direct JS value, or a shared value container.
 * It appears on the same level, as the Value Container from the Rust POV and can represent a local value (JS) or a shared value.
 * Each ValueContainer from Rust can be represented as Value<T> on the JS side.
 */
type Value<T> = T | AsShared<T, SharedContainerMutability>;


export type CacheData = {
    value: WeakRef<BaseSharedContainer<unknown, SharedContainerMutability>>;
    maxOwnership: DIFSharedContainerOwnership;
    originalValue: object | null;
    observerId: number | null;
};

const DATEX_CALLABLE_HASH: unique symbol = Symbol("DATEX_CALLABLE_HASH");

/**
 * The DIFHandler class provides methods to interact with the DATEX Core DIF runtime,
 * including executing Datex scripts, creating and managing references, and observing changes.
 * It includes a local reference cache to optimize performance and reduce cross-language calls.
 */
export class DIFHandler {
    /** The JSRuntime interface for the underlying Datex Core runtime */
    #runtime: JSRuntime;
    readonly #handle: JSDIFInterface;

    // always 0 for now - potentially used for multi DIF transceivers using the same underlying runtime
    readonly #transceiver_id = 0;

    // The set of observers that are currently registered for cache updates.
    readonly #cacheObservers = new Set<() => void>();

    /**
     * The reference cache for storing and reusing object instances on the JS side
     * The observerId is only set if the reference is being observed (if not final).
     */
    readonly #cache = new Map<PointerAddress, CacheData>();

    /**
     * Maps the original value to a proxy value
     * (if the values is bound to a custom proxy wrapper)
     */
    readonly #proxyMapping = new WeakMap<WeakKey, WeakRef<BaseSharedContainer<unknown, SharedContainerMutability>>>();

    /**
     * The reference metadata map, storing metadata for each cached reference.
     */
    readonly #baseSharedContainerMetadata = new WeakMap<
        BaseSharedContainer<unknown, SharedContainerMutability>,
        ReferenceMetadata<CustomReferenceMetadata>
    >();

    /**
     * The reference metadata map, storing metadata for each shared reference.
     */
    readonly #jsValueSharedContainerMetadata = new WeakMap<
        object,
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
     * @returns The {@link JSDIFInterface} instance.
     */
    get _handle(): JSDIFInterface {
        return this.#handle;
    }

    /**
     * This should only be used for debugging purposes, not for modifying the cache.
     * @returns The map of cached references.
     */
    get _cache(): Map<PointerAddress, CacheData> {
        return this.#cache;
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
     * This also sets up all type bindings for core types (array, map, ...) on the runtime.
     * @param runtime - The JSRuntime instance for executing Datex scripts.
     */
    constructor(
        runtime: JSRuntime,
    ) {
        this.#runtime = runtime;
        this.#handle = runtime.dif_interface();

        // setup all core type bindings on the runtime (array, map, ...)
        registerCoreTypeBindings(this.#type_registry);
    }

    /**
     * Executes a Datex script asynchronously and returns a Promise that resolves to a DIFContainer.
     * @param datexScript - The Datex script source code to execute.
     * @param values - An optional array of values to inject into the script.
     * @returns A Promise that resolves to the execution result as a DIFContainer.
     * @throws If an error occurs during execution.
     */
    public async executeDIF(
        datexScript: string,
        values: unknown[] | null = [],
    ): Promise<DIFValueContainer | undefined> {
        return collapseDIFOption(
            await this.#runtime.execute(
                datexScript,
                this.convertToDIFValues(values),
            ) as DIFOptionalValueContainer,
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
    ): DIFValueContainer | undefined {
        return collapseDIFOption(
            this.#runtime.execute_sync(
                datexScript,
                this.convertToDIFValues(values),
            ) as DIFOptionalValueContainer,
        );
    }

    /**
     * Creates a new shared value for the specified DIF value.
     * @param difValueContainer - The DIFValueContainer value to create a pointer for.
     * @param allowedType - The allowed type for the pointer.
     * @param mutability - The mutability of the pointer.
     * @returns The created pointer address.
     */
    public constructSharedValue(
        difValueContainer: DIFValueContainer,
        mutability: SharedContainerMutability = SharedContainerMutability.Mutable,
        allowedType: DIFTypeDefinition | null = null,
    ): PointerAddress {
        const baseSharedValueContainer: [
            DIFValueContainer, // value
            SharedContainerMutability, // container mutability
        ] | DIFBaseSharedValueContainer = [
            difValueContainer,
            mutability,
        ];
        if (allowedType) {
            (baseSharedValueContainer as unknown[])[2] = allowedType;
        }

        return this.#handle.create_pointer(baseSharedValueContainer) as PointerAddress;
    }

    /**
     * Updates the DIF value at the specified address.
     * @param address - The address of the DIF value to update.
     * @param update_data - The DIFUpdate object containing the update information.
     */
    public updateSharedValue(address: PointerAddress, update_data: DIFUpdateData): DIFUpdateReturn {
        return this.#handle.update(address, [this.#transceiver_id, ...update_data]);
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
    public observeSharedValueBindDirect(
        address: PointerAddress,
        callback: (value: DIFUpdate) => void,
        options: ObserveOptions = { relay_own_updates: false },
    ): number {
        return this.#runtime.dif_interface().observe_pointer(
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
        address: PointerAddress,
        observerId: number,
        options: ObserveOptions,
    ) {
        this.#runtime.dif_interface().update_observer_options(
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
        address: PointerAddress,
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
        address: PointerAddress,
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
    public unobserveSharedValueBindDirect(address: PointerAddress, observerId: number) {
        this.#runtime.dif_interface().unobserve_pointer(address, observerId);
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
        address: PointerAddress,
        callback: (value: DIFUpdateData) => void,
    ): number {
        let cached = this.#cache.get(address);
        if (!cached) {
            // first resolve the pointer to make sure it's loaded in the cache
            this.resolvePointerAddress(DIFSharedContainerOwnership.ImmutableRef, address);
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
    public unobservePointer(address: PointerAddress, observerId: number): boolean {
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
     * Calls a sync callable DIF value identified by the given hash with the specified arguments.
     */
    private callCallableSync(hash: string, args: unknown[]) {
        const result = collapseDIFOption(this.#handle.apply_sync(
            [CoreLibTypeId.Callable, [hash, null]] satisfies DIFValue,
            args.map((arg) => this.convertJSValueToDIFValueContainer(arg))
        ));
        if (result === undefined) return result;
        return this.resolveDIFValueContainer(result);
    }

    /**
     * Calls an async callable DIF value identified by the given hash with the specified arguments.
     */
    private async callCallableAsync(hash: string, args: unknown[]) {
        const result = collapseDIFOption(await this.#handle.apply_async(
            [CoreLibTypeId.Callable, [hash, null]] satisfies DIFValue,
            args.map((arg) => this.convertJSValueToDIFValueContainer(arg))
        ));
        if (result === undefined) return result;
        return this.resolveDIFValueContainer(result);
    }

    /**
     * Resolves a DIFValue to its corresponding JS value.
     * This function handles core types and custom types (not yet implemented).
     * It returns the resolved value as the specified type T.
     * @param value
     */
    public resolveDIFValue<T extends unknown>(
        value: DIFValue,
    ): T {
        // direct interpretation of trivial types without type annotation
        if (value === null) {
            return null as T;
        } else if (isJsUndefined(value)) {
            return undefined as T;
        } else if (typeof value === "string") {
            return value as T;
        } else if (typeof value === "boolean") {
            return value as T;
        } else if (typeof value === "number") {
            return value as T;
        }

        // custom interpretation means
        if (!Array.isArray(value) || value.length < 2 || value.length > 3) {
            throw new Error(
                "Invalid DIFValue format: expected an array for non-primitive types",
            );
        }

        const [type, core, definition] = value as [CoreLibTypeId, DIFCoreValue] | [
            CoreLibTypeId,
            DIFCoreValue,
            DIFTypeDefinition,
        ];

        let val: unknown = null;
        if (type === CoreLibTypeId.null) {
            if (core !== null) {
                throw new Error("Expected null value for null type");
            }
            val = null;
        } else if (type === CoreLibTypeId.boolean) {
            if (typeof core !== "boolean") {
                throw new Error("Expected boolean value for boolean type");
            }
            val = core;
        } else if (
            ([
                CoreLibTypeId.integer_i8,
                CoreLibTypeId.integer_i16,
                CoreLibTypeId.integer_i32,
                CoreLibTypeId.integer_u8,
                CoreLibTypeId.integer_u16,
                CoreLibTypeId.integer_u32,
                CoreLibTypeId.integer_i64,
            ] as CoreLibTypeId[]).includes(type)
        ) {
            if (typeof core !== "number") {
                throw new Error("Expected number value for integer type");
            }
            val = core;
        } else if (type === CoreLibTypeId.integer) {
            if (typeof core === "string") {
                val = parseInt(core, 10);
            } else throw new Error("Expected number value for integer type");
        } else if (
            ([
                CoreLibTypeId.integer_i128,
                CoreLibTypeId.integer_u64,
                CoreLibTypeId.integer_u128,
                CoreLibTypeId.integer_ibig,
            ] as CoreLibTypeId[]).includes(type)
        ) {
            if (typeof core !== "string" && typeof core !== "number") {
                throw new Error("Expected string or number value for big integer type");
            }
            val = BigInt(core);
        } else if (
            ([
                CoreLibTypeId.decimal_dbig,
                CoreLibTypeId.decimal, // FIXME rational notation 3/4
            ] as CoreLibTypeId[]).includes(type)
        ) {
            if (typeof core !== "string") {
                throw new Error(
                    "Expected string value for decimal big type" + typeof core + " " + JSON.stringify(core),
                );
            }
            if (isSpecialDIFFloatString(core)) {
                val = specialDIFFloatToNumber(core);
            } // FIXME this is a temporary solution until we have a proper decimal implementation
            else if (core.includes("/")) {
                const [numerator, denominator] = core.split("/").map((part) => part.trim());
                val = parseFloat(numerator) / parseFloat(denominator);
            } else if (core.includes(".")) {
                val = parseFloat(core);
            } else {
                throw new Error("Expected a valid decimal string for decimal big type");
            }
        } else if (
            ([
                CoreLibTypeId.decimal_f32,
                CoreLibTypeId.decimal_f64,
            ] as CoreLibTypeId[]).includes(type)
        ) {
            if (typeof core === "string") {
                val = specialDIFFloatToNumber(core);
            } else if (typeof core === "number") {
                val = core;
            } else {
                throw new Error("Expected number value for decimal type");
            }
        } else if (type === CoreLibTypeId.text) {
            if (typeof core !== "string") {
                throw new Error("Expected string value for text type");
            }
            val = core;
        } else if (type === CoreLibTypeId.endpoint) {
            if (typeof core !== "string") {
                throw new Error("Expected string value for endpoint type");
            }
            val = Endpoint.get(core);
        } else if (type === CoreLibTypeId.Range) {
            if (!Array.isArray(core) || core.length !== 2) {
                throw new Error("Expected array of length 2 for range type");
            }
            const [start, end] = core as [DIFValueContainer, DIFValueContainer];
            const res = [
                this.resolveDIFValueContainer<number>(start),
                this.resolveDIFValueContainer<number>(end),
            ];
            // FIXME fix range
            val = new Range(res[0] as number, res[1] as number) as T;
        } else if (type === CoreLibTypeId.List) {
            if (!Array.isArray(core)) {
                throw new Error("Expected array value for list type");
            }
            val = (core as DIFValueContainer[]).map((v) => this.resolveDIFValueContainer(v)) as T;
        } else if (type === CoreLibTypeId.Map) {
            if (Array.isArray(core)) {
                const map = new Map<unknown, unknown>();
                for (const [key, value] of core as [DIFValueContainer, DIFValueContainer][]) {
                    map.set(
                        this.resolveDIFValueContainer(key),
                        this.resolveDIFValueContainer(value),
                    );
                }
                val = map as T;
            } else if (typeof core === "object" && core !== null) {
                const obj: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(core)) {
                    obj[key] = this.resolveDIFValueContainer(value);
                }
                val = obj as T;
                if (definition && isJsMapTypeDefinition(definition)) {
                    val = new Map(Object.entries(obj)) as T;
                }
            } else {
                throw new Error("Expected array of key-value pairs or object for map type");
            }

        }
        else if (type === CoreLibTypeId.Callable) {
            const [hash, name, requiresAsync] = core as DIFCoreValueCallable;
            const callableBuilder = new Function(
                "fn",
                "hash",
                `return ${requiresAsync?'async ' : ''}function ${name||""}(...args) {return fn(hash, args)}`
            );
            const boundCallable = requiresAsync
                ? this.callCallableAsync.bind(this)
                : this.callCallableSync.bind(this)
            const callable = callableBuilder(boundCallable, hash);
            callable[DATEX_CALLABLE_HASH] = hash;
            return callable;
        }
        else {
            throw new Error(`Unsupported DIF type: ${type}`);
        }

        // for tagged type definition, wrap in Tagged
        if (definition && typeof definition === "object" && "tagged_type" in definition) {
            const [tag, innerType] = definition.tagged_type;
            // special case: empty tag
            if (val === null && innerType === CoreLibTypeId.Unit) {
                val = new Tagged(tag, EMPTY_TAG);
            } else {
                // TODO: handle other innerTypes if not default type
                val = new Tagged(tag, val) as T;
            }
        }

        // FIXME custom type resolution not implemented yet, just return the core value for now
        return val as T;

        // custom types not implemented yet
        // throw new Error("Custom type resolution not implemented yet");
    }

    /**
     * Resolves a DIFValueContainer (either a DIFValue or a pointer address) to its corresponding JS value.
     * If the container contains pointers that are not yet loaded in memory, it returns a Promise that resolves to the value.
     * Otherwise, it returns the resolved value directly.
     * @param value - The DIFValueContainer to resolve.
     * @returns The resolved value as type T, or a Promise that resolves to type T.
     */
    public resolveDIFValueContainer<T>(
        value: DIFValueContainer,
    ): T {
        if (typeof value === "object" && value !== null && !Array.isArray(value) && "$" in value) {
            return this.resolvePointerAddress(
                ...splitPointerAddressWithOwnership(value.$),
            ) as unknown as T;
        } else {
            return this.resolveDIFValue<T>(value);
        }
    }

    /**
     * Resolves a DIFProperty to its corresponding JS value.
     */
    public resolveDIFProperty<T extends unknown>(
        property: DIFProperty,
    ): Value<T> {
        if (typeof property === "number") {
            return property as unknown as T;
        }
        if (typeof property === "string") {
            return property as unknown as T;
        }
        if (typeof property === "object" && property !== null && !Array.isArray(property) && "value" in property) {
            return this.resolveDIFValueContainer<T>(property.value);
        }
        throw new Error("Invalid DIFProperty format");
    }

    /**
     * Resolves a pointer address to its corresponding JS value.
     * If the pointer address is not yet loaded in memory, it returns a Promise that resolves to the value.
     * Otherwise, it returns the resolved value directly.
     * @param address - The pointer address to resolve.
     * @returns The resolved value as type T, or a Promise that resolves to type T.
     */
    public resolvePointerAddress<T extends unknown>(
        ownership: DIFSharedContainerOwnership,
        address: PointerAddress,
    ): SharedContainer<T, SharedContainerMutability> {
        const addressWithOwnership = combinePointerAddressWithOwnership(address, ownership);
        // check cache first
        const cached = this.getCachedStateForSharedContainer<T>(address, ownership);
        if (cached === "insufficient_ownership") {
            // try to resolve with upgraded ownership if possible
            if (
                !this.#handle.has_address_with_ownership(
                    addressWithOwnership,
                )
            ) {
                throw new Error(`Address ${address} not found in runtime with ownership ${ownership} or higher`);
            }
            this.#cache.get(address)!.maxOwnership = ownership;
            const upgraded = this.getCachedStateForSharedContainer<T>(address, ownership);
            if (typeof upgraded === "string") {
                unreachable(`Ownership assertion passed but cache still returns ${upgraded}`);
            }
            return upgraded;
        } else if (cached === "not_cached") {
            // if not in cache, resolve from runtime
            const base: DIFBaseSharedValueContainer = this.#handle.resolve_pointer_address(
                address,
            );
            const value = this.resolveDIFValueContainer<T>(
                base[0],
            );
            // init pointer
            const shared = this.initSharedValue<T, SharedContainerMutability>(
                address,
                value,
                base[1],
                ownership,
            );
            return shared.withOwnership(ownership);
        } else {
            // fallthrough case, already in cache with correct ownership
            return cached;
        }
    }

    /**
     * Retrieves the original value from a proxy value if available
     * @param proxy
     * @returns
     */
    public getOriginalValueFromProxy<T extends WeakKey>(
        proxy: CachedSharedContainer & T,
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
        return values?.map((value) => this.convertJSValueToDIFValueContainer(value)) ||
            null;
    }

    /**
     * Initializes a reference with the given value and mutability, by
     * adding a proxy wrapper if necessary, and setting up observation and caching on the JS side.
     */
    protected initSharedValue<T, Mutability extends SharedContainerMutability>(
        pointerAddress: PointerAddress,
        value: T,
        mutability: Mutability,
        ownership: DIFSharedContainerOwnership,
    ): BaseSharedContainer<T, Mutability> {
        let typeBinding: TypeBinding | null = null;
        let metadata: CustomReferenceMetadata | undefined = undefined;
        const originalValue = value;
        // bind js value (if mutable, nominal type)
        const actualType: DIFTypeDefinition = getCoreLibTypeIdForJSValue(value)!; // FIXME, support custom types and other types

        // only bind the value, if we have a shared container or a core lib type
        const bindJSValue = typeof value === "object" && value !== null &&
            mutability !== SharedContainerMutability.Immutable && (
                isCoreLibTypeDefinition(actualType) || isSharedContainerTypeDefinition(actualType)
            );

        if (bindJSValue) {
            typeBinding = isSharedContainerTypeDefinition(actualType)
                ? this.type_registry.getTypeBinding(addressWithoutOwnership(actualType.shared))
                : this.type_registry.getTypeBindingByCoreLibTypeId(actualType as CoreLibTypeId); // TS Bug

            if (typeBinding) {
                const { value: proxifiedValue, metadata: newMetadata } = typeBinding
                    .bindValue(
                        value as object,
                        pointerAddress,
                    );
                value = proxifiedValue as T;
                metadata = newMetadata;
            }
        }

        // wrap the value in a BaseSharedContainer
        const wrappedValue = new BaseSharedContainer(
            value as MaybeSharedRef<T, Mutability>,
            pointerAddress,
            mutability,
            this,
        );

        // if not immutable, observe to keep the pointer 'live' and receive updates
        let observerId: number | null = null;
        if (mutability !== SharedContainerMutability.Immutable) {
            observerId = this.observeSharedValueBindDirect(
                pointerAddress,
                (update) => {
                    const [sourceId, ...data] = update;
                    // if source_id is not own transceiver id, handle pointer update
                    if (sourceId !== this.#transceiver_id) {
                        try {
                            this.handlePointerUpdate(
                                pointerAddress,
                                wrappedValue,
                                data,
                                typeBinding as T extends object ? TypeBinding<T> : null,
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
                                cb(data);
                            } catch (e) {
                                console.error(
                                    "Error in pointer observer callback",
                                    e,
                                );
                            }
                        }
                    }
                },
            );
        }

        this.cacheWrappedReferenceValue(
            pointerAddress,
            ownership,
            originalValue,
            wrappedValue,
            observerId,
            metadata,
        );

        // set up observers
        return wrappedValue;
    }

    /**
     * Handles a pointer update received from the DATEX core runtime.
     * for non-primitive values.
     * If the pointer is cached and has a dereferenceable value, it updates the value.
     * @param pointerAddress - The address of the pointer being updated.
     * @param update - The DIFUpdateData containing the update information.
     * @returns True if the pointer was found and updated, false otherwise.
     */
    protected handlePointerUpdate<T extends object>(
        pointerAddress: string,
        value: BaseSharedContainer<T>,
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
        pointerAddress: PointerAddress,
        value: BaseSharedContainer<T>,
        update: DIFUpdateData,
        typeBinding: null,
    ): boolean;
    protected handlePointerUpdate<T extends object>(
        pointerAddress: PointerAddress,
        value: BaseSharedContainer<T>,
        update: DIFUpdateData,
        typeBinding?: TypeBinding<T> | null,
    ): boolean {
        const cached = this.#cache.get(pointerAddress);
        if (!cached) return false;
        const deref = cached.value.deref();
        if (!deref) return false;

        if (!typeBinding?.getUpdateHandlerTypes().has(DIFUpdateKind.Replace) && update[1] === DIFUpdateKind.Replace) {
            const path = update[0]; // TODO handle path
            deref.updateValueSilently(this.resolveDIFValueContainer(
                update[2],
            ));
        }
        // handle generic updates for values (depending on type interface definition)
        if (typeBinding) {
            typeBinding.handleDifUpdate(
                value,
                pointerAddress,
                update,
            );
        }

        return true;
    }

    /**
     * Udate the inner value of a BaseSharedContainer in the JS side cache
     * @param base
     */
    protected updateBaseSharedContainerValueCache(
        base: BaseSharedContainer<unknown, SharedContainerMutability>,
    ) {
        if (this.isWeakKey(base.value)) {
            const metadata = this.#baseSharedContainerMetadata.get(base);
            if (metadata) {
                this.#jsValueSharedContainerMetadata.set(base.value as object, metadata);
            } else {
                unreachable!(`No metadata found for base shared container at address ${base.pointerAddress}`);
            }
        }
    }

    /**
     * Caches the given reference value with the given address in the JS side cache.
     * The reference must already be wrapped if necessary.
     */
    protected cacheWrappedReferenceValue(
        address: PointerAddress,
        ownership: DIFSharedContainerOwnership,
        originalValue: unknown,
        baseSharedContainer: BaseSharedContainer<unknown, SharedContainerMutability>,
        observerId: number | null,
        customMetadata: CustomReferenceMetadata = {},
    ): void {
        // check if the value in the base shared container was proxified, or is still the original JS value (for primitive types)
        const isProxifiedValue = this.isWeakKey(originalValue) &&
            this.isWeakKey(baseSharedContainer.value) &&
            originalValue !== baseSharedContainer.value;

        // store the address, with the mapping between BaseSharedContainer and original JS value
        this.#cache.set(address, {
            value: new WeakRef(baseSharedContainer),
            maxOwnership: ownership,
            originalValue: isProxifiedValue ? originalValue : null,
            observerId,
        });

        // store base shared container with metadata
        this.#baseSharedContainerMetadata.set(baseSharedContainer, {
            address,
            customMetadata,
        });
        // update the cache for the original value if it is a weak key
        this.updateBaseSharedContainerValueCache(baseSharedContainer);

        // store in proxy mapping if original value is not identical to proxied value
        // and original value is a weak key
        if (isProxifiedValue) {
            this.#proxyMapping.set(
                originalValue,
                new WeakRef(baseSharedContainer),
            );
        }

        // register finalizer to clean up the cache and free the reference in the runtime
        // when the object is garbage collected
        const finalizationRegistry = new FinalizationRegistry(
            (address: PointerAddress) => {
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
                    this.unobserveSharedValueBindDirect(address, observerId);
                }
                // trigger cache change observers
                this.#triggerCacheObservers();
            },
        );
        finalizationRegistry.register(baseSharedContainer, address);

        // trigger cache change observers
        this.#triggerCacheObservers();
    }

    #triggerCacheObservers() {
        for (const observer of this.#cacheObservers) {
            try {
                observer();
            } catch (e) {
                console.error("Error in cache observer callback", e);
            }
        }
    }

    /**
     * Registers a callback to be invoked whenever the cache changes (e.g., when a reference is added or removed).
     * @param callback
     */
    public registerCacheObserver(callback: () => void) {
        this.#cacheObservers.add(callback);
    }

    protected getCachedStateForSharedContainer<T>(
        address: PointerAddress,
        ownership: DIFSharedContainerOwnership,
    ): SharedContainer<T, SharedContainerMutability> | "not_cached" | "insufficient_ownership" {
        if (!this.#cache.has(address)) {
            return "not_cached";
        }
        const cached = this.#cache.get(address)!;
        const deref = cached.value.deref() as BaseSharedContainer<T, SharedContainerMutability>;
        if (!deref) {
            throw new Error(`Cached reference for address ${address} is not dereferenceable`);
        }

        if (
            // ownership mismatch
            (
                ownership === DIFSharedContainerOwnership.Owned &&
                cached.maxOwnership !== DIFSharedContainerOwnership.Owned
            ) || (cached.maxOwnership === DIFSharedContainerOwnership.ImmutableRef &&
                ownership === DIFSharedContainerOwnership.MutableRef)
        ) {
            return "insufficient_ownership";
        }
        return deref.withOwnership(ownership);
    }

    /**
     * Creates a new reference containg the given JS value.
     * The returned value is a wrapped {@link OwnedSharedContainer} that can be used to access the value and its pointer address.
     */
    public createSharedValueFromJSValue<
        V,
        M extends SharedContainerMutability,
    >(
        value: V,
        allowedType: DIFTypeDefinition | null = null,
        mutability: M = SharedContainerMutability.Mutable as M,
    ): OwnedSharedContainer<V, M> {
        const pointerAddress = this.getPointerAddressForValue(value as unknown as CachedSharedContainer);
        if (pointerAddress) {
            throw new Error(
                `Value is already bound to a reference ($${pointerAddress}). Cannot create a new reference for the same value.`,
            );
        }

        const difValue = this.convertJSValueToDIFValueContainer(value);
        const ptrAddress = this.constructSharedValue(
            difValue,
            mutability,
            allowedType,
        );
        // get inferred allowed type from pointer if not explicitly set
        // if (!allowedType) {
        //     allowedType = (this.#handle.resolve_pointer_address(
        //         ptrAddress,
        //     ) as DIFBaseSharedValueContainer)[2];
        // }

        return new OwnedSharedContainer(this.initSharedValue(
            ptrAddress,
            value,
            mutability,
            DIFSharedContainerOwnership.Owned,
        ));
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
    ): value is CachedSharedContainer {
        // non-registered symbols are valid WeakKeys
        return (typeof value === "symbol" && !Symbol.keyFor(value)) ||
            !this.isPrimitiveValue(value);
    }

    private isBaseSharedContainer(value: unknown): value is BaseSharedContainer<unknown, SharedContainerMutability> {
        return value instanceof BaseSharedContainer;
    }

    /**
     * Tries to collapse a value to a {@link BaseSharedContainer} if it is a {@link ReferencedSharedContainer}
     * or {@link OwnedSharedContainer}, otherwise returns null.
     * If the value is already a {@link BaseSharedContainer}, it is returned as is.
     * @param value
     * @private
     */
    private tryAsBaseSharedContainer<T = unknown>(
        value: unknown,
    ): BaseSharedContainer<T, SharedContainerMutability> | null {
        if (value instanceof BaseSharedContainer) {
            return value;
        } else if (value instanceof ReferencedSharedContainer || value instanceof OwnedSharedContainer) {
            return value._base;
        } else {
            return null;
        }
    }

    /**
     * Returns the pointer address for the given value if it is already cached, or null otherwise.
     */
    public getPointerAddressForValue(
        value: CachedSharedContainer,
    ): PointerAddress | null {
        const maybeBase = this.tryAsBaseSharedContainer(value);
        if (maybeBase) {
            return maybeBase.pointerAddress;
        } else {
            return this.#jsValueSharedContainerMetadata.get(value)?.address || null;
        }
    }

    /**
     * Returns the reference metadata for the given value if it is registered.
     * The caller must ensure that the correct type M is used and the reference is already registered.
     * If the reference is not found, an error is thrown.
     */
    public getReferenceMetadataUnsafe<
        M extends CustomReferenceMetadata,
    >(
        value: CachedSharedContainer,
    ): ReferenceMetadata<M> {
        const metadata = this.tryGetReferenceMetadata<M>(value);
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
    >(
        value: CachedSharedContainer,
    ): ReferenceMetadata<M> | null {
        // if passed value is a BaseSharedContainer, return its metadata directly
        const maybeBase = this.tryAsBaseSharedContainer(value);
        if (maybeBase) {
            return this.#baseSharedContainerMetadata.get(maybeBase) as ReferenceMetadata<M> | null ?? null;
        }

        // request for the proxied (BaseSharedContainer.value) value
        if (this.#jsValueSharedContainerMetadata.has(value)) {
            return this.#jsValueSharedContainerMetadata.get(value) as ReferenceMetadata<M> | null ?? null;
        }

        // otherwise the value is a non-proxied JS object
        const base = this.#proxyMapping.get(value)?.deref();
        return base ? this.#baseSharedContainerMetadata.get(base) as ReferenceMetadata<M> | null ?? null : null;
    }

    // FIXME do we need these two methods still?
    // public isReference(value: object): boolean {
    //     return this.#referenceMetadata.has(value as CachedSharedContainer) ||
    //         this.#proxyMapping.has(value);
    // }
    // public getReferenceProxy<T>(value: CachedSharedContainer<T>): T | null {
    //     const reference = this.#referenceMetadata.get(value);
    //     if (reference) {
    //         return value;
    //     }
    //     const proxyRef = this.#proxyMapping.get(value);
    //     if (proxyRef) {
    //         const deref = proxyRef.deref();
    //         if (deref) {
    //             return deref as T;
    //         } else {
    //             panic("Reference proxy has been garbage collected");
    //         }
    //     } else {
    //         return null;
    //     }
    // }

    /**
     * Converts a given JS value to its DIFValueContainer representation.
     * This method can be called statically or with an instance to use the instance's DIFHandler context.
     * NOTE: When called statically, there is no cache for already registered references, meaning that new references will be created
     * for the same object each time this method is called.
     */
    public static convertJSValueToDIFValueContainer<T extends unknown>(
        value: T,
        difHandlerInstance?: DIFHandler,
        forceExplicitFormat = false,
    ): DIFValueContainer<T> {
        // if the value is a registered reference, return its address
        const ref = (value instanceof ReferencedSharedContainer || value instanceof OwnedSharedContainer)
            ? value._base
            : value;
        const existingReference = difHandlerInstance &&
            difHandlerInstance.tryGetReferenceMetadata(
                ref as CachedSharedContainer,
            );
        if (existingReference) {
            return difHandlerInstance.generateDIFValueContainerForCachedPointer(existingReference.address);
        }
        // TODO: handle custom types

        // core lib prefixed dif core types
        if (value === null) {
            return forceExplicitFormat ? [CoreLibTypeId.null, null] as DIFValue : null;
        } else if (typeof value === "string") {
            return forceExplicitFormat ? [CoreLibTypeId.text, value] as DIFValue : value;
        } else if (typeof value === "boolean") {
            return forceExplicitFormat ? [CoreLibTypeId.boolean, value] as DIFValue : value;
        } else if (typeof value === "number") {
            return forceExplicitFormat ? [CoreLibTypeId.decimal_f64, value] as DIFValue : value;
        } else if (typeof value === "bigint") {
            return ibig(value);
        } else if (value instanceof Endpoint) {
            return [CoreLibTypeId.endpoint, value.toString()] as DIFValue;
        } else if (value instanceof Range) {
            return [CoreLibTypeId.Range, [
                this.convertJSValueToDIFValueContainer(value.start),
                this.convertJSValueToDIFValueContainer(value.end),
            ]];
        } // special treatment
        else if (value === undefined) {
            return JS_UNDEFINED;
        } else if (value instanceof Tagged) {
            // special case: empty tagged value
            if (value.value === EMPTY_TAG) {
                return [CoreLibTypeId.null, null, {
                    tagged_type: [value.tag, CoreLibTypeId.Unit],
                }] as DIFValue;
            }
            const inner = this.convertJSValueToDIFValueContainer(value.value, difHandlerInstance, true);
            if (inner instanceof Array) {
                return [inner[0], inner[1], {
                    tagged_type: [value.tag, inner[2] || inner[0]], // TODO: nullable type
                }] as DIFValue;
            } else if (typeof inner === "object" && inner !== null) {
                unimplemented(
                    "Support nested shared reference value in tagged value",
                );
            } else {
                unreachable(
                    "convertJSValueToDIFValueContainer with forceExplicitFormat should return an array or object",
                );
            }
        } else if (Array.isArray(value)) {
            return [CoreLibTypeId.List, value.map((v) => this.convertJSValueToDIFValueContainer(v))] as DIFValue;
        } else if (value instanceof Map) {
            const map: [DIFValueContainer, DIFValueContainer][] = value
                .entries().map((
                    [k, v],
                ) => [
                    this.convertJSValueToDIFValueContainer(k),
                    this.convertJSValueToDIFValueContainer(v),
                ] satisfies [DIFValueContainer, DIFValueContainer]).toArray();
            return [CoreLibTypeId.Map, map, {
                impl_type: [CoreLibTypeId.Map, [JsLibTypeAddress.map]],
            }] as DIFValue;
        } else if (typeof value === "object") {
            const map: Record<string, DIFValueContainer> = {};
            for (const [key, val] of Object.entries(value)) {
                map[key] = this.convertJSValueToDIFValueContainer(val);
            }
            return [CoreLibTypeId.Map, map] as DIFValue;
        } else if (typeof value == "function") {
            // function originating from JS side, register it as shared value with pointer address
            if (!(DATEX_CALLABLE_HASH in (value as any))) {
                if (!difHandlerInstance) {
                    throw new Error(
                        "Cannot register callable function without a DIFHandler instance",
                    );
                }
                // register the JS function as native callable via DIF
                difHandlerInstance.registerCallable(value as (...args: unknown[]) => unknown);
                // after registration, the function should be in cache, so we can get its reference metadata and return the pointer address
                const existingReference = difHandlerInstance.tryGetReferenceMetadata(value as CachedSharedContainer);
                if (!existingReference) {
                    throw new Error(
                        "Failed to register callable function and retrieve its reference metadata",
                    );
                }
                return difHandlerInstance.generateDIFValueContainerForCachedPointer(existingReference.address);
            }
            // local DATEX function with hash
            else {
                const hash = (value as any)[DATEX_CALLABLE_HASH] as string;
                return [CoreLibTypeId.Callable, [hash, null]];
            }
        }
        throw new Error("Unsupported type for conversion to DIFValue");
    }

    /**
     * Registers a callable function with the DATEX core runtime and stores its hash in the function's metadata.
     */
    private registerCallable(
        callable: (...args: unknown[]) => unknown,
        typeDefinition?: DIFCallableTypeDefinition,
        isMethod = false,
    ) {
        const isAsync = callable.constructor.name === "AsyncFunction";

        typeDefinition ??= {
            kind: DIFCallableKind.Procedure,
            requires_async: isAsync,
            parameters: this.extractFunctionParameterNames(callable).map((name) => ([name, CoreLibTypeId.Any])),
            rest_parameter: null,
            return_type: CoreLibTypeId.Any,
            yeet_type: CoreLibTypeId.Any
        } satisfies DIFCallableTypeDefinition;

        const wrapperFn = (args: DIFValueContainer[]) => {
            return callable(...args.map((arg) => this.resolveDIFValueContainer(arg)));
        }
        const address = this.#handle.register_callable(wrapperFn, callable.name || null, typeDefinition, isMethod) as PointerAddress;
        const shared = this.initSharedValue(
            address,
            callable,
            SharedContainerMutability.Immutable,
            DIFSharedContainerOwnership.ImmutableRef,
        );
    }

    private extractFunctionParameterNames(
        fn: (...args: unknown[]) => unknown,
    ): string[] {
        const fnStr = fn.toString();
        const result = fnStr.match(/\(([^)]*)\)/);
        if (!result) {
            throw new Error("Could not extract parameter names from function");
        }
        const params = result[1].split(",").map((param) => param.trim());
        return params;
    }

    /**
     * Generates the DIF representation for a cached pointer address, using the ownership information from the cache.
     */
    private generateDIFValueContainerForCachedPointer(
        address: PointerAddress,
    ) {
        const ownership = this.#cache.get(address);
        if (!ownership) {
            throw new Error(
                `Reference metadata found for address ${address} but no ownership info in cache`,
            );
        }

        // move(x) -> function (x: OwnedValue) {}
        return { $: combinePointerAddressWithOwnership(address, ownership.maxOwnership) };
    }

    /**
     * Instance method wrapper for static convertJSValueToDIFValueContainer
     * Converts a given JS value to its DIFValueContainer representation.
     * @param value
     */
    public convertJSValueToDIFValueContainer<T extends unknown>(
        value: T,
    ): DIFValueContainer<T> {
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
        pointerAddress: PointerAddress,
        key: K,
        value: V,
    ) {
        const difKey = this.convertJSValueToDIFValueContainer(key);
        const difValue = this.convertJSValueToDIFValueContainer(value);
        this.updateSharedValue(
            pointerAddress,
            setEntry(
                this.createDIFProperty(difKey, DIFPropertyKind.ValueContainer),
                difValue,
            ),
        );
    }

    /**
     * Triggers a 'set' update for the given pointer address, index and value.
     */
    public triggerIndexSet<V>(
        pointerAddress: PointerAddress,
        index: number | bigint,
        value: V,
    ) {
        if (typeof index !== "bigint" && !Number.isInteger(index)) {
            throw new Error("Index must be a non-negative integer");
        }
        const difValue = this.convertJSValueToDIFValueContainer(value);
        this.updateSharedValue(
            pointerAddress,
            setEntry(
                this.createDIFProperty(Number(index), DIFPropertyKind.Index),
                difValue,
            ),
        );
    }

    /**
     * Triggers an 'append' update for the given pointer address and value.
     */
    public triggerAppend<V>(
        pointerAddress: PointerAddress,
        value: V,
    ) {
        const difValue = this.convertJSValueToDIFValueContainer(value);
        this.updateSharedValue(pointerAddress, appendEntry(difValue));
    }

    /**
     * Triggers a 'replace' update for the given pointer address and key.
     */
    public triggerReplace<V>(
        pointerAddress: PointerAddress,
        value: V,
    ) {
        const difValue = this.convertJSValueToDIFValueContainer(value);
        this.updateSharedValue(pointerAddress, replace(difValue));
    }

    /**
     * Triggers a 'delete' update for the given pointer address and key.
     */
    public triggerDelete<K>(
        pointerAddress: PointerAddress,
        key: K,
    ) {
        const difKey = this.convertJSValueToDIFValueContainer(key);
        this.updateSharedValue(
            pointerAddress,
            deleteEntry(
                this.createDIFProperty(difKey, DIFPropertyKind.ValueContainer),
            ),
        );
    }

    /**
     * Triggers a 'clear' update for the given pointer address.
     */
    public triggerClear(pointerAddress: PointerAddress) {
        this.updateSharedValue(pointerAddress, clear());
    }

    /**
     * Triggers a 'list splice' update for the given pointer address.
     */
    public triggerListSplice<V>(
        pointerAddress: PointerAddress,
        start: number,
        deleteCount: number,
        items: V[],
    ) {
        const difItems = items.map((item) => this.convertJSValueToDIFValueContainer(item));
        this.updateSharedValue(
            pointerAddress,
            listSplice(
                start,
                deleteCount,
                difItems,
            ),
        );
    }

    /**
     * Creates a DIFProperty from a given value and property kind.
     * @param value The value to be wrapped in a DIFProperty.
     * @param propertyKind The kind of DIFProperty to create.
     * @returns The created DIFProperty.
     */
    public createDIFProperty(
        value: string | number | DIFValueContainer,
        propertyKind: DIFPropertyKind,
    ) {
        switch (propertyKind) {
            case DIFPropertyKind.Index:
                if (typeof value !== "number") {
                    throw new Error("Expected number for index property");
                }
                return value;
            case DIFPropertyKind.Text:
                if (typeof value !== "string") {
                    throw new Error("Expected string for text property");
                }
                return value;
            case DIFPropertyKind.ValueContainer:
                return { value };
        }
    }
}
