import { Runtime } from "datex/runtime/runtime.ts";
import { assert, assertEquals } from "@std/assert";
import { assertThrows } from "@std/assert/throws";

import { CoreLibTypeId } from "datex/dif/core.ts";
import { assertStrictEquals } from "@std/assert/strict-equals";
import { Endpoint } from "datex/lib/mod.ts";
import {
    type AsSharedMaybeOwned,
    combinePointerAddressWithOwnership,
    SharedContainerMutability,
} from "datex/shared-container/mod.ts";
import {
    type DIFBaseSharedValueContainer,
    DIFSharedContainerOwnership,
    type DIFUpdate,
    type DIFUpdateData,
    DIFUpdateKind,
} from "datex/dif/types/mod.ts";
import type { BaseSharedContainer } from "datex/shared-container/base-shared-container.ts";
import { replace } from "datex/dif/update.ts";
import type { DIFValue } from "datex/dif/types/value.ts";
import { FAKE_TRANSCEIVER_ID, performFakeRemoteUpdate, performFakeRemoteUpdateWithSourceId } from "../lib/utils.ts";
import { OwnedSharedContainer } from "datex/shared-container/owned.ts";
import { integer, u8 } from "datex/dif/helpers/typed-integer.ts";

let runtime: Runtime;
Deno.test.beforeEach(async () => {
    runtime = await Runtime.create({ endpoint: Endpoint.get("@jonas") }, { log_level: "info" });
});

Deno.test("pointer create with observe", () => {
    const ref = runtime.dif.constructSharedValue(
        runtime.dif.convertJSValueToDIFValueContainer("Hello, DATEX!"),
        SharedContainerMutability.Mutable,
    );
    assertEquals(typeof ref, "string");

    const observed: Array<DIFUpdate> = [];
    const observerId = runtime.dif.observeSharedValueBindDirect(ref, (value) => {
        runtime.executeSync('"xy"');
        runtime.dif.unobserveSharedValueBindDirect(ref, observerId);
        observed.push(value);
        // TODO: print error message somewhere (don't throw)
        // throw new Error("Should not be called again");
    }, { relay_own_updates: true });

    runtime.dif.updateSharedValue(
        ref,
        replace(
            runtime.dif.convertJSValueToDIFValueContainer("Hello, Datex 2"),
        ),
    );

    // if not equal, unobservePointer potentially failed
    assertEquals(observed.length, 1);
    assertEquals(observed[0], [runtime.dif._transceiver_id, [], DIFUpdateKind.Replace, "Hello, Datex 2"]);
});

Deno.test("pointer create without observe", () => {
    const ref = runtime.dif.constructSharedValue(
        runtime.dif.convertJSValueToDIFValueContainer("Hello, DATEX!"),
        SharedContainerMutability.Mutable,
    );
    assertEquals(typeof ref, "string");

    const observed: Array<DIFUpdate> = [];
    const observerId = runtime.dif.observeSharedValueBindDirect(ref, (value) => {
        runtime.executeSync("'xy'");
        runtime.dif.unobserveSharedValueBindDirect(ref, observerId);
        observed.push(value);
    });

    runtime.dif.updateSharedValue(ref, replace(runtime.dif.convertJSValueToDIFValueContainer("Hello, Datex 2")));

    // observer should not be called, because relay_own_updates is false and the source is the same as the observer
    assertEquals(observed.length, 0);
});

Deno.test("pointer create primitive", () => {
    runtime.createSharedValueFromJSValue<number, SharedContainerMutability.Immutable>(
        42,
        undefined,
        SharedContainerMutability.Immutable,
    ) satisfies OwnedSharedContainer<number, SharedContainerMutability.Immutable>;

    runtime.createSharedValueFromJSValue(
        42,
        undefined,
        SharedContainerMutability.Mutable,
    ) satisfies OwnedSharedContainer<42, SharedContainerMutability.Mutable>;

    runtime.createSharedValueFromJSValue(
        "hello world",
        undefined,
        SharedContainerMutability.Immutable,
    ) satisfies OwnedSharedContainer<"hello world", SharedContainerMutability.Immutable>;

    runtime.createSharedValueFromJSValue(
        "hello world",
        undefined,
        SharedContainerMutability.Mutable,
    ) satisfies OwnedSharedContainer<"hello world", SharedContainerMutability.Mutable>;

    runtime.createSharedValueFromJSValue(
        true,
        undefined,
        SharedContainerMutability.Immutable,
    ) satisfies OwnedSharedContainer<true, SharedContainerMutability.Immutable>;

    runtime.createSharedValueFromJSValue(
        { x: true } as const,
        undefined,
        SharedContainerMutability.Immutable,
    ) satisfies AsSharedMaybeOwned<{ readonly x: true }, SharedContainerMutability.Immutable>;

    const a = runtime.createSharedValueFromJSValue(
        5,
        undefined,
        SharedContainerMutability.Mutable,
    );
    const b = runtime.createSharedValueFromJSValue(
        { x: a },
        undefined,
        SharedContainerMutability.Mutable,
    ).value;

    if ("x" in b) {
        b.x satisfies OwnedSharedContainer<number, SharedContainerMutability.Mutable>;
        b.x.value = 5;
    }
});

Deno.test("pointer create struct", () => {
    const innerPtr = runtime.createSharedValueFromJSValue(
        3,
        undefined,
        SharedContainerMutability.Mutable,
    );
    const struct = { a: 1.0, b: "text", c: { d: true }, e: { f: innerPtr } };

    // can not assign to ptrObjImmutable.e.f
    const ptrObjImmutable = runtime.createSharedValueFromJSValue(
        struct,
        undefined,
        SharedContainerMutability.Immutable,
    );
    // ptrObjImmutable.e satisfies { readonly f: BaseSharedContainer<number, SharedContainerMutability.Mutable> };

    // cannot create a new reference for the same object
    assertThrows(
        () => {
            runtime.createSharedValueFromJSValue(
                ptrObjImmutable.value,
                undefined,
                SharedContainerMutability.Mutable,
            );
        },
        Error,
        `already bound`,
    );

    // also cannot create a new reference for the original object
    assertThrows(
        () => {
            runtime.createSharedValueFromJSValue(
                struct,
                undefined,
                SharedContainerMutability.Mutable,
            );
        },
        Error,
        `already bound`,
    );

    // TODO:
    // assertThrows(
    //     () => {
    //         // @ts-ignore: Property 'a' is readonly
    //         ptrObjImmutable.a = 2;
    //     },
    //     Error,
    //     `modify`,
    // );
    // assertThrows(
    //     () => {
    //         // @ts-ignore: Property 'x' does not exist
    //         ptrObjImmutable.x = 2;
    //     },
    //     Error,
    //     `modify`,
    // );
    // assertThrows(
    //     () => {
    //         // @ts-ignore assert transparent proxy container
    //         ptrObjImmutable.c.d = false;
    //     },
    //     Error,
    //     `modify`,
    // );
    innerPtr.value = 42;
    assertEquals(innerPtr.value, 42);
    // @ts-ignore assert transparent proxy container
    assertEquals(ptrObjImmutable.value.e.f.value, 42);
    innerPtr.value = 7;
    // @ts-ignore assert transparent proxy container
    assertEquals(ptrObjImmutable.value.e.f.value, 7);
    assertEquals(innerPtr.value, 7);

    // @ts-ignore assert transparent proxy container
    ptrObjImmutable.value.e.f.value = 10;
});

Deno.test("pointer create and resolve", () => {
    const ptr = combinePointerAddressWithOwnership(
        runtime.dif.constructSharedValue(
            runtime.dif.convertJSValueToDIFValueContainer("unyt.org"),
            SharedContainerMutability.Mutable,
        ),
        DIFSharedContainerOwnership.Owned,
    );
    const resolved = runtime.dif.resolveDIFValueContainer(
        { $: ptr },
    ) as BaseSharedContainer<string, SharedContainerMutability.Mutable>;
    assertEquals(resolved.value, "unyt.org");
});

Deno.test("pointer object create and resolve", () => {
    const initialDIFValue: DIFValue = [
        CoreLibTypeId.Map,
        [
            ["a", 123],
            ["b", 456],
        ],
    ];
    const ptr = runtime.dif.constructSharedValue(initialDIFValue, SharedContainerMutability.Mutable);
    const loadedDIFValue = runtime.dif._handle.resolve_pointer_address(
        ptr,
    ) as DIFBaseSharedValueContainer;

    assertEquals(
        loadedDIFValue,
        [
            initialDIFValue,
            SharedContainerMutability.Mutable,
            CoreLibTypeId.Map,
        ],
    );
});

Deno.test("pointer object create and cache", () => {
    const val = { a: 123, b: 456 };
    const valClone = structuredClone(val);
    const ptrObj = runtime.createSharedValueFromJSValue(val);
    assertEquals(
        ptrObj.value,
        valClone,
    );

    const ptrId = runtime.dif.getPointerAddressForValue(ptrObj);
    if (!ptrId) {
        throw new Error("Pointer ID not found for value");
    }

    // check if cache is used when resolving the pointer again
    const loadedObj = runtime.dif.resolvePointerAddress(DIFSharedContainerOwnership.MutableRef, ptrId);
    // identical object reference
    assertStrictEquals(loadedObj.value, ptrObj.value);
});

Deno.test("pointer map create and cache", () => {
    const map = new Map([[1, 2], [3, 4]]);
    const sharedMapContainer = runtime.createSharedValueFromJSValue(map);
    const sharedMap = sharedMapContainer.value;
    assertEquals(sharedMap, map);
    sharedMap.set(5, 6);
    sharedMap satisfies Map<number, number>;
    assertEquals(sharedMap.get(5), 6);

    sharedMap.delete(1);
    assertEquals(sharedMap.has(1), false);
    assertEquals(sharedMap.size, 2);

    const ptrId = runtime.dif.getPointerAddressForValue(sharedMap);
    if (!ptrId) {
        throw new Error("Pointer ID not found for value");
    }

    // check if cache is used when resolving the pointer again
    // FIXME avoid cache for this check
    const loadedMap = runtime.dif.resolvePointerAddress(DIFSharedContainerOwnership.MutableRef, ptrId);

    sharedMap.clear();
    // identical object reference
    assertStrictEquals(loadedMap.value, sharedMap);
});

Deno.test("pointer primitive ref create and cache", () => {
    const val = 123;
    const ptrObj = runtime.createSharedValueFromJSValue(val);
    if (!(ptrObj instanceof OwnedSharedContainer)) {
        throw new Error("Pointer object is not an OwnedSharedContainer");
    }
    assertEquals(ptrObj.value, val);

    const ptrId = ptrObj.pointerAddress;

    // check if cache is used when resolving the pointer again
    const loadedObj = runtime.dif.resolvePointerAddress(DIFSharedContainerOwnership.MutableRef, ptrId);
    // identical primitive value
    assertEquals(loadedObj, ptrObj.deriveImmutableReference());
});

Deno.test("pointer primitive ref update", () => {
    const val = 123;
    const ptrObj = runtime.createSharedValueFromJSValue(val as number);
    if (!(ptrObj instanceof OwnedSharedContainer)) {
        throw new Error("Pointer object is not an OwnedSharedContainer");
    }
    assertEquals(ptrObj.value, val);

    const ptrRef = ptrObj.deriveMutableReference();
    // update the ref value
    ptrRef.value = 456;

    // get value of ptrObj from DATEX execution
    const result = runtime.dif.resolveDIFValueContainer(
        runtime.dif._handle.resolve_pointer_address(ptrObj.pointerAddress)[0],
    );
    assertEquals(result, 456);
});

Deno.test("immutable pointer primitive ref update", () => {
    const val = 123;
    const ptrObj = runtime.createSharedValueFromJSValue(
        val as number,
        undefined,
        SharedContainerMutability.Immutable,
    );
    if (!(ptrObj instanceof OwnedSharedContainer)) {
        throw new Error("Pointer object is not an OwnedSharedContainer");
    }

    assertThrows(
        () => {
            ptrObj.deriveMutableReference() satisfies never;
        },
        Error,
        `Cannot derive a mutable reference from an immutable reference.`,
    );

    // update the ref value
    assertThrows(
        () => {
            // @ts-ignore: try invalid update
            ptrObj.value = 456;
        },
        Error,
        `immutable reference`,
    );
});

Deno.test("pointer primitive ref update and observe", () => {
    const val = 123;
    const ptrObj = runtime.createSharedValueFromJSValue(
        val as number,
    ) as unknown as BaseSharedContainer<number, SharedContainerMutability.Mutable>;
    assertEquals(ptrObj.value, val);

    const observedUpdate: Array<DIFUpdate> = [];
    runtime.dif.observeSharedValueBindDirect(ptrObj.pointerAddress, (update) => {
        observedUpdate.push(update);
    }, { relay_own_updates: true });

    // update the ref value
    ptrObj.value = 456;

    assertEquals(observedUpdate.length, 1);

    // check if the update was observed
    assertEquals(observedUpdate[0], [
        runtime.dif._transceiver_id,
        ...replace(runtime.dif.convertJSValueToDIFValueContainer(456)),
    ]);
});

Deno.test("pointer primitive ref update and observe local", () => {
    const val = 123;
    const ptrObj = runtime.createSharedValueFromJSValue(
        val as number,
    ) as unknown as BaseSharedContainer<number, SharedContainerMutability.Mutable>;
    assertEquals(ptrObj.value, val);

    let observedUpdate: Array<DIFUpdateData> = [];
    const observerId = runtime.dif.observePointer(
        ptrObj.pointerAddress,
        (update) => {
            observedUpdate.push(update);
        },
    );
    // check if observer is registered
    assertEquals(runtime.dif._observers.get(ptrObj.pointerAddress)?.size, 1);
    assert(runtime.dif._observers.get(ptrObj.pointerAddress)?.has(observerId));

    // update the ref value
    ptrObj.value = 456;

    // check if the update was observed
    assertEquals(observedUpdate.length, 1);
    assertEquals(observedUpdate[0], replace(runtime.dif.convertJSValueToDIFValueContainer(456)));

    // unobserve
    runtime.dif.unobservePointer(ptrObj.pointerAddress, observerId);
    // check if observer is unregistered
    assertEquals(
        runtime.dif._observers.get(ptrObj.pointerAddress)?.size,
        undefined,
    );
    assert(
        !runtime.dif._observers.has(ptrObj.pointerAddress),
    );

    // update the ref value again
    observedUpdate = [];
    ptrObj.value = 789;
    // check that no update was observed
    assertEquals(observedUpdate.length, 0);
});

Deno.test("pointer primitive ref remote update and observe bind direct", () => {
    const val = 123;
    const ptrObj = runtime.createSharedValueFromJSValue(
        val as number,
    ) as unknown as BaseSharedContainer<number, SharedContainerMutability.Mutable>;
    assertEquals(ptrObj.value, val);

    const observedUpdate: Array<DIFUpdate> = [];
    runtime.dif.observeSharedValueBindDirect(
        ptrObj.pointerAddress,
        (update) => {
            observedUpdate.push(update);
        },
    );

    // fake a remote update from transceiver 42
    performFakeRemoteUpdate(
        runtime,
        ptrObj.pointerAddress,
        replace(runtime.dif.convertJSValueToDIFValueContainer(456)),
    );
    // check if the update was observed
    assertEquals(observedUpdate.length, 1);
    assertEquals(observedUpdate[0], [
        FAKE_TRANSCEIVER_ID,
        ...replace(runtime.dif.convertJSValueToDIFValueContainer(456)),
    ]);

    assertEquals(ptrObj.value, 456);
});

Deno.test("pointer primitive ref remote update and observe local", () => {
    const val = 123;
    const ptrObj = runtime.createSharedValueFromJSValue(
        val as number,
    ) as unknown as BaseSharedContainer<number, SharedContainerMutability.Mutable>;
    assertEquals(ptrObj.value, val);

    let observedUpdate: Array<DIFUpdateData> = [];
    runtime.dif.observePointer(
        ptrObj.pointerAddress,
        (update) => {
            observedUpdate.push(update);
        },
    );

    // fake a remote update from transceiver 42
    performFakeRemoteUpdate(
        runtime,
        ptrObj.pointerAddress,
        replace(runtime.dif.convertJSValueToDIFValueContainer(456)),
    );

    // check if the update was observed
    assertEquals(observedUpdate.length, 1);
    assertEquals(
        observedUpdate[0],
        replace(runtime.dif.convertJSValueToDIFValueContainer(456)),
    );

    assertEquals(ptrObj.value, 456);

    observedUpdate = [];

    // fake a local update
    performFakeRemoteUpdateWithSourceId(
        runtime,
        ptrObj.pointerAddress,
        replace(runtime.dif.convertJSValueToDIFValueContainer(789)),
        runtime.dif._transceiver_id,
    );

    // local observer should still be triggered
    assertEquals(observedUpdate.length, 1);
    assertEquals(observedUpdate[0], replace(runtime.dif.convertJSValueToDIFValueContainer(789)));

    // local value should not be updated since the update came from own transceiver
    assertEquals(ptrObj.value, 456);
});

Deno.test("observer immutable", () => {
    const ref = runtime.dif.constructSharedValue(
        runtime.dif.convertJSValueToDIFValueContainer("Immutable value"),
        SharedContainerMutability.Immutable,
    );
    assertThrows(
        () => {
            runtime.dif.observeSharedValueBindDirect(ref, (_) => {});
        },
        Error,
        `immutable reference`,
    );
});

Deno.test("pointer observe unobserve", () => {
    const ref = runtime.dif.constructSharedValue(
        runtime.dif.convertJSValueToDIFValueContainer("Hello, DATEX!"),
        SharedContainerMutability.Mutable,
    );
    assertThrows(
        () => {
            runtime.dif.unobserveSharedValueBindDirect(ref, 42);
        },
        Error,
        `not found`,
    );

    const observerId = runtime.dif.observeSharedValueBindDirect(ref, (_value) => {
        runtime.dif.unobserveSharedValueBindDirect(ref, observerId);
    });
    assertEquals(observerId, 0);
    runtime.dif.unobserveSharedValueBindDirect(ref, observerId);
    assertThrows(
        () => {
            runtime.dif.unobserveSharedValueBindDirect(ref, observerId);
        },
        Error,
        `not found`,
    );
});

Deno.test("core text", () => {
    const script = `"Hello, world!"`;
    const result = runtime.dif.executeSyncDIF(script);
    assertEquals(result, "Hello, world!");
});

Deno.test("core integer", () => {
    const script = "42";
    const result = runtime.dif.executeSyncDIF(script);
    assertEquals(result, integer(42));
});

Deno.test("core boolean", () => {
    const script = "true";
    const result = runtime.dif.executeSyncDIF(script);
    assertEquals(result, true);
});

Deno.test("core null", () => {
    const script = "null";
    const result = runtime.dif.executeSyncDIF(script);
    assertEquals(result, null);
});

Deno.test("core integer variants", () => {
    const script = "42u8";
    const result = runtime.dif.executeSyncDIF(script);
    assertEquals(result, u8(42));
});
