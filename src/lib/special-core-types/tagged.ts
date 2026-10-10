export const EMPTY_TAG = Symbol("EMPTY_TAG");

/**
 * A simple wrapper type that allows to associate a string tag with a value.
 * TODO: "enum classes" should extend Tagged class, e.g. class Example extends Tagged<...> but tag->value mapping must be defined somehow in type system
 */
export class Tagged<Tag extends string, const Value = typeof EMPTY_TAG> {
    #tag: Tag;
    #value: Value;

    constructor(
        tag: Tag,
        value: Value = EMPTY_TAG as Value,
    ) {
        this.#tag = tag;
        this.#value = value;
    }

    public get value(): Value {
        return this.#value;
    }

    public set value(newValue: Value) {
        this.#value = newValue;
    }

    public get tag(): Tag {
        return this.#tag;
    }
}

/**
 * Creates a new Tagged instance with the given tag and value.
 */
export function tagged<Tag extends string>(
    tag: Tag,
): Tagged<Tag, typeof EMPTY_TAG>;
export function tagged<Tag extends string, const Value>(
    tag: Tag,
    value: Value,
): Tagged<Tag, Value>;
export function tagged<Tag extends string>(
    tag: Tag,
    value: unknown = EMPTY_TAG,
): Tagged<Tag, never> {
    return new Tagged(tag, value) as Tagged<Tag, never>;
}


/**
 * enum ExampleEnum {
 *     Variant1(number),
 *     Variant2([string, string]),
 *     Variant3,
 * }
 */



type Variant1 = "Variant1" & {[x: symbol]: any};
type Variant2 = "Variant2" & {[x: symbol]: any};
type Variant3 = "Variant3" & {[x: symbol]: any};

class ExampleEnum<T extends Variant1|Variant2|Variant3 = Variant1|Variant2|Variant3> extends Tagged<T, T extends Variant1 ? number : (T extends Variant2 ? [string, string] : typeof EMPTY_TAG)> {
    private constructor(
        tag: Variant1|Variant2|Variant3,
        value: number | [string, string] | typeof EMPTY_TAG,
    ) {
        super(tag as any, value as any);
    }

    public static Variant1(value: number): ExampleEnum<Variant1> {
        return new ExampleEnum("Variant1" as Variant1, value);
    }

    public static Variant2(value: [string, string]): ExampleEnum<Variant2> {
        return new ExampleEnum("Variant2" as Variant2, value);
    }

    public static Variant3(): ExampleEnum<Variant3> {
        return new ExampleEnum("Variant3" as Variant3, EMPTY_TAG);
    }

    public isVariant1(): this is ExampleEnum<Variant1> {
        return this.tag == "Variant1";
    }

    public isVariant2(): this is ExampleEnum<Variant2> {
        return this.tag == "Variant2";
    }

    public isVariant3(): this is ExampleEnum<Variant3> {
        return this.tag == "Variant3";
    }
}

const en = ExampleEnum.Variant1(42);
const en2: ExampleEnum = ExampleEnum.Variant2(["a",".b"]);
const en3 = ExampleEnum.Variant3();

if (en2.isVariant2()) {
    let x = en2.value;
}
if (en2.isVariant1()) {
    let x = en2.value;
}
if (en2.isVariant3()) {
    let x = en2.value;
}