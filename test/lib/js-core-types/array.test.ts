import { assertEquals } from "@std/assert/equals";
import { Runtime } from "datex/runtime/runtime.ts";

import { Endpoint } from "datex/lib/mod.ts";
import type { SharedContainerMutability } from "datex/shared-container/mod.ts";
import type { SharedRef } from "datex/shared-container/mod.ts";
import { performFakeRemoteUpdate } from "../utils.ts";
import { appendEntry, clear, deleteEntry, DIFPropertyKind, listSplice, replace, setEntry } from "datex/dif/update.ts";

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

Deno.test("array set external", () => {
    // create mutable ref to array
    const array = ["value1", "value2", 123];
    const arrayRef = runtime.createSharedValueFromJSValue(array);

    // TODO: property updates are not yet implemented in DATEX Script
    // runtime.executeSync(`${address}.1 = 'newValue'`);
    // fake a remote update from transceiver 42
    performFakeRemoteUpdate(
        runtime,
        arrayRef.pointerAddress,
        setEntry(
            runtime.dif.createDIFProperty(0, DIFPropertyKind.Index),
            runtime.dif.convertJSValueToDIFValueContainer("newValue"),
        ),
    );
    // get current value of array via dif
    const runtimeCurrentValue = getCurrentRuntimeLocalValue<string[]>(arrayRef.pointerAddress);

    // current runtime value should reflect the update
    assertEquals(runtimeCurrentValue[0], "newValue");
    // the js side value should also be updated
    assertEquals(arrayRef.value[0], "newValue");
});

Deno.test("array append external", () => {
    // create mutable ref to array
    const array = ["value1", "value2", 123];
    const arrayRef = runtime.createSharedValueFromJSValue(array);

    performFakeRemoteUpdate(
        runtime,
        arrayRef.pointerAddress,
        appendEntry(
            runtime.dif.convertJSValueToDIFValueContainer("newValueEnd"),
        ),
    );
    assertEquals(arrayRef.value[3], "newValueEnd");
});

Deno.test("array delete external", () => {
    // create mutable ref to array
    const array = ["value1", "value2", 123];
    const arrayRef = runtime.createSharedValueFromJSValue(array);

    performFakeRemoteUpdate(
        runtime,
        arrayRef.pointerAddress,
        deleteEntry(runtime.dif.createDIFProperty(0, DIFPropertyKind.Index)),
    );
    assertEquals(arrayRef.value, ["value2", 123]);
});

Deno.test("array clear external", () => {
    // create mutable ref to array
    const array = ["value1", "value2", 123];
    const arrayRef = runtime.createSharedValueFromJSValue(array);

    performFakeRemoteUpdate(runtime, arrayRef.pointerAddress, clear());

    assertEquals(arrayRef.value.length, 0);
});

Deno.test("array replace external", () => {
    // create mutable ref to array
    const array = ["value1", "value2", 123];
    const arrayRef = runtime.createSharedValueFromJSValue(array);

    arrayRef.value.push("toBeRemoved");
    performFakeRemoteUpdate(
        runtime,
        arrayRef.pointerAddress,
        replace(runtime.dif.convertJSValueToDIFValueContainer(["a", "b", "c"])),
    );
    assertEquals(arrayRef.value, ["a", "b", "c"] as SharedRef<string[], SharedContainerMutability.Mutable>);
});

Deno.test("array splice external", () => {
    // create mutable ref to array
    const array = ["value1", "value2", 123, "value4"];
    const arrayRef = runtime.createSharedValueFromJSValue(array);

    performFakeRemoteUpdate(
        runtime,
        arrayRef.pointerAddress,
        listSplice(
            1,
            2,
            [
                runtime.dif.convertJSValueToDIFValueContainer("newValueA"),
                runtime.dif.convertJSValueToDIFValueContainer("newValueB"),
            ],
        ),
    );

    assertEquals(
        arrayRef.value,
        ["value1", "newValueA", "newValueB", "value4"] as SharedRef<string[], SharedContainerMutability.Mutable>,
    );

    performFakeRemoteUpdate(runtime, arrayRef.pointerAddress, listSplice(2, 2, []));
    assertEquals(arrayRef.value, ["value1", "newValueA"] as SharedRef<string[], SharedContainerMutability.Mutable>);
});

Deno.test("array set local", () => {
    // create mutable ref to array
    const array = ["a", "b", "c"];
    const arrayRef = runtime.createSharedValueFromJSValue(array);

    arrayRef.value[1] = "localValue";

    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
        "a",
        "localValue",
        "c",
    ]);
});

Deno.test("array set length local", () => {
    // create mutable ref to array
    const array = ["a", "b", "c"];
    const arrayRef = runtime.createSharedValueFromJSValue(array);

    arrayRef.value.length = 5;

    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
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
    const arrayRef = runtime.createSharedValueFromJSValue(array);

    arrayRef.value.push("localValue1", "localValue2");

    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
        "a",
        "b",
        "c",
        "localValue1",
        "localValue2",
    ]);
});

Deno.test("array splice local", () => {
    // create mutable ref to array
    const arrayRef = runtime.createSharedValueFromJSValue([
        "value1",
        "value2",
        123,
        "value4",
    ]);

    arrayRef.value.splice(1, 2, "newValueA", "newValueB");

    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
        "value1",
        "newValueA",
        "newValueB",
        "value4",
    ]);

    arrayRef.value.splice(2, 1);

    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
        "value1",
        "newValueA",
        "value4",
    ]);
});

Deno.test("array reverse local", () => {
    // create mutable ref to array
    const arrayRef = runtime.createSharedValueFromJSValue([
        "value1",
        "value2",
        123,
        "value4",
    ]);

    arrayRef.value.reverse();
    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
        "value4",
        123,
        "value2",
        "value1",
    ]);
});

Deno.test("array sort local", () => {
    // create mutable ref to array
    const arrayRef = runtime.createSharedValueFromJSValue([
        "banana",
        "apple",
        "cherry",
    ]);

    arrayRef.value.sort();
    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
        "apple",
        "banana",
        "cherry",
    ]);
});

Deno.test("array pop local", () => {
    // create mutable ref to array
    const arrayRef = runtime.createSharedValueFromJSValue([
        "value1",
        "value2",
        123,
        "value4",
    ]);

    const popped = arrayRef.value.pop();
    assertEquals(popped, "value4");
    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
        "value1",
        "value2",
        123,
    ]);
});

Deno.test("array shift local", () => {
    // create mutable ref to array
    const arrayRef = runtime.createSharedValueFromJSValue([
        "value1",
        "value2",
        123,
        "value4",
    ]);

    const shifted = arrayRef.value.shift();
    assertEquals(shifted, "value1");
    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
        "value2",
        123,
        "value4",
    ]);
});

Deno.test("array unshift local", () => {
    // create mutable ref to array
    const arrayRef = runtime.createSharedValueFromJSValue([
        "value1",
        "value2",
        123,
        "value4",
    ]);

    arrayRef.value.unshift("newValue1", "newValue2");
    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
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
    const arrayRef = runtime.createSharedValueFromJSValue([
        "value1",
        "value2",
        123,
        "value4",
    ]);

    arrayRef.value.fill("filledValue", 1, 6);
    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
        "value1",
        "filledValue",
        "filledValue",
        "filledValue",
    ]);

    arrayRef.value.fill("allFilled");
    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
        "allFilled",
        "allFilled",
        "allFilled",
        "allFilled",
    ]);

    arrayRef.value.fill("noChange", 0, 0);
    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
        "allFilled",
        "allFilled",
        "allFilled",
        "allFilled",
    ]);

    arrayRef.value.fill("excludeLast", 0, -1);
    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
        "excludeLast",
        "excludeLast",
        "excludeLast",
        "allFilled",
    ]);

    arrayRef.value.fill("excludeFirst", 1);
    assertEquals(getCurrentRuntimeLocalValue(arrayRef.pointerAddress), [
        "excludeLast",
        "excludeFirst",
        "excludeFirst",
        "excludeFirst",
    ]);
});
