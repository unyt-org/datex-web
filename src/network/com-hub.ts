import type {
    BaseInterfaceHandle,
    ComHubMetadata,
    JSComHub,
} from "../datex-web/datex_web_js.d.ts";
import type { DIFValueContainer } from "../dif/definitions.ts";
import type { InterfaceProperties } from "../datex-web.ts";
import type { Runtime } from "../runtime/runtime.ts";

export type ComInterfaceFactory<SetupData = unknown> = {
    interfaceType: string;
    factory: ComInterfaceFactoryFn<SetupData>;
};

export type ComInterfaceFactoryFn<SetupData = unknown> = (
    handle: BaseInterfaceHandle,
    setup_data: SetupData,
) => InterfaceProperties | Promise<InterfaceProperties>;

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
            async (
                handle: BaseInterfaceHandle,
                setup_data: DIFValueContainer,
            ) => {
                return this.#runtime.dif.convertJSValueToDIFValueContainer(
                    factoryDefinition.factory(
                        handle,
                        await this.#runtime.dif.resolveDIFValueContainer<
                            SetupData
                        >(
                            setup_data,
                        ),
                    ),
                );
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

    public closeInterface(interface_uuid: ComInterfaceUUID): void {
        this.#jsComHub.close_interface(interface_uuid);
    }

    /**
     * Prints the metadata of the ComHub. Only available in debug builds.
     */
    public printMetadata(): void {
        // as any required because get_metadata_string only exists in debug builds
        // deno-lint-ignore no-explicit-any
        const metadata = (this.#jsComHub as any).get_metadata_string();
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
     * @deprecated Use sender of interface instead.
     * Sends a block of data to a specific interface and socket.
     * @param block The data block to send.
     * @param interface_uuid The UUID of the interface to send the block to.
     * @param socket_uuid The UUID of the socket to send the block to.
     * @returns A promise that resolves to true if the block was sent successfully, false otherwise.
     */
    public sendBlock(
        block: Uint8Array,
        interface_uuid: string,
        socket_uuid: string,
    ) {
        this.#jsComHub.send_block(block, interface_uuid, socket_uuid);
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
