import { Endpoint } from "../lib/special-core-types/endpoint.ts";
import { Range } from "../lib/special-core-types/range.ts";
import { BaseSharedContainer } from "../shared-container/mod.ts";
import {EMPTY_TAG, Tagged} from "../lib/special-core-types/tagged.ts";

// @ts-ignore devtoolsFormatters
globalThis.devtoolsFormatters = [
    {
        header(obj: unknown) {
            if (obj instanceof Endpoint) {
                return ["span", { style: "color: #58d452" }, obj.toString()];
            }
            else if (obj instanceof Tagged) {
                const inner = [
                    "span",
                    {},
                    [
                        "span",
                        { style: "color: #1279d5" },
                        "#" + obj.tag + (obj.value == EMPTY_TAG ? "" : " "),
                    ],
                ];
                if (obj.value !== EMPTY_TAG) {
                    inner.push([
                        "span",
                        {},
                        // TODO: only proof of concept, syntax highlighting does not match JS
                        JSON.stringify(obj.value, null, 4),
                    ]);
                }
                return [
                    "span",
                    {},
                    inner
                ]
            }
            else if (obj instanceof BaseSharedContainer) {
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
                            JSON.stringify(obj.value, null, 4),
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
