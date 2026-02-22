/**
 * Mapping of core type names to their unique pointer addresses.
 */
export const CoreTypeAddress = {
    null: "010000",
    type: "020000",
    boolean: "030000",
    callable: "050000",
    endpoint: "070000",
    text: "080000",
    list: "090000",
    unit: "0b0000",
    map: "0c0000",
    never: "0d0000",
    unknown: "0e0000",
    decimal: "2c0100",
    decimal_f32: "2d0100",
    decimal_f64: "2e0100",
    decimal_dbig: "2f0100",
    integer: "640000",
    integer_u8: "650000",
    integer_u16: "660000",
    integer_u32: "670000",
    integer_u64: "680000",
    integer_u128: "690000",
    integer_i8: "6a0000",
    integer_i16: "6b0000",
    integer_i32: "6c0000",
    integer_i64: "6d0000",
    integer_i128: "6e0000",
    integer_ibig: "6f0000",
} as const;
/**
 * Type representing the unique pointer addresses of core types.
 */
export type CoreTypeAddress = typeof CoreTypeAddress[keyof typeof CoreTypeAddress];

/**
 * Mapping of core type address ranges for categorization.
 */
export const CoreTypeAddressRanges = {
    small_unsigned_integers: new Set([
        CoreTypeAddress.integer_u8,
        CoreTypeAddress.integer_u16,
        CoreTypeAddress.integer_u32,
        CoreTypeAddress.integer_u64,
        CoreTypeAddress.integer_u128,
    ]),
    small_signed_integers: new Set([
        CoreTypeAddress.integer_i8,
        CoreTypeAddress.integer_i16,
        CoreTypeAddress.integer_i32,
        CoreTypeAddress.integer_i64,
        CoreTypeAddress.integer_i128,
    ]),
    big_signed_integers: new Set([CoreTypeAddress.integer_ibig]),
    decimals: new Set([
        CoreTypeAddress.decimal,
        CoreTypeAddress.decimal_f32,
        CoreTypeAddress.decimal_f64,
        CoreTypeAddress.decimal_dbig,
    ]),
} as const;
