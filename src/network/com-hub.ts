import type {
    BaseInterfacePublicHandle,
    ComHubMetadata,
    ComInterfaceConfiguration,
    InterfaceDirection,
    JSComHub,
} from "../datex-web/datex_web.d.ts";
import type { DIFValueContainer } from "../dif/definitions.ts";
import type { ComInterfaceProperties } from "../datex.ts";
import type { Runtime } from "../runtime/runtime.ts";

export type ComInterfaceFactory<SetupData = unknown> = {
    interfaceType: string;
    factory: ComInterfaceFactoryFn<SetupData>;
};

export type ComInterfaceFactoryFn<SetupData = unknown> = (
    setup_data: SetupData,
) => ComInterfaceConfiguration | Promise<ComInterfaceConfiguration>;

export type ComInterfaceUUID = `com_interface::${string}`;
export type ComInterfaceSocketUUID = `socket::${string}`;

/**
 * Communication hub for managing communication interfaces.
 */
export class ComHub {
    /** The JS communication hub. */
    readonly #jsComHub: JSComHub;
    readonly #runtime: Runtime;

    constructor(jsComHub: JSComHub, runtime: Runtime) {
        this.#jsComHub = jsComHub;
        this.#runtime = runtime;
    }

    public registerInterfaceFactory<SetupData>(
        factoryDefinition: ComInterfaceFactory<SetupData>,
    ) {
        this.#jsComHub.register_interface_factory(
            factoryDefinition.interfaceType,
            async (setupData: DIFValueContainer) => {
                const setupDataJS = await this.#runtime.dif.resolveDIFValueContainer<SetupData>(setupData);
                return factoryDefinition.factory(setupDataJS);
            },
        );
    }

    /**
     * Creates a new communication interface.
     * @param type The type of the interface to create.
     * @param setupData The setup data for the interface.
     * @param priority The priority of the interface (optional).
     * @returns A promise that resolves to the UUID of the created interface.
     */
    public async createInterface<SetupData>(
        type: string,
        setupData: SetupData,
        priority?: number,
    ): Promise<ComInterfaceUUID> {
        return await this.#jsComHub.create_interface(
            type,
            this.#runtime.dif.convertJSValueToDIFValueContainer(setupData),
            priority,
        ) as ComInterfaceUUID;
    }

    public closeInterface(
        interface_uuid: ComInterfaceUUID,
    ): Promise<void> {
        return this.#jsComHub.close_interface(interface_uuid);
    }

    /**
     * Prints the metadata of the ComHub. Only available in debug builds.
     * Only exists in debug builds
     */
    public printMetadata(): void {
        const metadata = this.#jsComHub.get_metadata_string();
        console.log(metadata);
    }

    public getMetadata(): ComHubMetadata {
        // as any required because get_metadata only exists in debug builds
        // deno-lint-ignore no-explicit-any
        return (this.#jsComHub as any).get_metadata();
    }

    /**
     * Prints the trace for a specific endpoint. Only available in debug builds.
     * @param endpoint The endpoint for which to print the trace.
     */
    public async printTrace(endpoint: string): Promise<void> {
        // as any required because get_trace_string only exists in debug builds
        // deno-lint-ignore no-explicit-any
        const trace = await (this.#jsComHub as any).get_trace_string(endpoint);
        if (trace === undefined) {
            console.warn(`No trace available for endpoint: ${endpoint}`);
            return;
        }
        console.log(trace);
    }

    /**
     * Registers a callback to intercept incoming blocks.
     * @param callback The callback to be invoked for each incoming block.
     */
    public registerIncomingBlockInterceptor(
        callback: (block: Uint8Array, socket_uuid: string) => void,
    ): void {
        this.#jsComHub.register_incoming_block_interceptor(callback);
    }

    /**
     * Registers a callback to intercept outgoing blocks.
     * @param callback The callback to be invoked for each outgoing block.
     */
    public registerOutgoingBlockInterceptor(
        callback: (
            block: Uint8Array,
            socket_uuid: string,
            endpoints: string[],
        ) => void,
    ): void {
        this.#jsComHub.register_outgoing_block_interceptor(callback);
    }
}
