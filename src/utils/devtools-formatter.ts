import { Endpoint } from "../lib/special-core-types/endpoint.ts";
import { Range } from "../lib/special-core-types/range.ts";
import { Ref } from "../refs/ref.ts";

// @ts-ignore devtoolsFormatters
globalThis.devtoolsFormatters = [
    {
        header(obj: unknown) {
            if (obj instanceof Endpoint) {
                return ["span", { style: "color: #58d452" }, obj.toString()];
            } else if (obj instanceof Ref) {
                return [
                    "span",
                    {},
                    [
                        "span",
                        {},
                        [
                            "span",
                            { style: "color: #1279d5" },
                            "&mut ",
                        ],
                        [
                            "span",
                            {},
                            // TODO: only proof of concept, syntax highlighting does not match JS
                            obj.value,
                        ],
                    ],
                ];
            } else if (obj instanceof Range) {
                return [
                    "span",
                    {},
                    [
                        "span",
                        {},
                        ["span", { style: "color: #d57258" }, `${obj.start}`],
                    ],
                    [
                        "span",
                        {},
                        ["span", {}, `..`],
                    ],
                    [
                        "span",
                        {},
                        ["span", { style: "color: #d57258" }, `${obj.end}`],
                    ],
                ];
            }
            return null; // fall back to default
        },
        hasBody(_: unknown) {
            return false;
        },
        body(_: unknown) {
            return null;
        },
    },
];
