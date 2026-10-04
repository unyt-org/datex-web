import type { ComInterfaceFactory, SocketConfiguration } from "../com-hub.ts";
import { tagged } from "datex/lib/special-core-types/tagged.ts";
import type { WebSocketServerInterfaceSetupData } from "../../datex-web/types/network/com_interfaces/default_setup_data/websocket/websocket_server.ts";
import { DIFHandler } from "datex/dif/dif-handler.ts";

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
                    direction: tagged("InOut"),
                    round_trip_time: 0,
                    max_bandwidth: 0,
                    continuous_connection: false,
                    allow_redirects: false,
                    is_secure_channel: false,
                    reconnection_config: tagged("NoReconnect"),
                    auto_identify: true,
                    connectable_interfaces: [], // TODO add websocket client connections
                },
                has_single_socket: false,
                new_sockets_iterator: serverFactory(setupData).pipeThrough(
                    new TransformStream<WebSocket, SocketConfiguration>({
                        async transform(socket, controller) {
                            const incoming_data_stream = await createSocketDataIterator(socket);
                            controller.enqueue({
                                properties: DIFHandler.convertJSValueToDIFValueContainer({
                                    direction: tagged("InOut"),
                                    channel_factor: 1,
                                    direct_endpoint: null,
                                }),
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
