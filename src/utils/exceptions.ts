export function panic(message: string = "unknown"): never {
    throw new Error(`Panic: ${message}`);
}

export function unreachable(message: string = "unknown"): never {
    throw new Error(`Unreachable code reached: ${message}`);
}

export function unimplemented(message: string = "unknown"): never {
    throw new Error(`Not implemented: ${message}`);
}

export function assert(condition: boolean, message: string = "unknown"): asserts condition {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}