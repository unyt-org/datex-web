import { runBuildCommand } from "@deno/wasmbuild";
import { Path } from "@david/path";
import { format } from "@std/fmt/bytes";
import { parseArgs } from "@std/cli/parse-args";
import { dedent } from "@qnighy/dedent";

const RUST_FLAGS = ["--cfg=web_sys_unstable_apis", "-Awarnings"];
const PREVIOUS_RUSTFLAGS = Deno.env.has("RUSTFLAGS")
    ? Deno.env.get("RUSTFLAGS")
    : null;
Deno.env.set("RUSTFLAGS", RUST_FLAGS.join(" "));

const flags = parseArgs(Deno.args, {
    boolean: ["opt", "inline"],
    string: ["profile"],
    default: { "opt": true, "inline": false, "profile": "release" },
    negatable: ["opt"],
});

// const DEFAULT_FLAGS: string[] = flags.profile === "debug"
//     ? ["--features", "debug"]
//     : []; // "--no-default-features"
// FIXME: "debug" feature is currently also enabled for release builds (debug flags must be used until encryption is implemented)
const DEFAULT_FLAGS = ["--features", "debug"];

const NAME = "datex_web";
const outDir = new Path("./src/datex-web");
try {
    await runBuildCommand({
        isOpt: flags.opt,
        outDir,
        profile: flags.profile === "release" ? "release" : "debug",
        kind: "build",
        inline: flags.inline,
        bindingJsFileExt: "js",
        project: "datex-web",
        cargoFlags: DEFAULT_FLAGS,
    });
} catch (e) {
    console.error(`❌ Build failed:`, e);
    Deno.exit(1);
} finally {
    if (PREVIOUS_RUSTFLAGS === null) {
        Deno.env.delete("RUSTFLAGS");
    } else {
        Deno.env.set("RUSTFLAGS", PREVIOUS_RUSTFLAGS ?? "");
    }
}

if (!flags.inline) {
    const jsFile = dedent`
        import * as imports from "./${NAME}.internal.js";
        import { runtimeInterface } from "../utils/js-runtime-compat/js-runtime.ts";
        const wasm = (await runtimeInterface.instantiateWebAssembly(
            new URL("${NAME}.wasm", import.meta.url),
            {
                "./${NAME}.internal.js": imports,
            },
        )).instance;
        export * from "./${NAME}.internal.js";
        import { __wbg_set_wasm } from "./${NAME}.internal.js";
        __wbg_set_wasm(wasm.exports);
        wasm.exports.__wbindgen_start();
`.trimStart();

    await outDir.resolve(`${NAME}.js`).writeText(jsFile);
}
const fileSize = (await outDir.resolve(`${NAME}.wasm`).stat())!.size;
console.info(`✅ Build complete: (${format(fileSize)})`);
