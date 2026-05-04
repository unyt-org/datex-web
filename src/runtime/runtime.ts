import {
    create_runtime,
    type DecompileOptions,
    disassemble_dxb_flat,
    disassemble_dxb_tree,
    disassemble_dxb_to_string,
    type JSRuntime,
    type DisassemblerOptions
} from "../datex.ts";
import { ComHub } from "../network/com-hub.ts";
import { DIFHandler, type PointerOut } from "../dif/dif-handler.ts";
import type { DIFSharedValueMutability, DIFTypeDefinition } from "../dif/definitions.ts";
import type { Ref } from "../refs/ref.ts";
import { unimplemented } from "../utils/exceptions.ts";
import {FlatInstruction, Instruction, InstructionTree} from "./types.d.ts";

// TODO: move to global.ts
/** auto-generated version - do not edit: */
const VERSION: string = "0.0.15";

/** debug flags for the runtime */
interface DebugConfig {
    // optional log level for internal runtime logs, if not set, no logs are printed
    log_level?: "error" | "warn" | "info" | "debug" | "trace" | null;
}

/** configuration for the runtime  */
export type RuntimeConfig = {
    endpoint?: string;
    interfaces?: { type: string; config: unknown }[];
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
    get endpoint(): string {
        return this.#runtime.endpoint;
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
    ): Promise<T>;
    public execute<T = unknown>(
        datexScriptOrTemplateStrings: string | TemplateStringsArray,
        ...values: unknown[]
    ): Promise<T> {
        const { datexScript, valuesArray } = this.#getScriptAndValues(
            datexScriptOrTemplateStrings,
            ...values,
        );
        return this.#executeInternal<T>(datexScript, valuesArray);
    }

    async #executeInternal<T = unknown>(
        datexScript: string,
        values: unknown[] | null = [],
    ): Promise<T> {
        const difValueContainer = await this.#difHandler.executeDIF(
            datexScript,
            values,
        );
        if (difValueContainer === null) {
            return undefined as T;
        }
        return this.#difHandler.resolveDIFValueContainer<T>(difValueContainer);
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
        const { datexScript, valuesArray } = this.#getScriptAndValues(
            datexScriptOrTemplateStrings,
            ...values,
        );
        return this.#executeSyncInternal<T>(datexScript, valuesArray);
    }

    #executeSyncInternal<T = unknown>(
        datexScript: string,
        values: unknown[] | null = [],
    ): T {
        const difValue = this.#difHandler.executeSyncDIF(datexScript, values);
        if (difValue === null) {
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
        const { datexScript, valuesArray } = this.#getScriptAndValues(
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
            decompileOptions,
        );
    }

    /**
     * Handles the function arguments to a normal function call or a template function call,
     * always returning a normalized datexScript and valuesArray.
     */
    #getScriptAndValues(
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
     * For primitive values, a Ref wrapper is returned.
     * For other values (objects, arrays, maps), the returned value is a proxy object that behaves like the original object.
     *
     * @param value The JS value to store in the pointer.
     * @param allowedType Optional DIF type container to restrict the type of the pointer.
     * @param mutability Optional mutability of the reference (default is Mutable).
     * @returns A proxy object representing the pointer in JS.
     */
    public createTransparentReference<
        V,
        M extends DIFSharedValueMutability = typeof DIFSharedValueMutability.Mutable,
    >(
        // deno-lint-ignore ban-types
        value: V & {},
        allowedType?: DIFTypeDefinition | null,
        mutability?: M,
    ): PointerOut<V, M> {
        return this.#difHandler.createTransparentReference(
            value,
            allowedType,
            mutability,
        );
    }

    /**
     * Creates or retrieves a wrapped reference for the given value.
     * If the value is already a reference, it returns the existing reference.
     *
     * @param value
     * @param allowedType
     * @param mutability
     * @returns
     */
    public createOrGetWrappedReference<
        V,
        M extends DIFSharedValueMutability = typeof DIFSharedValueMutability.Mutable,
    >(
        _value: V,
        _allowedType?: DIFTypeDefinition | null,
        _mutability?: M,
    ): Ref<V> {
        unimplemented();
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
    public disassembleDXBFlat(dxb: Uint8Array): [FlatInstruction[], string|null] {
        return disassemble_dxb_flat(dxb)
    }

    /**
     * Returns a disassembled DXB as a tree structure, where each instruction can have nested child instructions
     * @param dxb DATEX binary body
     * @returns a tuple of the instruction tree and an optional error message if the disassembly (partially) failed
     */
    public disassembleDXBTree(dxb: Uint8Array): [InstructionTree, string|null] {
        return disassemble_dxb_tree(dxb);
    }

    /**
     * Returns a disassembled DXB as a human-readable string, similar to assembly code.
     * @param dxb
     * @param options
     */
    public disassembleDXBToString(dxb: Uint8Array, options?: DisassemblerOptions|null): string {
        return disassemble_dxb_to_string(dxb, options)
    }
}
