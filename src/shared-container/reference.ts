import type { BaseSharedContainer, SharedContainerMutability } from "./base-shared-container.ts";
import type { MaybeSharedRef, PointerAddress } from "datex/shared-container/mod.ts";
import type { DIFUpdateData } from "../dif/types/update.ts";

export enum SharedReferenceMutability {
    Immutable = 0,
    Mutable = 1,
}
export class ReferencedSharedContainer<
    T,
    Mutability extends SharedContainerMutability = SharedContainerMutability,
    ReferenceMutability extends SharedReferenceMutability = SharedReferenceMutability,
> {
    readonly #baseSharedContainer: BaseSharedContainer<T, Mutability>;
    readonly #referenceMutability: ReferenceMutability;

    public constructor(
        baseSharedContainer: BaseSharedContainer<T, Mutability>,
        referenceMutability: ReferenceMutability,
    ) {
        this.#baseSharedContainer = baseSharedContainer;
        this.#referenceMutability = referenceMutability;
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

    public isMutable(): boolean {
        return this.#referenceMutability === SharedReferenceMutability.Mutable;
    }

    /**
     * Derives an immutable reference from the current reference. The derived reference will have the same underlying shared container,
     * @returns A new ReferencedSharedContainer instance with immutable reference mutability.
     */
    public deriveImmutableReference(): ReferencedSharedContainer<
        T,
        Mutability,
        SharedReferenceMutability.Immutable
    > {
        return new ReferencedSharedContainer<T, Mutability, SharedReferenceMutability.Immutable>(
            this.#baseSharedContainer,
            SharedReferenceMutability.Immutable,
        );
    }

    /**
     * Observes changes to the shared container and invokes the provided callback when an update occurs.
     * @param callback
     */
    public observe(callback: (value: DIFUpdateData) => void) {
        this.#baseSharedContainer.observe(callback);
    }
}

// export function deriveImmutableReference<
//     T,
//     Mutability extends SharedContainerMutability,
// >(
//     reference: SharedReferenced<T, Mutability, SharedReferenceMutability>,
// ): SharedReferenced<T, Mutability, SharedReferenceMutability.Immutable> {
//     return reference as SharedReferenced<T, Mutability, SharedReferenceMutability.Immutable>;
// }
