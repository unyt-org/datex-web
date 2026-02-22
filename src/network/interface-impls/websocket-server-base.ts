import type { ComInterfaceFactory } from "../com-hub.ts";
import type { SocketConfiguration, WebSocketServerInterfaceSetupData } from "../../datex.ts";

/**
 * Utility function to create a WebSocket server communication interface factory from a given server factory function.
 * @param serverFactory
 */
export function createWebsocketServerComInterfaceFactory(
    serverFactory: (setupData: WebSocketServerInterfaceSetupData) => ReadableStream<WebSocket>,
): ComInterfaceFactory<WebSocketServerInterfaceSetupData> {
    return {
        interfaceType: "websocket-server",
        factory: (setupData) => {
            // FIXME: workaround, convert map to object if map provided as setupData
            if (setupData instanceof Map) {
                setupData = Object.fromEntries(
                    Array.from(setupData.entries()),
                ) as unknown as WebSocketServerInterfaceSetupData;
            }

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
                new_sockets_iterator: serverFactory(setupData).pipeThrough(
                    new TransformStream<WebSocket, SocketConfiguration>({
                        async transform(socket, controller) {
                            const incoming_data_stream = await createSocketDataIterator(socket);
                            controller.enqueue({
                                properties: {
                                    direction: "InOut",
                                    channel_factor: 1,
                                    connection_timestamp: Date.now(),
                                    direct_endpoint: undefined,
                                },
                                iterator: incoming_data_stream,
                                send_callback: (data: ArrayBuffer) => {
                                    socket.send(data);
                                },
                            });
                        },
                    }),
                ),
            };
        },
    };
}

/**
 * Utility function that returns an async generator yielding ArrayBuffers from a WebSocket
 */
async function createSocketDataIterator(webSocket: WebSocket): Promise<ReadableStream<ArrayBuffer>> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    webSocket.addEventListener("open", () => resolve(), { once: true });
    webSocket.addEventListener("error", (event) => reject(new Error(`WebSocket error: ${event}`)), { once: true });
    // wait until the socket is open before starting to yield messages
    if (webSocket.readyState === WebSocket.OPEN) {
        resolve();
    } else if (webSocket.readyState === WebSocket.CLOSED || webSocket.readyState === WebSocket.CLOSING) {
        reject(new Error("WebSocket is already closed"));
    } else {
        // otherwise, wait for the open event
        console.log("Waiting for WebSocket to open...");
    }
    await promise;

    let closed = false;

    return new ReadableStream<ArrayBuffer>({
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
                if (!closed) controller.close();
            };
        },
        cancel() {
            webSocket.close();
            closed = true;
        },
    });
}
