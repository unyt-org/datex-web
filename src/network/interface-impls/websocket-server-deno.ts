import type { ComInterfaceFactory } from "../com-hub.ts";
import type {
    BaseInterfacePublicHandle,
    ComInterfaceProperties,
    WebSocketServerInterfaceSetupData,
} from "../../datex-web/datex_web.d.ts";

/**
 * General utility functions for WebSockets that can be reused for different socket server implementations.
 */
export function registerWebSocket(
    webSocket: WebSocket,
    baseInterfaceHandle: BaseInterfacePublicHandle,
    closeCallback: (uuid: string) => void,
): Promise<string> {
    let uuid: string | null = null;

    const { promise, resolve, reject } = Promise.withResolvers<string>();

    webSocket.addEventListener("open", () => {
        uuid = baseInterfaceHandle.registerSocket("InOut", 1);

        webSocket.onmessage = (event: MessageEvent<ArrayBuffer>) => {
            baseInterfaceHandle.sendBlock(uuid!, new Uint8Array(event.data));
        };

        resolve(uuid);
    }, { once: true });

    webSocket.addEventListener("error", () => {
        if (uuid) {
            baseInterfaceHandle.removeSocket(uuid);
        }
        reject();
    }, { once: true });

    webSocket.addEventListener("close", () => {
        if (uuid) {
            baseInterfaceHandle.removeSocket(uuid);
            closeCallback(uuid);
        }
    }, { once: true });

    return promise;
}

export const websocketServerDenoComInterfaceFactory: ComInterfaceFactory<
    WebSocketServerInterfaceSetupData
> = {
    interfaceType: "websocket-server",
    factory: (baseInterfaceHandle, setupData) => {
        const sockets: Map<string, WebSocket> = new Map();
        // FIXME: workaround, convert map to object if map provided as setupData
        if (setupData instanceof Map) {
            setupData = Object.fromEntries(
                Array.from(setupData.entries()),
            ) as unknown as WebSocketServerInterfaceSetupData;
        }

        const [hostname, maybe_port] = setupData.bind_address.split(":");
        const port = maybe_port ? parseInt(maybe_port) : undefined;

        const server = Deno.serve({
            port,
            hostname,
        }, (req) => {
            if (req.headers.get("upgrade") != "websocket") {
                return new Response(null, { status: 501 });
            }
            const { socket: webSocket, response } = Deno.upgradeWebSocket(req);

            registerWebSocket(
                webSocket,
                baseInterfaceHandle,
                (uuid) => sockets.delete(uuid),
            )
                .then((uuid) => sockets.set(uuid, webSocket));
            return response;
        });

        // cleanup handler
        baseInterfaceHandle.onClosed(async () => {
            await server.shutdown();
        });

        // outgoing data handler
        baseInterfaceHandle.onReceive(
            (socket_uuid: string, data: Uint8Array) => {
                const socket = sockets.get(socket_uuid);
                if (socket) {
                    socket.send(data);
                } else {
                    // TODO:
                    console.error(
                        `WebSocketServer: No socket found for UUID ${socket_uuid}`,
                    );
                }
            },
        );

        // TODO: set properties
        return {
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
        } satisfies ComInterfaceProperties;
    },
};
