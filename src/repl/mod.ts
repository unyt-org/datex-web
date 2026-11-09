import type { Runtime } from "../runtime/runtime.ts";
import { Repl as ReplInternal } from "../datex.ts";
import {Endpoint} from "../lib/special-core-types/endpoint.ts";

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
        return this.runtime.valueToString(jsValue);
    }
}

globalThis.Repl = Repl;