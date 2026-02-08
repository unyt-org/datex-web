import { interceptAccessors } from "datex-web/dif/utils.ts";
import { Option } from "datex-web/utils/option.ts";
import { assertEquals } from "@std/assert/equals";
import { assertThrows } from "@std/assert";

Deno.test("intercept accessor for object", () => {
    const object = { a: 1, b: 2 };

    interceptAccessors(
        object,
        (_key) => {
            return Option.Some(42);
        },
        (_key, _value) => {
            throw new Error("Cannot set property");
        },
    );

    assertEquals(object.a, 42);
    assertEquals(object.b, 42);

    assertThrows(
        () => {
            object.a = 100;
        },
        Error,
        "Cannot set property",
    );
});

Deno.test("intercept accessor for array", () => {
    const array = [1, 2, 3];

    interceptAccessors(
        array,
        (_key) => {
            return Option.Some(42);
        },
        (_key, _value) => {
            throw new Error("Cannot set property");
        },
    );

    assertEquals(array[0], 42);
    assertEquals(array[1], 42);
    assertEquals(array[2], 42);
    array[3] = 4;
    assertEquals(array[3], 4);

    assertThrows(
        () => {
            array[0] = 100;
        },
        Error,
        "Cannot set property",
    );
});

Deno.test("intercept accessor for class instance", () => {
    const Example = class {
        #private = 42;
        publicField = "hello";
        get privateField() {
            return this.#private;
        }
        setPrivateField(value: number) {
            this.#private = value;
        }
    };
    const example = new Example();

    interceptAccessors(
        example,
        (key) => {
            console.log("get", key);
            return Option.None();
        },
        (key, _value) => {
            console.log("set", key);
        },
    );

    example.setPrivateField(100);

    assertEquals(example.publicField, "hello");
    assertEquals(example.privateField, 100);
});
