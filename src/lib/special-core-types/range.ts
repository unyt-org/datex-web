/**
 * Represents a range of numbers with a start and end.
 */
export class Range {
    constructor(public start: number, public end: number) {}

    /**
     * Gets the length of the range (end - start).
     */
    get length(): number {
        return this.end - this.start;
    }

    /**
     * Checks if a given value is within the range (inclusive of start, exclusive of end).
     * @param value The number to check.
     * @returns True if the value is within the range, false otherwise.
     */
    public contains(value: number): boolean {
        return value >= this.start && value < this.end;
    }

    /**
     * Turns a string representation of the range in the format
     * @returns The string representation of the range.
     */
    public toString(): string {
        return `${this.start}..${this.end}`;
    }

    get [Symbol.toStringTag](): string {
        return this.toString();
    }
    get [Symbol.toPrimitive](): string {
        return this.toString();
    }
}
