import { ReferencedSharedContainer, SharedReferenceMutability } from "./reference.ts";
import type { BaseSharedContainer, SharedContainerMutability } from "./base-shared-container.ts";
import type { MaybeSharedRef, PointerAddress, SharedRef } from "datex/shared-container/mod.ts";
import type { DIFUpdateData } from "../dif/types/update.ts";

export class OwnedSharedContainer<T, Mutability extends SharedContainerMutability = SharedContainerMutability> {
    readonly #baseSharedContainer: BaseSharedContainer<T, Mutability>;

    public constructor(baseSharedContainer: BaseSharedContainer<T, Mutability>) {
        this.#baseSharedContainer = baseSharedContainer;
    }

    /**
     * Gets the address of the pointer storing the reference.
     */
    public get pointerAddress(): PointerAddress {
        return this.#baseSharedContainer.pointerAddress;
    }

    /**
     * Gets the current value of the reference.
     */
    public get value(): MaybeSharedRef<T, Mutability> {
        return this.#baseSharedContainer.value;
    }

    /**
     * Replaces the current value of the reference with a new value.
     * Also notifies all observers of the pointer about the change.
     * @throws If the reference is immutable or the new value is of an incompatible type.
     */
    set value(newValue: Mutability extends SharedContainerMutability.Mutable ? MaybeSharedRef<T, Mutability> : never) {
        this.#baseSharedContainer.value = newValue;
    }

    // FIXME
    get _base(): BaseSharedContainer<T, Mutability> {
        return this.#baseSharedContainer;
    }

    /**
     * Derives a new mutable reference from the current reference if the current reference is mutable.
     * Otherwise returns an error
     * @returns A new mutable reference derived from the current reference if the current reference is mutable, otherwise throws an error.
     */
    public deriveMutableReference(): Mutability extends SharedContainerMutability.Mutable ? ReferencedSharedContainer<
            T,
            Mutability,
            SharedReferenceMutability.Mutable
        >
        : never {
        if (this.#baseSharedContainer.isContainerMutable()) {
            return new ReferencedSharedContainer<
                T,
                Mutability,
                SharedReferenceMutability.Mutable
            >(
                this.#baseSharedContainer,
                SharedReferenceMutability.Mutable,
                // deno-lint-ignore no-explicit-any
            ) as any;
        } else {
            throw new Error("Cannot derive a mutable reference from an immutable reference.");
        }
    }

    /**
     * Derives a new immutable reference from the current reference. The derived reference will have the same underlying shared container,
     * @returns A new ReferencedSharedContainer instance with immutable reference mutability.
     */
    public deriveImmutableReference(): ReferencedSharedContainer<
        T,
        Mutability,
        SharedReferenceMutability.Immutable
    > {
        return new ReferencedSharedContainer<
            T,
            Mutability,
            SharedReferenceMutability.Immutable
        >(this.#baseSharedContainer, SharedReferenceMutability.Immutable);
    }

    /**
     * Observes changes to the shared container and invokes the provided callback when an update occurs.
     * @param callback
     */
    public observe(callback: (value: DIFUpdateData) => void) {
        this.#baseSharedContainer.observe(callback);
    }
}
