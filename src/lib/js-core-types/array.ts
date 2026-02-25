import { CoreTypeAddress } from "../../dif/core.ts";
import { type CustomReferenceMetadata, type DIFHandler, IS_PROXY_ACCESS } from "../../dif/dif-handler.ts";
import type { TypeBindingDefinition } from "../../dif/type-registry.ts";
import { interceptAccessors } from "../../dif/utils.ts";
import { DEBUG_MODE } from "../../global.ts";
import { Option } from "../../utils/option.ts";

type ArrayMethods<V> = {
    push: Array<V>["push"];
    unshift: Array<V>["unshift"];
    splice: Array<V>["splice"];
    fill: Array<V>["fill"];
};

export const arrayTypeBinding: TypeBindingDefinition<Array<unknown>> = {
    typeAddress: CoreTypeAddress.list,
    bind(target, pointerAddress) {
        const metadata: CustomReferenceMetadata = {};
        const arrayMethods = getArrayMethods(
            target,
            pointerAddress,
            this.difHandler,
            metadata,
        );
        // catch acccess (get or set) to original array value, not via proxy - this check is only active in debug mode
        if (DEBUG_MODE) {
            interceptAccessors(
                target,
                () => {
                    if (!metadata[IS_PROXY_ACCESS]) {
                        throw new Error(
                            "Invalid access to original array value that was moved to a reference",
                        );
                    }
                    return Option.None();
                },
                () => {
                    if (!metadata[IS_PROXY_ACCESS]) {
                        throw new Error(
                            "Invalid access to original array value that was moved to a reference",
                        );
                    }
                },
            );
        }
        // deno-lint-ignore no-this-alias
        const self = this;
        const proxy: unknown[] = new Proxy(target, {
            get(_target, key) {
                return self.allowOriginalValueAccess(proxy, () => {
                    return arrayMethods[key as keyof ArrayMethods<unknown>] ??
                        Reflect.get(target, key);
                });
            },
            set(_target, prop, value, receiver) {
                console.log("=> array." + String(prop) + " =", value);
                return self.allowOriginalValueAccess(proxy, () => {
                    const index = Number(prop);
                    if (
                        typeof prop === "string" && !isNaN(index) && index >= 0
                    ) {
                        // check if out of bounds - fill with null&js.empty
                        if (index >= target.length) {
                            triggerArrayFillEmpty(
                                target,
                                target.length,
                                index,
                                pointerAddress,
                                self.difHandler,
                            );
                        }

                        self.difHandler.triggerIndexSet(
                            pointerAddress,
                            index,
                            value,
                        );
                    } else if (prop === "length") {
                        // if length is reduced, trigger delete for removed items
                        const newLength = Number(value);
                        if (newLength < target.length) {
                            self.difHandler.triggerListSplice(
                                pointerAddress,
                                newLength,
                                target.length - newLength,
                                [],
                            );
                        } // if length is increased, trigger set for new empty items
                        else if (newLength > target.length) {
                            triggerArrayFillEmpty(
                                target,
                                target.length,
                                newLength,
                                pointerAddress,
                                self.difHandler,
                            );
                        }
                    }
                    // x[1..4] = js:empty
                    return Reflect.set(target, prop, value, receiver);
                });
            },
        });
        return {
            value: proxy,
            metadata,
        };
    },
    handleAppend(target, value) {
        target.push(value);
    },
    handleSet(target, key: unknown, value: unknown) {
        this.difHandler.getOriginalValueFromProxy(target)![key as number] = value;
    },
    handleDelete(target, key: number) {
        // remove key (splice)
        this.difHandler.getOriginalValueFromProxy(target)!.splice(key, 1);
    },
    handleClear(target) {
        this.difHandler.getOriginalValueFromProxy(target)!.length = 0;
    },
    handleReplace(target, newValue: unknown[]) {
        this.difHandler.getOriginalValueFromProxy(target)!.length = 0;
        target.push(...newValue);
    },
    handleListSplice(
        target,
        start: number,
        deleteCount: number,
        items: unknown[],
    ) {
        this.difHandler
            .getOriginalValueFromProxy(target)!
            .splice(start, deleteCount, ...items);
    },
};

/**
 * Implementes optimized array methods that send DIF updates on mutation.
 * @returns
 */
function getArrayMethods<V>(
    array: V[],
    pointerAddress: string,
    difHandler: DIFHandler,
    metadata: CustomReferenceMetadata,
): ArrayMethods<V> {
    const originalPush = array.push.bind(array);
    const originalUnshift = array.unshift.bind(array);
    const originalSplice = array.splice.bind(array);
    const originalFill = array.fill.bind(array);

    return {
        push: generateInterceptedArrayPush(
            array,
            originalPush,
            pointerAddress,
            difHandler,
        ),
        unshift: generateInterceptedArrayUnshift(
            originalUnshift,
            pointerAddress,
            difHandler,
            metadata,
        ),
        splice: generateInterceptedArraySplice(
            array,
            originalSplice,
            pointerAddress,
            difHandler,
            metadata,
        ),
        fill: generateInterceptedArrayFill(
            array,
            originalFill,
            pointerAddress,
            difHandler,
            metadata,
        ),
    };
}

function generateInterceptedArrayPush<V>(
    array: V[],
    originalPush: Array<V>["push"],
    pointerAddress: string,
    difHandler: DIFHandler,
) {
    return (...items: V[]) => {
        difHandler.triggerListSplice(
            pointerAddress,
            array.length,
            0,
            items,
        );
        return originalPush(...items);
    };
}

function generateInterceptedArrayUnshift<V>(
    originalUnshift: Array<V>["unshift"],
    pointerAddress: string,
    difHandler: DIFHandler,
    metadata: CustomReferenceMetadata,
) {
    return (...items: V[]) => {
        difHandler.triggerListSplice(
            pointerAddress,
            0,
            0,
            items,
        );
        try {
            metadata[IS_PROXY_ACCESS] = true;
            return originalUnshift(...items);
        } finally {
            metadata[IS_PROXY_ACCESS] = false;
        }
    };
}

function generateInterceptedArraySplice<V>(
    array: V[],
    originalSplice: Array<V>["splice"],
    pointerAddress: string,
    difHandler: DIFHandler,
    metadata: CustomReferenceMetadata,
) {
    return (start: number, deleteCount?: number, ...items: V[]) => {
        difHandler.triggerListSplice(
            pointerAddress,
            start,
            deleteCount ?? (array.length - start),
            items,
        );
        try {
            metadata[IS_PROXY_ACCESS] = true;
            return originalSplice(start, deleteCount!, ...items);
        } finally {
            metadata[IS_PROXY_ACCESS] = false;
        }
    };
}

function generateInterceptedArrayFill<V>(
    array: V[],
    originalFill: Array<V>["fill"],
    pointerAddress: string,
    difHandler: DIFHandler,
    metadata: CustomReferenceMetadata,
) {
    return (value: V, start?: number, end?: number) => {
        const actualStart = start !== undefined
            ? (start < 0 ? Math.max(array.length + start, 0) : Math.min(start, array.length))
            : 0;
        const actualEnd = end !== undefined
            ? (end < 0 ? Math.max(array.length + end, 0) : Math.min(end, array.length))
            : array.length;
        const itemCount = actualEnd - actualStart;
        // splice to replace the filled range
        if (itemCount > 0) {
            difHandler.triggerListSplice(
                pointerAddress,
                actualStart,
                actualEnd - actualStart,
                new Array(itemCount).fill(value),
            );
        }
        try {
            metadata[IS_PROXY_ACCESS] = true;
            return originalFill(value, start, end);
        } finally {
            metadata[IS_PROXY_ACCESS] = false;
        }
    };
}

/**
 * Sends DIF updates that correspond to filling an array up to a certain index with
 * empty values.
 */
function triggerArrayFillEmpty(
    array: unknown[],
    from: number,
    to: number,
    pointerAddress: string,
    difHandler: DIFHandler,
) {
    const originalLength = array.length;
    for (let i = from; i < to; i++) {
        if (i < originalLength) {
            difHandler.triggerSet(pointerAddress, i, null); // TODO: special js empty value
        } else {
            difHandler.triggerAppend(pointerAddress, null); // TODO: special js empty value
        }
    }
}
