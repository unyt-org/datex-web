/* tslint:disable */
/* eslint-disable */
export interface AcceptAddress {
    address: string;
    tls_mode: TLSMode | undefined;
}

export interface ComHubMetadata {
    endpoint: Endpoint;
    interfaces: ComHubMetadataInterface[];
    endpoint_sockets: Map<Endpoint, [ComInterfaceSocketUUID, DynamicEndpointProperties][]>;
}

export interface ComHubMetadataInterface {
    uuid: string;
    properties: ComInterfaceProperties;
    sockets: ComHubMetadataInterfaceSocket[];
    is_waiting_for_socket_connections: boolean;
}

export interface ComHubMetadataInterfaceSocket {
    uuid: string;
    direction: InterfaceDirection;
    endpoint: Endpoint | undefined;
    properties: DynamicEndpointProperties | undefined;
}

export interface ComHubMetadataInterfaceSocketWithoutEndpoint {
    uuid: string;
    direction: InterfaceDirection;
}

export interface ComInterfaceConfiguration {
    uuid?: ComInterfaceUUID;
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
    new_sockets_iterator: AsyncGenerator<SocketConfiguration>;
}

export interface ComInterfaceProperties {
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
    connectable_interfaces: RuntimeConfigInterface[] | undefined;
}

export interface DecompileOptions {
    formatting_options?: FormattingOptions;
    /**
     * display slots with generated variable names
     */
    resolve_slots?: boolean;
}

export interface DynamicEndpointProperties {
    known_since: number;
    distance: number;
    is_direct: boolean;
    channel_factor: number;
    direction: InterfaceDirection;
}

export interface FormattingOptions {
    mode?: FormattingMode;
    json_compat?: boolean;
    colorized?: boolean;
    add_variant_suffix?: boolean;
}

export interface HTTPClientInterfaceSetupData {
    /**
     * A websocket URL (http:// or https://).
     */
    url: string;
}

export interface HTTPServerInterfaceSetupData {
    /**
     * The address to bind the HTTP server to (e.g., \"0.0.0.0:8080\").
     */
    bind_address: string;
    /**
     * A list of addresses the server should accept connections from,
     * along with their optional TLS mode.
     * E.g., [(\"example.com\", Some(TLSMode::WithCertificate { ... })), (\"example.org:1234\", None)]
     */
    accept_addresses: AcceptAddress[] | undefined;
}

export interface RuntimeConfigInterface {
    type: string;
    config: unknown;
    priority?: InterfacePriority;
}

export interface SerialClientInterfaceSetupData {
    port_name: string | undefined;
    baud_rate: number;
}

export interface SocketConfiguration {
    properties: SocketProperties;
    /**
     * An asynchronous iterator that yields incoming data from the socket as Vec<u8>
     * It is driven by the com hub to receive data from the socket
     */
    iterator: AsyncGenerator<ArrayBuffer>;
    /**
     * A callback that is called by the com hub to send data through the socket
     * This can be either a synchronous or asynchronous callback depending on the interface implementation
     */
    send_callback: (data: Uint8Array) => void;
}

export interface SocketProperties {
    direction: InterfaceDirection;
    channel_factor: number;
    direct_endpoint: Endpoint | undefined;
    connection_timestamp: number;
    uuid?: ComInterfaceSocketUUID;
}

export interface TCPClientInterfaceSetupData {
    address: string;
}

export interface TCPServerInterfaceSetupData {
    port: number;
    host: string | undefined;
}

export interface WebSocketClientInterfaceSetupData {
    /**
     * A websocket URL (ws:// or wss://).
     */
    url: string;
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
    accept_addresses: AcceptAddress[] | undefined;
}

export type ComInterfaceSocketUUID = string;

export type ComInterfaceUUID = string;

export type Endpoint = string;

export type FormattingMode = { type: "Compact" } | { type: "Pretty"; indent: number; indent_type?: IndentType };

export type IndentType = "Spaces" | "Tabs";

export type InterfaceDirection = "In" | "Out" | "InOut";

export type InterfacePriority = "None" | { Priority: number };

export type ReconnectionConfig = "NoReconnect" | "InstantReconnect" | {
    ReconnectWithTimeout: { timeout: { secs: number; nanos: number } };
} | { ReconnectWithTimeoutAndAttempts: { timeout: { secs: number; nanos: number }; attempts: number } };

export type TLSMode = { type: "HandledExternally" } | {
    type: "WithCertificate";
    data: { private_key: number[]; certificate: number[] };
};

export class BaseInterfacePublicHandle {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    destroy(): void;
    onClosed(cb: Function): void;
    onReceive(cb: Function): void;
    registerSocket(direction: string, channel_factor: number, direct_endpoint?: string | null): string;
    removeSocket(socket_uuid: string): void;
    sendBlock(socket_uuid: string, data: Uint8Array): void;
}

export class JSComHub {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    close_interface(interface_uuid: string): Promise<void>;
    create_interface(interface_type: string, setup_data: any, priority?: number | null): Promise<string>;
    get_metadata(): any;
    /**
     * Send a block to the given interface and socket
     * This does not involve the routing on the ComHub level.
     * The socket UUID is used to identify the socket to send the block over
     * The interface UUID is used to identify the interface to send the block over
     */
    get_metadata_string(): string;
    get_trace_string(endpoint: string): Promise<string | undefined>;
    register_default_interface_factories(): void;
    register_incoming_block_interceptor(callback: Function): void;
    register_interface_factory(interface_type: string, factory: Function): void;
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
    _create_block(body: Uint8Array | null | undefined, receivers: string[]): Uint8Array;
    crypto_test_tmp(): Promise<Promise<any>>;
    /**
     * Get a handle to the DIF interface of the runtime
     */
    dif(): RuntimeDIFHandle;
    execute(script: string, dif_values?: any[] | null): Promise<any>;
    execute_sync(script: string, dif_values?: any[] | null): any;
    execute_sync_with_string_result(
        script: string,
        dif_values: any[] | null | undefined,
        decompile_options: any,
    ): string;
    execute_with_string_result(
        script: string,
        dif_values: any[] | null | undefined,
        decompile_options: any,
    ): Promise<string>;
    /**
     * Start the LSP server, returning a JS function to send messages to Rust
     */
    start_lsp(send_to_js: Function): Function;
    value_to_string(dif_value: any, decompile_options: any): string;
    com_hub: JSComHub;
    readonly endpoint: string;
    readonly version: string;
}

export class RuntimeDIFHandle {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    apply(callee: any, value: any): any;
    create_pointer(value: any, allowed_type: any, mutability: number): string;
    observe_pointer(transceiver_id: number, address: string, observe_options: any, callback: Function): number;
    /**
     * Resolve a pointer address, returning a Promise
     * If the pointer is in memory, the promise resolves immediately
     * If the pointer is not in memory, it will be loaded first
     */
    resolve_pointer_address(address: string): any;
    /**
     * Resolve a pointer address synchronously if it's in memory, otherwise return an error
     */
    resolve_pointer_address_sync(address: string): any;
    unobserve_pointer(address: string, observer_id: number): void;
    update(transceiver_id: number, address: string, update: any): void;
    update_observer_options(address: string, observer_id: number, observe_options: any): void;
}

export function create_runtime(config: any, debug_config: any): Promise<JSRuntime>;

/**
 * Executes a Datex script and returns the result as a string.
 */
export function execute(datex_script: string, decompile_options: any): string;

/**
 * Executes a Datex script and returns true when execution was successful.
 * Does not return the result of the script, but only indicates success or failure.
 */
export function execute_internal(datex_script: string): boolean;
