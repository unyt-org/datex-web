export const JsLibTypeAddress = {
    undefined: "111111",
} as const;

/**
 * Type representing the unique pointer addresses of js lib types.
 */
export type JsLibTypeAddress = typeof JsLibTypeAddress[keyof typeof JsLibTypeAddress];
