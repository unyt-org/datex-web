import { assertEquals } from "@std/assert/equals";
import { mapTypeBinding } from "datex/lib/js-core-types/map.ts";
import { Runtime } from "datex/runtime/runtime.ts";
import { DIFUpdateKind } from "datex/dif/definitions.ts";
import { CoreTypeAddress } from "datex/dif/core.ts";
const runtime = new Runtime({ endpoint: "@test" });
runtime.dif.type_registry.registerTypeBinding(mapTypeBinding);

function getCurrentRuntimeLocalValue<T>(address: string) {
    return runtime.dif
        .resolveDIFValueContainerSync(
            runtime.dif._handle.resolve_pointer_address_sync(address).value,
        ) as T;
}

function createMapReference<K, V>(map: Map<K, V>): [Map<K, V>, string] {
    const mapPtr = runtime.createTransparentReference(map);
    const address = runtime.dif.getPointerAddressForValue(mapPtr)!;
    return [mapPtr, address];
}

Deno.test("map set external", () => {
    // create mutable pointer to map
    const [map, address] = createMapReference(
        new Map<string | number, string>([
            ["key1", "value1"],
            [2, "value2"],
        ]),
    );

    // fake a remote update from transceiver 42
    runtime._runtime.dif().update(42, address, {
        key: { kind: "text", value: "externalKey" },
        value: { value: "newValue" },
        kind: DIFUpdateKind.Set,
    });
    assertEquals(map.get("externalKey"), "newValue");
});

Deno.test("map delete external", () => {
    // create mutable ref to map
    const [map, address] = createMapReference(
        new Map<string | number, string>([
            ["key1", "value1"],
            [2, "value2"],
        ]),
    );
    runtime._runtime.dif().update(42, address, {
        kind: DIFUpdateKind.Delete,
        key: { kind: "text", value: "key1" },
    });
    assertEquals(map.has("key1"), false);
});

Deno.test("map clear external", () => {
    // create mutable ref to map
    const [map, address] = createMapReference(
        new Map<string | number, string>([
            ["key1", "value1"],
            [2, "value2"],
        ]),
    );

    runtime._runtime.dif().update(42, address, {
        kind: DIFUpdateKind.Clear,
    });
    assertEquals(map.size, 0);
});

Deno.test("map replace external", () => {
    // create mutable ref to map
    const [map, address] = createMapReference(
        new Map<string | number, string>([
            ["key1", "value1"],
            [2, "value2"],
        ]),
    );

    runtime._runtime.dif().update(42, address, {
        kind: DIFUpdateKind.Replace,
        value: runtime.dif.convertJSValueToDIFValueContainer(
            new Map<string, string>([
                ["a", "valueA"],
                ["b", "valueB"],
            ]),
        ),
    });
    assertEquals(
        map,
        new Map<string, string>([
            ["a", "valueA"],
            ["b", "valueB"],
        ]),
    );
});

Deno.test("map set local", () => {
    // create mutable ref to map
    const [map, address] = createMapReference(
        new Map<string | number, string>([
            ["key1", "value1"],
            [2, "value2"],
        ]),
    );

    // 2. local update
    map.set("localKey", "localValue");
    assertEquals(map.get("localKey"), "localValue");
    assertEquals(
        getCurrentRuntimeLocalValue<Map<unknown, unknown>>(address).get(
            "localKey",
        ),
        "localValue",
    );
});

Deno.test("map delete local", () => {
    // create mutable ref to map
    const [map, address] = createMapReference(
        new Map<string | number, string>([
            ["key1", "value1"],
            [2, "value2"],
            ["toBeDeleted", "value3"],
        ]),
    );

    // 2. local update
    map.delete("toBeDeleted");
    assertEquals(map.has("toBeDeleted"), false);
    assertEquals(
        getCurrentRuntimeLocalValue<Map<unknown, unknown>>(address).has(
            "toBeDeleted",
        ),
        false,
    );
});

Deno.test("map clear local", () => {
    // create mutable ref to map
    const [map, address] = createMapReference(
        new Map<string | number, string>([
            ["key1", "value1"],
            [2, "value2"],
        ]),
    );
    // 2. local update
    map.clear();
    assertEquals(map.size, 0);
    assertEquals(
        getCurrentRuntimeLocalValue<Map<unknown, unknown>>(address).size,
        0,
    );
});

Deno.test("structural map from datex", () => {
    const mapDif = runtime.dif.executeSyncDIF("{}");
    assertEquals(mapDif, { value: {} });

    const map = runtime.executeSync<Record<string, unknown>>("{}", []);
    assertEquals(map instanceof Map, false);
    assertEquals(Object.keys(map).length, 0);
});

Deno.test("map from datex", () => {
    const mapDif = runtime.dif.executeSyncDIF("{(1): 2}");
    assertEquals(mapDif, {
        value: [
            [
                { type: CoreTypeAddress.integer, value: "1" },
                { type: CoreTypeAddress.integer, value: "2" },
            ],
        ],
    });

    const map = runtime.executeSync<Map<number, number>>("{(1): 2}", []);

    assertEquals(map instanceof Map, true);
    assertEquals(map.size, 1);
    assertEquals(map.get(1), 2);
});
