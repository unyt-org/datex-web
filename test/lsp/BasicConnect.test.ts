import { dedent } from "@qnighy/dedent";
import { Runtime } from "../../src/runtime/runtime.ts";
import { sleep } from "../utils.ts";
import { assertEquals } from "@std/assert/equals";

Deno.test("basic lsp", async () => {
    const INIT_FRAME = dedent`{
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "capabilities": {},
            "rootUri": null,
            "workspaceFolders": null
        }
    }`;

    const runtime = await Runtime.create({ endpoint: "@unyt", debug: true });
    const queue = [];
    const send = runtime.startLSP(
        (data: string) => {
            console.log("recv:", data);
            queue.push(data);
        },
    );
    send(`Content-Length: ${INIT_FRAME.length}\r\n\r\n${INIT_FRAME}`);
    await sleep(100);
    assertEquals(queue.length, 1, "Should have one message in queue");
});
