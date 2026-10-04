import type { Runtime } from "../runtime/runtime.ts";
import type { DIFValueContainer } from "../dif/types/value.ts";
import type { JSComHub } from "../datex.ts";
import type { ComHubMetadata } from "../datex-web/types/network/com_hub/metadata.ts";
import type { NetworkTraceResult } from "../datex-web/types/network/com_hub/network_tracing.ts";
import type { SocketPropertiesPartial } from "../datex-web/types/network/com_hub.ts";
import type { ComInterfaceProperties } from "../datex-web/types/network/com_interfaces/com_interface/properties.ts";

export type ComInterfaceFactory<SetupData = unknown> = {
    interfaceType: string;
    factory: ComInterfaceFactoryFn<SetupData>;
};

export type SocketConfiguration = {
    properties: DIFValueContainer<SocketPropertiesPartial>;
    iterator: ReadableStream<ArrayBufferLike>;
    send_callback: (data: ArrayBuffer) => void;
};

export type ComInterfaceConfiguration = {
    /**
     * The properties of the interface instance
     */
    properties: ComInterfaceProperties;
    /**
     * Indicates that this interface only establishes a single socket connection
     * And stops the sockets iterator after yielding the first socket configuration.
     * When set to true, the first socket connection is awaited on interface creation.
     */
    has_single_socket: boolean;
    new_sockets_iterator: ReadableStream<SocketConfiguration>;
    /**
     * An optional asynchronous callback that is called by the com hub when the interface is closed
     */
    close_async_callback?: never;
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
                const data = await factoryDefinition.factory(setupDataJS);
                return {
                    ...data,
                    properties: this.#runtime.dif.convertJSValueToDIFValueContainer(data.properties),
                };
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

    public removeInterface(
        interface_uuid: ComInterfaceUUID,
    ): Promise<void> {
        return this.#jsComHub.remove_interface(interface_uuid);
    }

    public removeSocket(
        socket_uuid: ComInterfaceSocketUUID,
    ): Promise<void> {
        return this.#jsComHub.remove_socket(socket_uuid);
    }

    /**
     * Prints the metadata of the ComHub. Only available in debug builds.
     * Only exists in debug builds
     */
    public printMetadata(): void {
        const metadata = this.#jsComHub.get_metadata_string();
        console.info(metadata);
    }

    public getMetadata(): ComHubMetadata {
        // as any required because get_metadata only exists in debug builds
        return this.#runtime.dif.resolveDIFValueContainer(this.#jsComHub.get_metadata()) as ComHubMetadata;
    }

    /**
     * Prints the trace for a specific endpoint. Only available in debug builds.
     * @param endpoint The endpoint for which to print the trace.
     */
    public async printTrace(endpoint: string): Promise<void> {
        // as any required because get_trace_string only exists in debug builds
        const trace = await this.#jsComHub.get_trace_string(endpoint);
        if (trace === undefined) {
            console.warn(`No trace available for endpoint: ${endpoint}`);
            return;
        }
        console.info(trace);
    }

    public getTrace(endpoint: string): Promise<NetworkTraceResult | undefined> {
        // as any required because get_trace_string only exists in debug builds
        return this.#jsComHub.get_trace(endpoint);
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
