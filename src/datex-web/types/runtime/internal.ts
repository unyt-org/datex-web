// @generated file -- do not edit
// deno-lint-ignore-file
// deno-fmt-ignore-file

/**
 * General static information about the runtime, e.g. version numbers.
 */
export type RuntimeInfo = {
    device_type: string | null;
    other_versions: Map<string, string>;
    datex_version: string;
    running_since: number;
};

export type HeapStats = {
    total: number;
    used: number;
    max_used: number;
};

export type RuntimeStats = {
    heap: HeapStats | null;
};