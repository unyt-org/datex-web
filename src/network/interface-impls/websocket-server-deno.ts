import type { WebSocketServerInterfaceSetupData } from "../../datex.ts";
import { createWebsocketServerComInterfaceFactory } from "./websocket-server-base.ts";
import type { ComInterfaceFactory } from "../com-hub.ts";

function denoServerFactory(setupData: WebSocketServerInterfaceSetupData): AsyncGenerator<WebSocket> {
    const [hostname, maybe_port] = setupData.bind_address.split(":");
    const port = maybe_port ? parseInt(maybe_port) : undefined;
    console.log("DENO 1");
    return async function* () {
        let server: Deno.HttpServer;
        const socketStream = new ReadableStream<WebSocket>({
            start(controller) {
                console.log("deno start");
                server = Deno.serve({ port, hostname }, (req) => {
                    if (req.headers.get("upgrade") != "websocket") {
                        return new Response(null, { status: 501 });
                    }
                    const { socket, response } = Deno.upgradeWebSocket(req);
                    controller.enqueue(socket);
                    return response;
                });
            },
            async cancel() {
                await server.shutdown();
            },
        });

        for await (const socket of socketStream) {
            yield socket;
        }
    }();
}

export const websocketServerDenoComInterfaceFactory: ComInterfaceFactory<WebSocketServerInterfaceSetupData> =
    createWebsocketServerComInterfaceFactory(denoServerFactory);
