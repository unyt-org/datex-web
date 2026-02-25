import type { Option } from "../utils/option.ts";

export function getAllKeys(obj: object): Set<(string | symbol)> {
    const keys = new Set<string | symbol>();

    let currentObj: object | null = obj;
    while (currentObj && currentObj !== Object.prototype) {
        for (const key of Reflect.ownKeys(currentObj)) {
            keys.add(key);
        }
        currentObj = Object.getPrototypeOf(currentObj);
    }

    return keys;
}

export function getOwnPropertyDescriptorInPrototypeChain(
    obj: object,
    key: string | symbol,
): PropertyDescriptor | undefined {
    let currentObj: object | null = obj;
    while (currentObj && currentObj !== Object.prototype) {
        const descriptor = Object.getOwnPropertyDescriptor(currentObj, key);
        if (descriptor) {
            return descriptor;
        }
        currentObj = Object.getPrototypeOf(currentObj);
    }
    return undefined;
}

export function interceptAccessors(
    originalObject: object,
    getHandler?: ((key: string | symbol) => Option<unknown>) | null,
    setHandler?: ((key: string | symbol, value: unknown) => void) | null,
    keys: Iterable<string | symbol> = getAllKeys(originalObject),
) {
    const shadowObject = Array.isArray(originalObject) ? [] : {};

    function addPropertyInterceptor(
        originalDescriptor: PropertyDescriptor | undefined,
        key: string | symbol,
    ) {
        return {
            get() {
                if (getHandler) {
                    const result = getHandler(key);
                    if (result.isSome()) {
                        return result.unwrap();
                    }
                }
                return (shadowObject as unknown as Record<
                    string | symbol,
                    unknown
                >)[
                    key as unknown as string | symbol
                ];
            },
            set(value: unknown) {
                if (setHandler) {
                    setHandler(key, value);
                }
                (shadowObject as unknown as Record<string | symbol, unknown>)[
                    key as unknown as string | symbol
                ] = value;
            },
            enumerable: originalDescriptor?.enumerable,
            configurable: true,
        } as const;
    }
    for (const key of keys) {
        const originalDescriptor = getOwnPropertyDescriptorInPrototypeChain(
            originalObject,
            key,
        );

        // assign property directly to shadow object if non-configurable and no getter/setter
        if (
            originalDescriptor && (
                ("value" in originalDescriptor &&
                    originalDescriptor.writable) ||
                !originalDescriptor.configurable
            )
        ) {
            (shadowObject as Record<string, unknown>)[
                key as unknown as string
            ] = (originalObject as Record<string, unknown>)[
                key as unknown as string
            ];
        } // bind original getter/setter to shadow object
        else if (originalDescriptor?.get || originalDescriptor?.set) {
            Object.defineProperty(
                shadowObject,
                key,
                {
                    get: originalDescriptor.get ? originalDescriptor.get.bind(originalObject) : undefined,
                    set: originalDescriptor.set ? originalDescriptor.set.bind(originalObject) : undefined,
                    enumerable: originalDescriptor.enumerable,
                    configurable: true,
                },
            );
        }

        // only define interceptor if property is configurable
        if (!originalDescriptor || originalDescriptor.configurable) {
            Object.defineProperty(
                originalObject,
                key,
                addPropertyInterceptor(originalDescriptor, key),
            );
        }
    }
}
