export type MockupServerInstance = {
    receiveQueue: Uint8Array[];
    nextMessage: () => Promise<void>;
    [Symbol.asyncDispose]: () => Promise<void>;
    send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => void;
}
export const createMockupServer = (port = 9999) => {
    const receiveQueue: Uint8Array[] = [];
    return new Promise<MockupServerInstance>((resolve, reject) => {
        const timeout = setTimeout(
            () => reject("No client connected. Timed out."),
            10_000,
        );
        let mainSocket: WebSocket | undefined;
        let nextmessageResolve: () => void;
        const server = Deno.serve({ port }, (req) => {
            if (req.headers.get("upgrade") !== "websocket") {
                return new Response("Expected a WebSocket request", {
                    status: 400,
                });
            }
            if (mainSocket?.readyState === WebSocket.OPEN) {
                return new Response("Only one client allowed", { status: 400 });
            }
            const { socket, response } = Deno.upgradeWebSocket(req);
            mainSocket = socket;
            socket.onopen = () => resolve(result);
            socket.onmessage = (event) => {
                console.log("Received:", event.data);
                nextmessageResolve?.();
                receiveQueue.push(event.data);
            };
            socket.onclose = () => {
                mainSocket = undefined;
                console.log("WebSocket connection closed");
            };
            socket.onerror = (err) => {
                mainSocket = undefined;
                console.error("WebSocket error:", err);
            };
            return response;
        });
        const result = {
            receiveQueue,
            nextMessage: () =>
                new Promise<void>((resolve) => {
                    nextmessageResolve = resolve;
                }),
            send: (data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
                if (mainSocket?.readyState === WebSocket.OPEN) {
                    mainSocket.send(data);
                }
            },
            [Symbol.asyncDispose]: () => {
                clearTimeout(timeout);
                mainSocket?.close();
                return server?.shutdown();
            },
        };
    });
};
