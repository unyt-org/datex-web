import {
    create_runtime,
    decompile_dxb_body,
    disassemble_dxb_flat,
    disassemble_dxb_to_string,
    disassemble_dxb_tree,
    type JSRuntime,
} from "../datex.ts";
import { ComHub } from "../network/com-hub.ts";
import { DIFHandler } from "../dif/dif-handler.ts";
import {
    OwnedSharedContainer,
    type ReferencedSharedContainer,
    SharedContainerMutability,
} from "../shared-container/mod.ts";
import type { FlatResult, TreeResult} from "./types.d.ts";
import type { DIFTypeDefinition } from "../dif/types/mod.ts";
import { Endpoint } from "../lib/mod.ts";
import type { DisassemblerOptions } from "datex/datex-web/types/disassembler/options.ts";
import type { DecompileOptions } from "datex/datex-web/types/decompiler/options.ts";
import type { InterfacePriority } from "../datex-web/types/network/com_hub/mod.ts";

// TODO: move to global.ts
/** auto-generated version - do not edit: */
const VERSION: string = "0.0.16";

/** debug flags for the runtime */
interface DebugConfig {
    // optional log level for internal runtime logs, if not set, no logs are printed
    log_level?: "error" | "warn" | "info" | "debug" | "trace" | null;
}

/** configuration for the runtime  */
export type RuntimeConfig = {
    endpoint: Endpoint;
    interfaces?: { type: string; config: unknown; priority: InterfacePriority }[];
    env?: Record<string, string>;
};

/**
 * The main Runtime class for executing Datex scripts and managing communication interfaces.
 */
export class Runtime {
    public readonly js_version = VERSION;

    readonly #runtime: JSRuntime;
    readonly #comHub: ComHub;
    readonly #difHandler: DIFHandler;

    private constructor(jsRuntime: JSRuntime) {
        this.#runtime = jsRuntime;
        this.#comHub = new ComHub(this.#runtime.com_hub, this);
        this.#difHandler = new DIFHandler(this.#runtime);
    }

    /**
     * Creates a new Runtime instance.
     * @param config Runtime configuration
     * @param debugConfig Debug flags for the runtime
     * @returns A promise that resolves to the created Runtime instance
     */
    public static async create(
        config: RuntimeConfig,
        debugConfig?: DebugConfig,
    ): Promise<Runtime> {
        // workaround: temp dif handler without runtime to convert config to DIF
        const configDIF = DIFHandler.convertJSValueToDIFValueContainer(config);
        const jsRuntime = await create_runtime(configDIF, debugConfig);
        return new Runtime(jsRuntime);
    }

    /**
     * Gets the endpoint of the runtime.
     */
    get endpoint(): Endpoint {
        return Endpoint.get(this.#runtime.endpoint);
    }

    /**
     * Gets the version of the runtime.
     */
    get version(): string {
        return this.#runtime.version;
    }

    /**
     * Gets the DIF handler associated with the runtime.
     */
    get dif(): DIFHandler {
        return this.#difHandler;
    }

    /**
     * Gets the communication hub associated with the runtime.
     */
    get comHub(): ComHub {
        return this.#comHub;
    }

    /**
     * @internal only used for debugging
     */
    get _runtime(): JSRuntime {
        return this.#runtime;
    }

    /**
     * Executes a Datex script and returns the result as a string.
     * @param datexScript The Datex script to execute.
     * @param values The values to inject into the script.
     * @param decompileOptions Options for decompiling the result.
     * @returns A promise that resolves to the result of the script execution.
     */
    public executeWithStringResult(
        datexScript: string,
        values: unknown[] | null = [],
        decompileOptions: DecompileOptions | null = null,
    ): Promise<string> {
        return this.#runtime.execute_with_string_result(
            datexScript,
            this.#difHandler.convertToDIFValues(values),
            decompileOptions,
        );
    }

    /**
     * Executes a Datex script synchronously and returns the result as a string.
     * @param datexScript The Datex script to execute.
     * @param values The values to inject into the script.
     * @param decompileOptions Options for decompiling the result.
     * @returns The result of the script execution.
     */
    public executeSyncWithStringResult(
        datexScript: string,
        values: unknown[] | null = [],
        decompileOptions: DecompileOptions | null = null,
    ): string {
        return this.#runtime.execute_sync_with_string_result(
            datexScript,
            this.#difHandler.convertToDIFValues(values),
            decompileOptions,
        );
    }

    /**
     * Asynchronously executes a Datex script and returns the result as a Promise.
     * Injected values can be passed as an array in `values`.
     * If the script returns no value, it will return `undefined`.
     * Example usage:
     * ```ts
     * const result = await runtime.execute<number>("1 + ?", [41]);
     * console.log(result); // 42
     * ```
     */
    public execute<T = unknown>(
        datexScript: string,
        values?: unknown[],
    ): Promise<T>;

    /**
     * Asynchronously executes a Datex script and returns the result as a Promise.
     * Injected values can be passed to the template string.
     * Example usage:
     * ```ts
     * const result = await runtime.execute<number>`1 + ${41}`;
     * console.log(result); // 42
     * ```
     */
    public execute<T = unknown>(
        templateStrings: TemplateStringsArray,
        ...values: unknown[]
    ): Promise<T | undefined>;
    public execute<T = unknown>(
        datexScriptOrTemplateStrings: string | TemplateStringsArray,
        ...values: unknown[]
    ): Promise<T | undefined> {
        const { datexScript, valuesArray } = this.#normalizeArguments(
            datexScriptOrTemplateStrings,
            ...values,
        );
        return this.#executeWithNormalizedArguments<T>(datexScript, valuesArray);
    }

    /**
     * Execute a DATEX script with injected values and return the result as a Promise of type T.
     * The result is converted to a JS value. If the script returns no value, it will return `undefined`.
     * @param datexScript The DATEX script to execute.
     * @param values The values to inject into the script, passed as an array.
     * @returns A Promise that resolves to the result of the script execution, converted to type T.
     */
    async #executeWithNormalizedArguments<T = unknown>(
        datexScript: string,
        values: unknown[] | null = [],
    ): Promise<T | undefined> {
        const difValueContainer = await this.#difHandler.executeDIF(
            datexScript,
            values,
        );
        if (difValueContainer === undefined) {
            return undefined as T;
        }
        return this.#difHandler.resolveDIFValueContainer(difValueContainer);
    }

    /**
     * Executes a Datex script synchronously and returns the result as a generic type T.
     * Injected values can be passed as an array in `values`.
     * If the script returns no value, it will return `undefined`.
     * Example usage:
     * ```ts
     * const result = runtime.executeSync<number>("1 + ?", [41]);
     * console.log(result); // 42
     * ```
     */
    public executeSync<T = unknown>(
        datexScript: string,
        values?: unknown[],
    ): T;

    /**
     * Executes a Datex script synchronously and returns the result as a generic type T.
     * Injected values can be passed to the template string.
     * Example usage:
     * ```ts
     * const result = runtime.executeSync<number>`1 + ${41}`;
     * console.log(result); // 42
     * ```
     */
    public executeSync<T = unknown>(
        templateStrings: TemplateStringsArray,
        ...values: unknown[]
    ): T;
    public executeSync<T = unknown>(
        datexScriptOrTemplateStrings: string | TemplateStringsArray,
        ...values: unknown[]
    ): T {
        // determine datexScript and valuesArray based on the type of datexScriptOrTemplateStrings
        const { datexScript, valuesArray } = this.#normalizeArguments(
            datexScriptOrTemplateStrings,
            ...values,
        );
        return this.#executeSyncWithNormalizedArguments<T>(datexScript, valuesArray);
    }

    #executeSyncWithNormalizedArguments<T = unknown>(
        datexScript: string,
        values: unknown[] | null = [],
    ): T {
        const difValue = this.#difHandler.executeSyncDIF(datexScript, values);
        if (difValue === undefined) {
            return undefined as T;
        }
        const result = this.#difHandler.resolveDIFValueContainer<T>(difValue);
        if (result instanceof Promise) {
            throw new Error(
                "executeSync cannot return a Promise. Use execute() instead.",
            );
        }
        return result;
    }

    /**
     * Compiles a DATEX source code and optional injected values to a DXB body
     */
    public compile(
        datexScript: string,
        values?: unknown[],
    ): Promise<Uint8Array>;

    /**
     * Compiles a DATEX source code and optional injected values to a DXB body.
     * Injected values can be passed to the template string.
     * Example usage:
     * ```ts
     * const dxb = await runtime.compile<number>`1 + ${41}`;
     * ```
     */
    public compile(
        templateStrings: TemplateStringsArray,
        ...values: unknown[]
    ): Promise<Uint8Array>;
    public compile(
        datexScriptOrTemplateStrings: string | TemplateStringsArray,
        ...values: unknown[]
    ): Promise<Uint8Array> {
        const { datexScript, valuesArray } = this.#normalizeArguments(
            datexScriptOrTemplateStrings,
            ...values,
        );
        return this.#runtime.compile(datexScript, valuesArray);
    }

    /**
     * Converts a JavaScript value to a string representation.
     * @param value The value to convert.
     * @param decompileOptions Options for decompiling the result.
     * @returns The string representation of the value.
     */
    public valueToString(
        value: unknown,
        decompileOptions: DecompileOptions | null = null,
    ): string {
        return this.#runtime.value_to_string(
            this.#difHandler.convertJSValueToDIFValueContainer(value),
            this.#difHandler.convertJSValueToDIFValueContainer(decompileOptions),
        );
    }

    /**
     * Handles the function arguments to a normal function call or a template function call,
     * always returning a normalized datexScript and valuesArray.
     */
    #normalizeArguments(
        datexScriptOrTemplateStrings: string | TemplateStringsArray,
        ...values: unknown[]
    ): { datexScript: string; valuesArray: unknown[] } {
        let datexScript: string;
        let valuesArray: unknown[];
        if (typeof datexScriptOrTemplateStrings === "string") {
            datexScript = datexScriptOrTemplateStrings;
            valuesArray = values[0] as unknown[] ?? [];
        } else if (Array.isArray(datexScriptOrTemplateStrings)) {
            // if it's a TemplateStringsArray, join the strings and interpolate the values
            datexScript = datexScriptOrTemplateStrings.join("?");
            valuesArray = values;
        } else {
            throw new Error("Invalid argument type for executeSync");
        }
        return { datexScript, valuesArray };
    }

    /**
     * Creates a new reference containing the given JS value.
     *
     * @param value The JS value to store in the pointer.
     * @param allowedType Optional DIF type container to restrict the type of the pointer.
     * @param mutability Optional mutability of the reference (default is Mutable).
     * @returns A owned shared container wrapper containing the value. Independent of the structure in JS.
     */
    public createSharedValueFromJSValue<
        V,
        M extends SharedContainerMutability = SharedContainerMutability.Mutable,
    >(
        value: V,
        allowedType: DIFTypeDefinition | null = null,
        mutability: M = SharedContainerMutability.Mutable as M,
    ): OwnedSharedContainer<V, M> {
        return this.#difHandler.createSharedValueFromJSValue(
            value,
            allowedType,
            mutability,
        );
    }

    public startLSP(
        callback: (data: string) => void,
    ): (data: string) => void {
        const decoder = new TextDecoder("utf-8");
        const encoder = new TextEncoder();
        const sendToRust = this.#runtime.start_lsp(
            (bytes: Uint8Array) => {
                callback(decoder.decode(bytes));
            },
        );
        return (data: string) => {
            sendToRust(encoder.encode(data));
        };
    }

    /**
     * Returns a disassembled DXB as a list of instructions
     * @param dxb DATEX binary body
     * @returns a tuple of the instruction tree and an optional error message if the disassembly (partially) failed
     */
    public disassembleDXBFlat(dxb: Uint8Array): FlatResult {
        return disassemble_dxb_flat(dxb);
    }

    /**
     * Returns a disassembled DXB as a tree structure, where each instruction can have nested child instructions
     * @param dxb DATEX binary body
     * @returns a tuple of the instruction tree and an optional error message if the disassembly (partially) failed
     */
    public disassembleDXBTree(dxb: Uint8Array): TreeResult {
        return disassemble_dxb_tree(dxb);
    }

    /**
     * Returns a disassembled DXB as a human-readable string, similar to assembly code.
     * @param dxb
     * @param options
     */
    public disassembleDXBToString(dxb: Uint8Array, options?: DisassemblerOptions | null): string {
        return disassemble_dxb_to_string(dxb, options);
    }

    /**
     * Decompiles a DXB body to a DATEX script string.
     * @param dxbBody
     */
    public decompileDXBBody(dxbBody: Uint8Array): string {
        return decompile_dxb_body(dxbBody);
    }

    /**
     * Creates a new shared value Ref
     * @param value
     */
    public ref<T>(value: T): ReferencedSharedContainer<T> {
        const shared = this.createSharedValueFromJSValue(
            value,
            undefined,
            SharedContainerMutability.Mutable,
        );
        if (shared instanceof OwnedSharedContainer) {
            return shared.deriveImmutableReference();
        } else {
            return shared as unknown as ReferencedSharedContainer<T>; // FIXME make sure this is a ReferencedSharedContainer
        }
    }

    /**
     * Creates a new shared value Ref
     * @param value
     */
    public shared<T>(value: T): OwnedSharedContainer<T> {
        return this.createSharedValueFromJSValue(
            value,
            undefined,
            SharedContainerMutability.Mutable,
        ) as OwnedSharedContainer<T>; // FIXME make sure this is an OwnedSharedContainer
    }
}
