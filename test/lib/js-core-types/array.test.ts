import { assertEquals } from "@std/assert/equals";
import { Runtime } from "datex/runtime/runtime.ts";
import { DIFUpdateKind } from "datex/dif/definitions.ts";
import { arrayTypeBinding } from "datex/lib/js-core-types/array.ts";

const runtime = new Runtime({ endpoint: "@test" });
runtime.dif.type_registry.registerTypeBinding(arrayTypeBinding);

function getCurrentRuntimeLocalValue<T>(address: string) {
    return runtime.dif
        .resolveDIFValueContainerSync(
            runtime.dif._handle.resolve_pointer_address_sync(address).value,
        ) as T;
}

function createArrayReference<T>(array: T[]): [T[], string] {
    const arrayPtr = runtime.createTransparentReference(array);
    const address = runtime.dif.getPointerAddressForValue(arrayPtr)!;
    return [arrayPtr, address];
}

Deno.test("array set external", () => {
    // create mutable ref to array
    const array = ["value1", "value2", 123];
    const [arrayPtr, address] = createArrayReference(array);

    // TODO: property updates are not yet implemented in DATEX Script
    // runtime.executeSync(`${mapPtr}.test = 'newValue'`);
    // fake a remote update from transceiver 42
    runtime._runtime.dif().update(42, address, {
        key: { kind: "index", value: 0 },
        value: { value: "newValue" },
        kind: DIFUpdateKind.Set,
    });
    assertEquals(arrayPtr[0], "newValue");
});

Deno.test("array append external", () => {
    // create mutable ref to array
    const array = ["value1", "value2", 123];
    const [arrayPtr, address] = createArrayReference(array);

    runtime._runtime.dif().update(42, address, {
        value: { value: "newValueEnd" },
        kind: DIFUpdateKind.Append,
    });
    assertEquals(arrayPtr[3], "newValueEnd");
});

Deno.test("array delete external", () => {
    // create mutable ref to array
    const array = ["value1", "value2", 123];
    const [arrayPtr, address] = createArrayReference(array);

    runtime._runtime.dif().update(42, address, {
        kind: DIFUpdateKind.Delete,
        key: { kind: "index", value: 0 },
    });
    assertEquals(arrayPtr, ["value2", 123]);
});

Deno.test("array clear external", () => {
    // create mutable ref to array
    const array = ["value1", "value2", 123];
    const [arrayPtr, address] = createArrayReference(array);

    runtime.dif._handle.update(42, address, {
        kind: DIFUpdateKind.Clear,
    });
    assertEquals(arrayPtr.length, 0);
});

Deno.test("array replace external", () => {
    // create mutable ref to array
    const array = ["value1", "value2", 123];
    const [arrayPtr, address] = createArrayReference(array);

    arrayPtr.push("toBeRemoved");
    runtime._runtime.dif().update(42, address, {
        value: runtime.dif.convertJSValueToDIFValueContainer(["a", "b", "c"]),
        kind: DIFUpdateKind.Replace,
    });
    assertEquals(arrayPtr, ["a", "b", "c"]);
});

Deno.test("array splice external", () => {
    // create mutable ref to array
    const array = ["value1", "value2", 123, "value4"];
    const [arrayPtr, address] = createArrayReference(array);

    runtime._runtime.dif().update(42, address, {
        kind: DIFUpdateKind.ListSplice,
        start: 1,
        delete_count: 2,
        items: [
            runtime.dif.convertJSValueToDIFValueContainer("newValueA"),
            runtime.dif.convertJSValueToDIFValueContainer("newValueB"),
        ],
    });
    assertEquals(arrayPtr, ["value1", "newValueA", "newValueB", "value4"]);

    runtime._runtime.dif().update(42, address, {
        kind: DIFUpdateKind.ListSplice,
        start: 2,
        delete_count: 2,
        items: [],
    });
    assertEquals(arrayPtr, ["value1", "newValueA"]);
});

Deno.test("array set local", () => {
    // create mutable ref to array
    const array = ["a", "b", "c"];
    const [arrayPtr, address] = createArrayReference(array);

    arrayPtr[1] = "localValue";

    assertEquals(getCurrentRuntimeLocalValue(address), [
        "a",
        "localValue",
        "c",
    ]);
});

Deno.test("array set length local", () => {
    // create mutable ref to array
    const array = ["a", "b", "c"];
    const [arrayPtr, address] = createArrayReference(array);

    arrayPtr.length = 5;

    assertEquals(getCurrentRuntimeLocalValue(address), [
        "a",
        "b",
        "c",
        null,
        null,
    ]);
});

Deno.test("array push local", () => {
    // create mutable ref to array
    const array = ["a", "b", "c"];
    const [arrayPtr, address] = createArrayReference(array);

    arrayPtr.push("localValue1", "localValue2");

    assertEquals(getCurrentRuntimeLocalValue(address), [
        "a",
        "b",
        "c",
        "localValue1",
        "localValue2",
    ]);
});

Deno.test("array splice local", () => {
    // create mutable ref to array
    const [arrayPtr, address] = createArrayReference([
        "value1",
        "value2",
        123,
        "value4",
    ]);

    arrayPtr.splice(1, 2, "newValueA", "newValueB");

    assertEquals(getCurrentRuntimeLocalValue(address), [
        "value1",
        "newValueA",
        "newValueB",
        "value4",
    ]);

    arrayPtr.splice(2, 1);

    assertEquals(getCurrentRuntimeLocalValue(address), [
        "value1",
        "newValueA",
        "value4",
    ]);
});

Deno.test("array reverse local", () => {
    // create mutable ref to array
    const [arrayPtr, address] = createArrayReference([
        "value1",
        "value2",
        123,
        "value4",
    ]);

    arrayPtr.reverse();
    assertEquals(getCurrentRuntimeLocalValue(address), [
        "value4",
        123,
        "value2",
        "value1",
    ]);
});

Deno.test("array sort local", () => {
    // create mutable ref to array
    const [arrayPtr, address] = createArrayReference([
        "banana",
        "apple",
        "cherry",
    ]);

    arrayPtr.sort();
    assertEquals(getCurrentRuntimeLocalValue(address), [
        "apple",
        "banana",
        "cherry",
    ]);
});

Deno.test("array pop local", () => {
    // create mutable ref to array
    const [arrayPtr, address] = createArrayReference([
        "value1",
        "value2",
        123,
        "value4",
    ]);

    const popped = arrayPtr.pop();
    assertEquals(popped, "value4");
    assertEquals(getCurrentRuntimeLocalValue(address), [
        "value1",
        "value2",
        123,
    ]);
});

Deno.test("array shift local", () => {
    // create mutable ref to array
    const [arrayPtr, address] = createArrayReference([
        "value1",
        "value2",
        123,
        "value4",
    ]);

    const shifted = arrayPtr.shift();
    assertEquals(shifted, "value1");
    assertEquals(getCurrentRuntimeLocalValue(address), [
        "value2",
        123,
        "value4",
    ]);
});

Deno.test("array unshift local", () => {
    // create mutable ref to array
    const [arrayPtr, address] = createArrayReference([
        "value1",
        "value2",
        123,
        "value4",
    ]);

    arrayPtr.unshift("newValue1", "newValue2");
    assertEquals(getCurrentRuntimeLocalValue(address), [
        "newValue1",
        "newValue2",
        "value1",
        "value2",
        123,
        "value4",
    ]);
});

Deno.test("array fill local", () => {
    // create mutable ref to array
    const [arrayPtr, address] = createArrayReference([
        "value1",
        "value2",
        123,
        "value4",
    ]);

    arrayPtr.fill("filledValue", 1, 6);
    assertEquals(getCurrentRuntimeLocalValue(address), [
        "value1",
        "filledValue",
        "filledValue",
        "filledValue",
    ]);

    arrayPtr.fill("allFilled");
    assertEquals(getCurrentRuntimeLocalValue(address), [
        "allFilled",
        "allFilled",
        "allFilled",
        "allFilled",
    ]);

    arrayPtr.fill("noChange", 0, 0);
    assertEquals(getCurrentRuntimeLocalValue(address), [
        "allFilled",
        "allFilled",
        "allFilled",
        "allFilled",
    ]);

    arrayPtr.fill("excludeLast", 0, -1);
    assertEquals(getCurrentRuntimeLocalValue(address), [
        "excludeLast",
        "excludeLast",
        "excludeLast",
        "allFilled",
    ]);

    arrayPtr.fill("excludeFirst", 1);
    assertEquals(getCurrentRuntimeLocalValue(address), [
        "excludeLast",
        "excludeFirst",
        "excludeFirst",
        "excludeFirst",
    ]);
});
