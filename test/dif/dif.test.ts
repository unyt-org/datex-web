import { Runtime } from "../../src/runtime/runtime.ts";
import { assert, assertEquals } from "@std/assert";
import { assertThrows } from "@std/assert/throws";
import {
    type DIFReference,
    DIFReferenceMutability,
    type DIFRepresentationValue,
    type DIFUpdate,
    type DIFUpdateData,
    DIFUpdateKind,
} from "../../src/dif/definitions.ts";
import { CoreTypeAddress } from "../../src/dif/core.ts";
import { assertStrictEquals } from "@std/assert/strict-equals";
import { Ref } from "../../src/refs/ref.ts";
import {
    difReferenceToDisplayString,
    difValueContainerToDisplayString,
} from "../../src/dif/display.ts";
import { arrayTypeBinding } from "datex/lib/js-core-types/array.ts";

const runtime = await Runtime.create({ endpoint: "@jonas" });
runtime.dif.type_registry.registerTypeBinding(arrayTypeBinding);

Deno.test("pointer create with observe", () => {
    const ref = runtime.dif.createReferenceFromDIFValue(
        {
            value: "Hello, DATEX!",
        },
        undefined,
        DIFReferenceMutability.Mutable,
    );
    assertEquals(typeof ref, "string");

    let observed: DIFUpdate | null = null;
    const observerId = runtime.dif.observePointerBindDirect(ref, (value) => {
        runtime.executeSync("'xy'");
        runtime.dif.unobserveReferenceBindDirect(ref, observerId);
        observed = value;
        // TODO: print error message somewhere (don't throw)
        throw new Error("Should not be called again");
    }, { relay_own_updates: true });

    runtime.dif.updateReference(ref, {
        value: { value: "Hello, Datex 2" },
        kind: DIFUpdateKind.Replace,
    });

    // if not equal, unobservePointer potentially failed
    assertEquals(observed, {
        source_id: runtime.dif._transceiver_id,
        data: {
            value: { value: "Hello, Datex 2" },
            kind: DIFUpdateKind.Replace,
        },
    });
});

Deno.test("pointer create without observe", () => {
    const ref = runtime.dif.createReferenceFromDIFValue(
        {
            value: "Hello, Datex!",
        },
        undefined,
        DIFReferenceMutability.Mutable,
    );
    assertEquals(typeof ref, "string");

    let observed: DIFUpdate | null = null;
    const observerId = runtime.dif.observePointerBindDirect(ref, (value) => {
        runtime.executeSync("'xy'");
        runtime.dif.unobserveReferenceBindDirect(ref, observerId);
        observed = value;
    });

    runtime.dif.updateReference(ref, {
        value: { value: "Hello, Datex 2" },
        kind: DIFUpdateKind.Replace,
    });

    // observer should not be called, because relay_own_updates is false and the source is the same as the observer
    assertEquals(observed, null);
});

Deno.test("pointer create primitive", () => {
    runtime.createTransparentReference(
        42,
        undefined,
        DIFReferenceMutability.Immutable,
    ) satisfies Ref<42>;

    runtime.createTransparentReference(
        42,
        undefined,
        DIFReferenceMutability.Mutable,
    ) satisfies Ref<number>;

    runtime.createTransparentReference(
        "hello world",
        undefined,
        DIFReferenceMutability.Immutable,
    ) satisfies Ref<"hello world">;

    runtime.createTransparentReference(
        "hello world",
        undefined,
        DIFReferenceMutability.Mutable,
    ) satisfies Ref<string>;

    runtime.createTransparentReference(
        true,
        undefined,
        DIFReferenceMutability.Immutable,
    ) satisfies Ref<true>;

    runtime.createTransparentReference(
        { x: true } as const,
        undefined,
        DIFReferenceMutability.Immutable,
    ) satisfies {
        readonly x: true;
    };

    const a = runtime.createTransparentReference(
        5,
        undefined,
        DIFReferenceMutability.Immutable,
    );
    const b = runtime.createTransparentReference(
        { x: a },
        undefined,
        DIFReferenceMutability.Mutable,
    ) satisfies {
        x: Ref<5>;
    };
    b.x satisfies Ref<5>;
    b.x.value = 5;
});

Deno.test("pointer create struct", () => {
    const innerPtr = runtime.createTransparentReference(
        3,
        undefined,
        // x2: &mut() = x;
        /**
         * type User {
         *   name: string,
         *   private x: string,
         * }
         *
         * type User {
         *   name: string,
         *   // private
         *   hiddenFields:  text,
         *   xx: 1,
         * }
         *
         * user.hiddenFields
         *
         * #[write: "only"]
         * function getUser() -> &mut User {
         *
         * }
         *
         * export() val x: {inner: px record{}} = {
         *   inner: &mut {
         *
         *   }
         * };
         *
         * export() function getWritableUser() -> &mut+write User {
         *
         * }
         *
         *          * export() function getWritableUser() -> &mut User {
         *
         * }
         *
         * #public = {
         *    getWritableUser:
         *    private: {
         *
         *    }
         * }
         *
         * -> User
         * -> readonly User
         */
        DIFReferenceMutability.Mutable,
    );
    const struct = { a: 1.0, b: "text", c: { d: true }, e: { f: innerPtr } };

    // can not assign to ptrObjImmutable.e.f
    const ptrObjImmutable = runtime.createTransparentReference(
        struct,
        undefined,
        DIFReferenceMutability.Immutable,
    );
    ptrObjImmutable.e satisfies { readonly f: Ref<number> };

    // cannot create a new reference for the same object
    assertThrows(
        () => {
            runtime.createTransparentReference(
                ptrObjImmutable,
                undefined,
                DIFReferenceMutability.Mutable,
            );
        },
        Error,
        `already bound`,
    );

    // also cannot create a new reference for the original object
    assertThrows(
        () => {
            runtime.createTransparentReference(
                struct,
                undefined,
                DIFReferenceMutability.Mutable,
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
    //         ptrObjImmutable.c.d = false;
    //     },
    //     Error,
    //     `modify`,
    // );
    innerPtr.value = 42;
    assertEquals(innerPtr.value, 42);
    assertEquals(ptrObjImmutable.e.f.value, 42);
    innerPtr.value = 7;
    assertEquals(ptrObjImmutable.e.f.value, 7);
    assertEquals(innerPtr.value, 7);

    ptrObjImmutable.e.f.value = 10;
});

Deno.test("pointer create and resolve", () => {
    // TODO: reenable, currently panics because async resolution is not yet implemented
    // assertThrows(
    //     () => {
    //         runtime.dif.resolveDIFValueContainerSync<string>("abcdef");
    //     },
    //     Error,
    //     `Invalid`,
    // );

    const ptr = runtime.dif.createReferenceFromDIFValue(
        { value: "unyt.org" },
        undefined,
        DIFReferenceMutability.Mutable,
    );
    const resolved = runtime.dif.resolveDIFValueContainerSync<string>(
        ptr,
    );
    assertEquals(resolved, "unyt.org");
});

Deno.test("pointer object create and resolve", () => {
    const initialDIFValue: DIFRepresentationValue = [
        [{ value: "a" }, { value: 123 }],
        [{ value: "b" }, { value: 456 }],
    ];
    const ptr = runtime.dif.createReferenceFromDIFValue(
        {
            value: initialDIFValue,
        },
        undefined,
        DIFReferenceMutability.Mutable,
    );
    console.log("ptr address", ptr);
    const loadedDIFValue = runtime.dif._handle.resolve_pointer_address_sync(
        ptr,
    );
    console.log("loadedObj", loadedDIFValue);

    assertEquals(
        loadedDIFValue,
        {
            allowed_type: "0c0000",
            mut: DIFReferenceMutability.Mutable,
            value: {
                value: initialDIFValue,
            },
        } satisfies DIFReference,
    );
});

Deno.test("pointer object create and cache", () => {
    const val = { a: 123, b: 456 };
    const ptrObj = runtime.createTransparentReference(val);
    console.log("ptrObj", ptrObj);
    assertEquals(
        ptrObj,
        val,
    );

    const ptrId = runtime.dif.getPointerAddressForValue(ptrObj);
    console.log("ptrId", ptrId);
    if (!ptrId) {
        throw new Error("Pointer ID not found for value");
    }

    // check if cache is used when resolving the pointer again
    const loadedObj = runtime.dif.resolvePointerAddress(ptrId);
    console.log("loadedObj", loadedObj);

    console.log(
        difValueContainerToDisplayString(
            runtime.dif._handle.resolve_pointer_address(ptrId),
        ),
    );

    // identical object reference
    assertStrictEquals(loadedObj, ptrObj);
});

Deno.test("pointer map create and cache", () => {
    const val = new Map([[1, 2], [3, 4]]);
    const ptrMap = runtime.createTransparentReference(val);
    assertEquals(ptrMap, val);
    ptrMap.set(5, 6);
    ptrMap satisfies Map<number, number>;
    assertEquals(ptrMap.get(5), 6);

    ptrMap.delete(1);
    assertEquals(ptrMap.has(1), false);
    assertEquals(ptrMap.size, 2);

    const ptrId = runtime.dif.getPointerAddressForValue(ptrMap);
    if (!ptrId) {
        throw new Error("Pointer ID not found for value");
    }

    // check if cache is used when resolving the pointer again
    // FIXME avoid cache for this check
    const loadedMap = runtime.dif.resolvePointerAddress(ptrId);
    console.log("loadedMap", loadedMap);
    console.log(
        difReferenceToDisplayString(
            runtime.dif._handle.resolve_pointer_address(
                ptrId,
            ) as DIFReference,
        ),
    );

    ptrMap.clear();
    // identical object reference
    assertStrictEquals(loadedMap, ptrMap);
});

Deno.test("pointer primitive ref create and cache", () => {
    const val = 123;
    const ptrObj = runtime.createTransparentReference(val);
    if (!(ptrObj instanceof Ref)) {
        throw new Error("Pointer object is not a Ref");
    }
    console.log("ptrObj", ptrObj);
    assertEquals(ptrObj.value, val);

    const ptrId = ptrObj.pointerAddress;

    // check if cache is used when resolving the pointer again
    const loadedObj = runtime.dif.resolvePointerAddress(ptrId) as number;
    console.log("loadedObj", loadedObj);
    // identical primitive value
    assertStrictEquals(loadedObj, ptrObj);
});

Deno.test("pointer primitive ref update", () => {
    const val = 123;
    const ptrObj = runtime.createTransparentReference(val as number);
    if (!(ptrObj instanceof Ref)) {
        throw new Error("Pointer object is not a Ref");
    }
    assertEquals(ptrObj.value, val);

    // get value of ptrObj from DATEX execution
    let result = runtime.executeSyncWithStringResult(
        "$" + ptrObj.pointerAddress,
    );
    assertEquals(result, "&mut 123f64");

    // update the ref value
    ptrObj.value = 456;

    // get value of ptrObj from DATEX execution
    result = runtime.executeSyncWithStringResult(
        "$" + ptrObj.pointerAddress,
    );
    assertEquals(result, "&mut 456f64");
});

Deno.test("immutable pointer primitive ref update", () => {
    const val = 123;
    const ptrObj = runtime.createTransparentReference(
        val as number,
        undefined,
        DIFReferenceMutability.Immutable,
    );
    if (!(ptrObj instanceof Ref)) {
        throw new Error("Pointer object is not a Ref");
    }
    assertEquals(ptrObj.value, val);

    // get value of ptrObj from DATEX execution
    const result = runtime.executeSyncWithStringResult(
        "$" + ptrObj.pointerAddress,
    );
    assertEquals(result, "&123f64");

    // update the ref value
    assertThrows(
        () => {
            ptrObj.value = 456;
        },
        Error,
        `immutable reference`,
    );
});

Deno.test("immutable pointer primitive ref update", () => {
    const val = 123;
    const ptrObj = runtime.createTransparentReference(
        val as number,
        undefined,
        DIFReferenceMutability.Immutable,
    );
    if (!(ptrObj instanceof Ref)) {
        throw new Error("Pointer object is not a Ref");
    }
    assertEquals(ptrObj.value, val);

    // get value of ptrObj from DATEX execution
    const result = runtime.executeSyncWithStringResult(
        "$" + ptrObj.pointerAddress,
    );
    assertEquals(result, "&123f64");

    // update the ref value
    assertThrows(
        () => {
            ptrObj.value = 456;
        },
        Error,
        `immutable reference`,
    );
});

Deno.test("pointer primitive ref update and observe", () => {
    const val = 123;
    const ptrObj = runtime.createTransparentReference(
        val as number,
    ) as Ref<
        number
    >;
    assertEquals(ptrObj.value, val);

    let observedUpdate: DIFUpdate | null = null;
    runtime.dif.observePointerBindDirect(ptrObj.pointerAddress, (update) => {
        console.log("Observed pointer update:", update);
        observedUpdate = update;
    }, { relay_own_updates: true });

    // update the ref value
    ptrObj.value = 456;

    // check if the update was observed
    assertEquals(observedUpdate, {
        source_id: runtime.dif._transceiver_id,
        data: {
            kind: DIFUpdateKind.Replace,
            value: {
                value: 456,
            },
        },
    });
});

Deno.test("pointer primitive ref update and observe local", () => {
    const val = 123;
    const ptrObj = runtime.createTransparentReference(
        val as number,
    ) as Ref<
        number
    >;
    assertEquals(ptrObj.value, val);

    let observedUpdate: DIFUpdateData | null = null;
    const observerId = runtime.dif.observePointer(
        ptrObj.pointerAddress,
        (update) => {
            console.log("Observed pointer update:", update);
            observedUpdate = update;
        },
    );
    // check if observer is registered
    assertEquals(runtime.dif._observers.get(ptrObj.pointerAddress)?.size, 1);
    assert(runtime.dif._observers.get(ptrObj.pointerAddress)?.has(observerId));

    // update the ref value
    ptrObj.value = 456;

    // check if the update was observed
    assertEquals(observedUpdate, {
        kind: DIFUpdateKind.Replace,
        value: {
            value: 456,
        },
    });

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
    observedUpdate = null;
    ptrObj.value = 789;
    // check that no update was observed
    assertEquals(observedUpdate, null);
});

Deno.test("pointer primitive ref remote update and observe bind direct", () => {
    const val = 123;
    const ptrObj = runtime.createTransparentReference(
        val as number,
    ) as Ref<
        number
    >;
    assertEquals(ptrObj.value, val);

    let observedUpdate: DIFUpdate | null = null;
    runtime.dif.observePointerBindDirect(
        ptrObj.pointerAddress,
        (update) => {
            console.log("Observed pointer update:", update);
            observedUpdate = update;
        },
    );

    // fake a remote update from transceiver 42
    runtime.dif._handle.update(42, ptrObj.pointerAddress, {
        value: { value: 456 },
        kind: DIFUpdateKind.Replace,
    });

    // check if the update was observed
    assertEquals(observedUpdate, {
        source_id: 42,
        data: {
            kind: DIFUpdateKind.Replace,
            value: {
                value: 456,
            },
        },
    });

    assertEquals(ptrObj.value, 456);
});

Deno.test("pointer primitive ref remote update and observe local", () => {
    const val = 123;
    const ptrObj = runtime.createTransparentReference(
        val as number,
    ) as Ref<
        number
    >;
    assertEquals(ptrObj.value, val);

    let observedUpdate: DIFUpdateData | null = null;
    runtime.dif.observePointer(
        ptrObj.pointerAddress,
        (update) => {
            console.log("Observed pointer update:", update);
            observedUpdate = update;
        },
    );

    // fake a remote update from transceiver 42
    runtime.dif._handle.update(42, ptrObj.pointerAddress, {
        value: { value: 456 },
        kind: DIFUpdateKind.Replace,
    });

    // check if the update was observed
    assertEquals(observedUpdate, {
        kind: DIFUpdateKind.Replace,
        value: {
            value: 456,
        },
    });

    assertEquals(ptrObj.value, 456);

    observedUpdate = null;

    // fake a local update
    runtime.dif._handle.update(
        runtime.dif._transceiver_id,
        ptrObj.pointerAddress,
        {
            value: { value: 789 },
            kind: DIFUpdateKind.Replace,
        },
    );

    // local observer should still be triggered
    assertEquals(observedUpdate, {
        kind: DIFUpdateKind.Replace,
        value: {
            value: 789,
        },
    });

    // local value should not be updated since the update came from own transceiver
    assertEquals(ptrObj.value, 456);
});

Deno.test("observer immutable", () => {
    const ref = runtime.dif.createReferenceFromDIFValue(
        { value: "Immutable" },
        undefined,
        DIFReferenceMutability.Immutable,
    );
    assertThrows(
        () => {
            runtime.dif.observePointerBindDirect(ref, (_) => {});
        },
        Error,
        `immutable reference`,
    );
});

Deno.test("pointer observe unobserve", () => {
    const ref = runtime.dif.createReferenceFromDIFValue(
        { value: "42" },
        undefined,
        DIFReferenceMutability.Mutable,
    );
    assertThrows(
        () => {
            runtime.dif.unobserveReferenceBindDirect(ref, 42);
        },
        Error,
        `not found`,
    );

    const observerId = runtime.dif.observePointerBindDirect(ref, (value) => {
        console.log("Observed pointer value:", value);
        runtime.dif.unobserveReferenceBindDirect(ref, observerId);
    });
    assertEquals(observerId, 0);
    runtime.dif.unobserveReferenceBindDirect(ref, observerId);
    assertThrows(
        () => {
            runtime.dif.unobserveReferenceBindDirect(ref, observerId);
        },
        Error,
        `not found`,
    );
});

Deno.test("core text", () => {
    const script = `"Hello, world!"`;
    const result = runtime.dif.executeSyncDIF(script);
    assertEquals(result, { value: "Hello, world!" });
});

Deno.test("core integer", () => {
    const script = "42";
    const result = runtime.dif.executeSyncDIF(script);
    assertEquals(result, {
        type: CoreTypeAddress.integer,
        value: "42",
    });
});

Deno.test("core boolean", () => {
    const script = "true";
    const result = runtime.dif.executeSyncDIF(script);
    assertEquals(result, { value: true });
});

Deno.test("core null", () => {
    const script = "null";
    const result = runtime.dif.executeSyncDIF(script);
    assertEquals(result, { value: null });
});

Deno.test("core integer variants", () => {
    const script = "42u8";
    const result = runtime.dif.executeSyncDIF(script);
    assertEquals(result, {
        value: 42,
        type: CoreTypeAddress.integer_u8,
    });
});
