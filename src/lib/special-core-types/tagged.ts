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
