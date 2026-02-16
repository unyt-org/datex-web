// @generated file from wasmbuild -- do not edit
// deno-lint-ignore-file
// deno-fmt-ignore-file

/**
 * Executes a Datex script and returns the result as a string.
 */
export function execute(datex_script: string, decompile_options: any): string;
export function create_runtime(config: any, debug_flags: any): JSRuntime;
/**
 * Executes a Datex script and returns true when execution was successful.
 * Does not return the result of the script, but only indicates success or failure.
 */
export function execute_internal(datex_script: string): boolean;
export type SerialInterfaceSetupDataJS = SerialInterfaceSetupData;

export type ComInterfaceSocketUUID = string;

export type ComInterfaceUUID = string;

export type ReconnectionConfig = "NoReconnect" | "InstantReconnect" | {
    ReconnectWithTimeout: { timeout: { secs: number; nanos: number } };
} | {
    ReconnectWithTimeoutAndAttempts: {
        timeout: { secs: number; nanos: number };
        attempts: number;
    };
};

export type InterfaceDirection = "In" | "Out" | "InOut";

export interface InterfaceProperties {
    /**
     * the type of the interface, by which it is identified
     * e.g. \"tcp-client\", \"websocket-server\",
     * multiple interfaces implementations (e.g. for native and web)
     * can have the same interface type if they are compatible and
     * have an identical initialization function
     */
    interface_type: string;
    /**
     * the channel that the interface is using,
     * e.g. \"tcp\", \"websocket\
     */
    channel: string;
    /**
     * a unique name that further identifies an interface instance
     * e.g. \"wss://example.com:443\
     */
    name: string | undefined;
    /**
     * The support message direction of the interface
     */
    direction: InterfaceDirection;
    /**
     * Estimated mean latency for this interface type in milliseconds (round trip time).
     * Lower latency interfaces are preferred over higher latency channels
     */
    round_trip_time: number;
    /**
     * Bandwidth in bytes per second
     */
    max_bandwidth: number;
    /**
     * If true, the interface does support continuous connections
     */
    continuous_connection: boolean;
    /**
     * If true, the interface can be used to redirect DATEX messages to other endpoints
     * which are not directly connected to the interface (default: true)
     * Currently only enforced for broadcast messages
     */
    allow_redirects: boolean;
    /**
     * If true, the interface is a secure channel (can not be eavesdropped).
     * This might be an already encrypted channel such as WebRTC or a channel
     * that is end-to-end and not interceptable by third parties
     */
    is_secure_channel: boolean;
    reconnection_config: ReconnectionConfig;
    auto_identify: boolean;
    created_sockets: ComInterfaceSocketUUID[] | undefined;
    connectable_interfaces: RuntimeConfigInterface[] | undefined;
}

export type InterfacePriority = "None" | { Priority: number };

export type FormattingMode = { type: "Compact" } | {
    type: "Pretty";
    indent: number;
    indent_type?: IndentType;
};

export interface DecompileOptions {
    formatting_options?: FormattingOptions;
    /**
     * display slots with generated variable names
     */
    resolve_slots?: boolean;
}

export type IndentType = "Spaces" | "Tabs";

export interface FormattingOptions {
    mode?: FormattingMode;
    json_compat?: boolean;
    colorized?: boolean;
    add_variant_suffix?: boolean;
}

export interface RTCIceServer {
    urls: string[];
    username: string | undefined;
    credential: string | undefined;
}

export interface RuntimeConfigInterface {
    type: string;
    config: unknown;
    priority?: InterfacePriority;
}

export interface ComHubMetadataInterfaceSocketWithoutEndpoint {
    uuid: string;
    direction: InterfaceDirection;
}

export interface ComHubMetadataInterface {
    uuid: string;
    properties: InterfaceProperties;
    sockets: ComHubMetadataInterfaceSocket[];
}

export interface ComHubMetadata {
    endpoint: Endpoint;
    interfaces: ComHubMetadataInterface[];
    endpoint_sockets: Map<
        Endpoint,
        [ComInterfaceSocketUUID, DynamicEndpointProperties][]
    >;
}

export interface ComHubMetadataInterfaceSocket {
    uuid: string;
    direction: InterfaceDirection;
    endpoint: Endpoint | undefined;
    properties: DynamicEndpointProperties | undefined;
}

export type Endpoint = string;

export interface WebRTCInterfaceSetupData {
    peer_endpoint: string;
    ice_servers: RTCIceServer[] | undefined;
}

export interface SerialInterfaceSetupData {
    port_name: string | undefined;
    baud_rate: number;
}

export interface WebSocketServerInterfaceSetupData {
    /**
     * The address to bind the WebSocket server to (e.g., \"0.0.0.0:8080\").
     */
    bind_address: string;
    /**
     * A list of addresses the server should accept connections from,
     * along with their optional TLS mode.
     * E.g., [(\"example.com\", Some(TLSMode::WithCertificate { ... })), (\"example.org:1234\", None)]
     */
    accept_addresses: [string, TLSMode | undefined][] | undefined;
}

export interface WebSocketClientInterfaceSetupData {
    /**
     * A websocket URL (ws:// or wss://).
     */
    url: string;
}

export type TLSMode = { type: "HandledExternally" } | {
    type: "WithCertificate";
    data: { private_key: number[]; certificate: number[] };
};

export interface DynamicEndpointProperties {
    known_since: number;
    distance: number;
    is_direct: boolean;
    channel_factor: number;
    direction: InterfaceDirection;
}

export class BaseInterfaceHandle {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    onReceive(cb: Function): void;
    removeSocket(socket_uuid: string): void;
    onClosed(cb: Function): void;
    registerSocket(
        direction: string,
        channel_factor: number,
        direct_endpoint?: string | null,
    ): string;
    /**
     * Gets the current state of the interface
     */
    getState(): string;
    destroy(): void;
    sendBlock(socket_uuid: string, data: Uint8Array): void;
}
export class JSComHub {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    register_default_interface_factories(): void;
    register_interface_factory(interface_type: string, factory: Function): void;
    get_trace_string(endpoint: string): Promise<string | undefined>;
    /**
     * Send a block to the given interface and socket
     * This does not involve the routing on the ComHub level.
     * The socket UUID is used to identify the socket to send the block over
     * The interface UUID is used to identify the interface to send the block over
     */
    send_block(
        block: Uint8Array,
        interface_uuid: string,
        socket_uuid: string,
    ): Promise<void>;
    get_metadata(): any;
    get_metadata_string(): string;
    create_interface(
        interface_type: string,
        setup_data: any,
        priority?: number | null,
    ): Promise<string>;
    close_interface(interface_uuid: string): void;
    register_incoming_block_interceptor(callback: Function): void;
    register_outgoing_block_interceptor(callback: Function): void;
}
export class JSPointer {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}
export class JSRuntime {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    execute_sync_with_string_result(
        script: string,
        dif_values: any[] | null | undefined,
        decompile_options: any,
    ): string;
    /**
     * Start the LSP server, returning a JS function to send messages to Rust
     */
    start_lsp(send_to_js: Function): Function;
    value_to_string(dif_value: any, decompile_options: any): string;
    execute(script: string, dif_values?: any[] | null): Promise<any>;
    crypto_test_tmp(): Promise<Promise<any>>;
    execute_sync(script: string, dif_values?: any[] | null): any;
    /**
     * Get a handle to the DIF interface of the runtime
     */
    dif(): RuntimeDIFHandle;
    _create_block(
        body: Uint8Array | null | undefined,
        receivers: string[],
    ): Uint8Array;
    start(): Promise<void>;
    execute_with_string_result(
        script: string,
        dif_values: any[] | null | undefined,
        decompile_options: any,
    ): Promise<string>;
    com_hub: JSComHub;
    readonly endpoint: string;
    readonly version: string;
}
export class RuntimeDIFHandle {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Resolve a pointer address synchronously if it's in memory, otherwise return an error
     */
    resolve_pointer_address_sync(address: string): any;
    update(transceiver_id: number, address: string, update: any): void;
    observe_pointer(
        transceiver_id: number,
        address: string,
        observe_options: any,
        callback: Function,
    ): number;
    apply(callee: any, value: any): any;
    /**
     * Resolve a pointer address, returning a Promise
     * If the pointer is in memory, the promise resolves immediately
     * If the pointer is not in memory, it will be loaded first
     */
    resolve_pointer_address(address: string): any;
    unobserve_pointer(address: string, observer_id: number): void;
    update_observer_options(
        address: string,
        observer_id: number,
        observe_options: any,
    ): void;
    create_pointer(value: any, allowed_type: any, mutability: number): string;
}
