import { Runtime } from "datex/runtime/mod.ts";
import { Endpoint } from "datex/lib/special-core-types/mod.ts";
import { appendEntry, clear, deleteEntry, DIFPropertyKind, listSplice, replace, setEntry } from "datex/dif/update.ts";
import type { DIFUpdateData } from "datex/dif/types/mod.ts";
import { assertEquals } from "@std/assert";

let runtime: Runtime;
Deno.test.beforeEach(async () => {
    runtime = await Runtime.create({ endpoint: Endpoint.get("@jonas") });
});

Deno.test("clear", () => {
    const reference = runtime.ref(new Map([["key1", "value1"], ["key2", "value2"]]));
    const expectedUpdate = clear();
    let observedUpdate: DIFUpdateData | null = null;
    reference.observe((update) => {
        observedUpdate = update;
    });
    reference.value.clear();
    assertEquals(observedUpdate, expectedUpdate);
    assertEquals(reference.value, new Map());
});

Deno.test("replace", () => {
    const reference = runtime.ref("Hello DATEX!");
    const expectedUpdate = replace(
        runtime.dif.convertJSValueToDIFValueContainer("Bye DATEX!"),
    );
    let observedUpdate: DIFUpdateData | null = null;
    reference.observe((update) => {
        observedUpdate = update;
    });
    reference.value = "Bye DATEX!";
    assertEquals(observedUpdate, expectedUpdate);
    assertEquals(reference.value, "Bye DATEX!");
});

Deno.test("append entry", () => {
    const reference = runtime.ref(["1", "2", "3"]);
    const expectedUpdate = appendEntry(
        runtime.dif.convertJSValueToDIFValueContainer("4"),
    );
    let observedUpdate: DIFUpdateData | null = null;
    reference.observe((update) => {
        observedUpdate = update;
    });
    reference.value.push("4");
    assertEquals(observedUpdate, expectedUpdate);
    assertEquals(reference.value, ["1", "2", "3", "4"]);
});

Deno.test("set entry", () => {
    const reference = runtime.ref(["1", "2", "3"]);
    const expectedUpdate = setEntry(
        runtime.dif.createDIFProperty(1, DIFPropertyKind.Index),
        runtime.dif.convertJSValueToDIFValueContainer("newValue"),
    );
    let observedUpdate: DIFUpdateData | null = null;
    reference.observe((update) => {
        observedUpdate = update;
    });
    reference.value[1] = "newValue";
    assertEquals(observedUpdate, expectedUpdate);
    assertEquals(reference.value, ["1", "newValue", "3"]);
});

Deno.test("delete entry", () => {
    const reference = runtime.ref(new Map([["key1", "value1"], ["key2", "value2"]]));
    const expectedUpdate = deleteEntry(
        runtime.dif.createDIFProperty("key2", DIFPropertyKind.ValueContainer),
    );
    let observedUpdate: DIFUpdateData | null = null;
    reference.observe((update) => {
        observedUpdate = update;
    });
    reference.value.delete("key2");
    assertEquals(observedUpdate, expectedUpdate);
    assertEquals(reference.value, new Map([["key1", "value1"]]));
});

Deno.test("list splice", () => {
    const reference = runtime.ref(["1", "2", "3", "4"]);
    const expectedUpdate = listSplice(
        1,
        2,
        ["5", "6"].map((item) => runtime.dif.convertJSValueToDIFValueContainer(item)),
    );
    let observedUpdate: DIFUpdateData | null = null;
    reference.observe((update) => {
        observedUpdate = update;
    });
    reference.value.splice(1, 2, "5", "6");
    assertEquals(observedUpdate, expectedUpdate);
    assertEquals(reference.value, ["1", "5", "6", "4"]);
});
