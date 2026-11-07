import type { DIFHandler } from "../dif/dif-handler.ts";
import { DIFSharedContainerOwnership, type DIFUpdateData } from "../dif/types/mod.ts";
import { MaybeSharedRef, OwnedSharedContainer, type PointerAddress, type SharedContainer } from "./mod.ts";
import { ReferencedSharedContainer } from "./reference.ts";

export enum SharedContainerMutability {
    Immutable = 0,
    Mutable = 1,
}

/**
 * The Ref class is a wrapper around a value that is stored in a pointer.
 * Primitive values (string, number, boolean, null) are always wrapped in a Ref when stored in a pointer.
 */
export class BaseSharedContainer<T, Mutability extends SharedContainerMutability = SharedContainerMutability> {
    #value: MaybeSharedRef<T, Mutability>;
    #pointerAddress: PointerAddress;
    #difHandler: DIFHandler;
    #containerMutability: Mutability;

    constructor(
        value: MaybeSharedRef<T, Mutability>,
        pointerAddress: PointerAddress,
        mutability: Mutability,
        difHandler: DIFHandler,
    ) {
        this.#value = value;
        this.#pointerAddress = pointerAddress;
        this.#containerMutability = mutability;
        this.#difHandler = difHandler;
    }

    /**
     * Gets the address of the pointer storing the reference.
     */
    public get pointerAddress(): PointerAddress {
        return this.#pointerAddress;
    }

    /**
     * Silently updates the value of the reference without notifying observers.
     * This should only be used internally.
     * @param newValue - The new value to set.
     */
    updateValueSilently(newValue: MaybeSharedRef<T, Mutability>) {
        this.#value = newValue;
    }

    /**
     * Gets the current value of the reference.
     */
    public get value(): MaybeSharedRef<T, Mutability> {
        return this.#value;
    }

    /**
     * Replaces the current value of the reference with a new value.
     * Also notifies all observers of the pointer about the change.
     * @throws If the reference is immutable or the new value is of an incompatible type.
     */
    set value(newValue: Mutability extends SharedContainerMutability.Mutable ? MaybeSharedRef<T, Mutability> : never) {
        if (!this.isContainerMutable()) {
            throw new Error("Cannot set value of an immutable reference.");
        }

        const oldValue = this.#value;
        if (oldValue === newValue) return;

        // Try to update the pointer
        this.#difHandler.triggerReplace(this.#pointerAddress, newValue);
        this.#value = newValue;
    }

    public isContainerMutable(): this is BaseSharedContainer<T, typeof SharedContainerMutability.Mutable> {
        return this.#containerMutability === SharedContainerMutability.Mutable;
    }

    public withOwnership<Ownership extends DIFSharedContainerOwnership>(
        ownership: Ownership,
    ): SharedContainer<T, Mutability> {
        if (ownership === DIFSharedContainerOwnership.ImmutableRef) {
            return new ReferencedSharedContainer(this, ownership) as SharedContainer<T, Mutability>;
        } else if (ownership === DIFSharedContainerOwnership.MutableRef) {
            if (this.isContainerMutable()) {
                return new ReferencedSharedContainer(this, ownership) as SharedContainer<T, Mutability>;
            } else {
                throw new Error("Cannot create a mutable reference to an immutable shared container.");
            }
        } else if (ownership === DIFSharedContainerOwnership.Owned) {
            return new OwnedSharedContainer(this) as SharedContainer<T, Mutability>;
        } else {
            throw new Error(`Invalid ownership type: ${ownership}`);
        }
    }

    /**
     * Observes changes to the shared container and invokes the provided callback when an update occurs.
     * @param callback
     */
    public observe(callback: (value: DIFUpdateData) => void) {
        this.#difHandler.observePointer(this.#pointerAddress, callback);
    }
}
