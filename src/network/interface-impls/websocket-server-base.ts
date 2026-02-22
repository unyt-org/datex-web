import type {ComInterfaceFactory} from "../com-hub.ts";
import type {
    WebSocketServerInterfaceSetupData,
} from "../../datex.ts";

/**
 * Utility function to create a WebSocket server communication interface factory from a given server factory function.
 * @param serverFactory
 */
export function createWebsocketServerComInterfaceFactory(serverFactory: (setupData: WebSocketServerInterfaceSetupData) => AsyncGenerator<WebSocket>): ComInterfaceFactory<WebSocketServerInterfaceSetupData> {
    return {
        interfaceType: "websocket-server",
        factory: setupData => {
            // FIXME: workaround, convert map to object if map provided as setupData
            if (setupData instanceof Map) {
                setupData = Object.fromEntries(
                    Array.from(setupData.entries()),
                ) as unknown as WebSocketServerInterfaceSetupData;
            }
            const server = serverFactory(setupData);

            // TODO: set properties
            return {
                properties: {
                    interface_type: "websocket-server",
                    channel: "websocket",
                    name: setupData.bind_address,
                    direction: "InOut",
                    round_trip_time: 0,
                    max_bandwidth: 0,
                    continuous_connection: false,
                    allow_redirects: false,
                    is_secure_channel: false,
                    reconnection_config: "NoReconnect",
                    auto_identify: true,
                    connectable_interfaces: [], // TODO add websocket client connections
                },
                has_single_socket: false,
                new_sockets_iterator: async function* () {
                    await using test = {
                        async [Symbol.asyncDispose]() {
                            console.log("TEST DISPOSED")
                        }
                    };

                    for await (const socket of server) {
                        yield {
                            properties: {
                                direction: "InOut",
                                channel_factor: 1,
                                connection_timestamp: Date.now(),
                                direct_endpoint: undefined,
                            },
                            iterator: async function* () {
                                for await (const data of createSocketDataIterator(socket)) {
                                    yield data;
                                }
                            }(),
                            send_callback: (data: Uint8Array) => {
                                socket.send(data);
                            },
                        }
                    }
                }(),
            }
        },
    }
}


/**
 * Utility function that returns an async generator yielding ArrayBuffers from a WebSocket
 */
function createSocketDataIterator(webSocket: WebSocket): AsyncGenerator<ArrayBuffer> {
    const messageStream = new ReadableStream<ArrayBuffer>({
        start(controller) {
            webSocket.onmessage = (event: MessageEvent<ArrayBuffer>) => {
                // ignore if not ArrayBuffer
                if (!(event.data instanceof ArrayBuffer)) {
                    console.warn("Received non-ArrayBuffer message, ignoring");
                    return;
                }
                controller.enqueue(event.data);
            };
            webSocket.onerror = () => {
                controller.error(new Error("WebSocket error"));
            };
            webSocket.onclose = () => {
                controller.close();
            };
        },
        cancel() {
            webSocket.close();
        },
    });

    return (async function* () {
        for await (const chunk of messageStream) {
            yield chunk;
        }
    })();
}