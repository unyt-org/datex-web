import type { WebSocketServerInterfaceSetupData } from "../../datex.ts";
import { createWebsocketServerComInterfaceFactory } from "./websocket-server-base.ts";
import type { ComInterfaceFactory } from "../com-hub.ts";

function denoServerFactory(setupData: WebSocketServerInterfaceSetupData): ReadableStream<WebSocket> {
    const [hostname, maybe_port] = setupData.bind_address.split(":");
    const port = maybe_port ? parseInt(maybe_port) : undefined;

    let server: Deno.HttpServer;

    return new ReadableStream<WebSocket>({
        start(controller) {
            server = Deno.serve(
                { port, hostname },
                (req) => {
                    if (req.headers.get("upgrade") != "websocket") {
                        return new Response(null, { status: 501 });
                    }
                    const { socket, response } = Deno.upgradeWebSocket(req);
                    controller.enqueue(socket);
                    return response;
                }
            );
        },
        async cancel() {
            await server.shutdown();
        },
    });
}

export const websocketServerDenoComInterfaceFactory: ComInterfaceFactory<WebSocketServerInterfaceSetupData> =
    createWebsocketServerComInterfaceFactory(denoServerFactory);
