import type { Runtime } from "../runtime/runtime.ts";
import { Repl as ReplInternal } from "../datex.ts";
import {Endpoint} from "../lib/special-core-types/endpoint.ts";
import {tagged} from "../lib/special-core-types/tagged.ts";

export class Repl {
    #repl: ReplInternal;
    constructor(private runtime: Runtime, endpoint?: Endpoint = null, verbose = false) {
        this.#repl = new ReplInternal(runtime._runtime, endpoint?.toString(), verbose);
    }

    public async execute(script: string): Promise<string|undefined> {
        const result = await this.#repl.execute(script);
        if (result === undefined) {
            return undefined as T;
        }
        const jsValue = this.runtime.dif.resolveDIFValueContainer(result);
        return this.runtime.valueToString(jsValue, {
            formatting_options: {
                mode: tagged("Pretty", {
                    indent: 4,
                    indent_type: tagged("Spaces"),
                }),
                json_compat: false,
                colorized: false,
            },
            resolve_slots: false,
        });
    }
}

globalThis.Repl = Repl;