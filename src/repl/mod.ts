import type { Runtime } from "../runtime/runtime.ts";
import { Repl as ReplInternal } from "../datex.ts";
export class Repl {
    #repl: ReplInternal;
    constructor(private runtime: Runtime, verbose = false) {
        this.#repl = new ReplInternal(runtime._runtime, verbose);
    }

    public async execute(script: string): Promise<string> {
        const result = await this.#repl.execute(script);
        const jsValue = this.runtime.dif.resolveDIFValueContainerSync(result);
        return this.runtime.valueToString(jsValue);
    }
}
