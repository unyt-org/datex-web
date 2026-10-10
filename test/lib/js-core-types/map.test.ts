import { assertEquals } from "@std/assert/equals";
import { Runtime } from "datex/runtime/runtime.ts";
import { CoreLibTypeId } from "datex/dif/core.ts";
import { Endpoint } from "datex/lib/mod.ts";
import { performFakeRemoteUpdate } from "../utils.ts";
import type { SharedContainerMutability } from "datex/shared-container/base-shared-container.ts";
import type { SharedRef } from "datex/shared-container/mod.ts";
import { clear, deleteEntry, DIFPropertyKind, replace, setEntry } from "datex/dif/update.ts";
import { integer } from "datex/dif/helpers/typed-integer.ts";
let runtime: Runtime;
Deno.test.beforeEach(async () => {
    runtime = await Runtime.create({ endpoint: Endpoint.get("@test") });
});

function getCurrentRuntimeLocalValue<T>(address: string) {
    return runtime.dif
        .resolveDIFValueContainer(
            runtime.dif._handle.resolve_pointer_address(address)[0],
        ) as T;
}

Deno.test("map set external", () => {
    // create mutable pointer to map
    const map = runtime.createSharedValueFromJSValue(
        new Map<string | number, string>([
            ["key1", "value1"],
            [2, "value2"],
        ]),
    );
    const mapRef = map.value;
    const address = map.pointerAddress;

    // fake a remote update from transceiver 42
    performFakeRemoteUpdate(
        runtime,
        address,
        setEntry(
            runtime.dif.createDIFProperty("externalKey", DIFPropertyKind.Text),
            runtime.dif.convertJSValueToDIFValueContainer("newValue"),
        ),
    );
    assertEquals(mapRef.get("externalKey"), "newValue");
});

Deno.test("map delete external", () => {
    // create mutable ref to map
    const map = runtime.createSharedValueFromJSValue(
        new Map<string | number, string>([
            ["key1", "value1"],
            [2, "value2"],
        ]),
    );
    const mapRef = map.value;
    const address = map.pointerAddress;
    performFakeRemoteUpdate(runtime, address, deleteEntry(runtime.dif.createDIFProperty("key1", DIFPropertyKind.Text)));
    assertEquals(mapRef.has("key1"), false);
});

Deno.test("map clear external", () => {
    // create mutable ref to map
    const map = runtime.createSharedValueFromJSValue(
        new Map<string | number, string>([
            ["key1", "value1"],
            [2, "value2"],
        ]),
    );
    const mapRef = map.value;
    const address = map.pointerAddress;

    performFakeRemoteUpdate(runtime, address, clear());
    assertEquals(mapRef.size, 0);
});

Deno.test("map replace external", () => {
    // create mutable ref to map
    const map = runtime.createSharedValueFromJSValue(
        new Map<string | number, string>([
            ["key1", "value1"],
            [2, "value2"],
        ]),
    );
    const mapRef = map.value;
    const address = map.pointerAddress;

    performFakeRemoteUpdate(
        runtime,
        address,
        replace(
            runtime.dif.convertJSValueToDIFValueContainer(
                new Map<string, string>([
                    ["a", "valueA"],
                    ["b", "valueB"],
                ]),
            ),
        ),
    );
    assertEquals(
        mapRef,
        new Map<string, string>([
            ["a", "valueA"],
            ["b", "valueB"],
        ]) as SharedRef<Map<string, string>, SharedContainerMutability.Mutable>,
    );
});

Deno.test("map set local", () => {
    // create mutable ref to map
    const map = runtime.createSharedValueFromJSValue(
        new Map<string | number, string>([
            ["key1", "value1"],
            [2, "value2"],
        ]),
    );
    const mapRef = map.value;
    const address = map.pointerAddress;

    // 2. local update
    mapRef.set("localKey", "localValue");
    assertEquals(mapRef.get("localKey"), "localValue");

    assertEquals(
        getCurrentRuntimeLocalValue<Map<unknown, unknown>>(address).get(
            "localKey",
        ),
        "localValue",
    );
});

Deno.test("map delete local", () => {
    // create mutable ref to map
    const map = runtime.createSharedValueFromJSValue(
        new Map<string | number, string>([
            ["key1", "value1"],
            [2, "value2"],
            ["toBeDeleted", "value3"],
        ]),
    );
    const address = map.pointerAddress;
    const mapRef = map.value;

    // 2. local update
    mapRef.delete("toBeDeleted");
    assertEquals(mapRef.has("toBeDeleted"), false);
    assertEquals(
        getCurrentRuntimeLocalValue<Map<unknown, unknown>>(address).has(
            "toBeDeleted",
        ),
        false,
    );
});

Deno.test("map clear local", () => {
    // create mutable ref to map
    const map = runtime.createSharedValueFromJSValue(
        new Map<string | number, string>([
            ["key1", "value1"],
            [2, "value2"],
        ]),
    );
    const mapRef = map.value;
    const address = map.pointerAddress;

    // 2. local update
    mapRef.clear();
    assertEquals(mapRef.size, 0);
    assertEquals(
        getCurrentRuntimeLocalValue<Map<unknown, unknown>>(address).size,
        0,
    );
});

Deno.test("structural map from datex", () => {
    const map = runtime.executeSync<Record<string, unknown>>("{}", []);
    assertEquals(map instanceof Map, false);
    assertEquals(Object.keys(map).length, 0);
});

Deno.test("map from datex", () => {
    const mapDif = runtime.dif.executeSyncDIF("{(1): 2}");
    assertEquals(mapDif, [CoreLibTypeId.Map, [
        [
            integer(1),
            integer(2),
        ],
    ]]);

    const map = runtime.executeSync<Map<number, number>>("{(1): 2}", []);

    assertEquals(map instanceof Map, true);
    assertEquals(map.size, 1);
    assertEquals(map.get(1), 2);
});
