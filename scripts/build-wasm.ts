import { format } from "@std/fmt/bytes";
import { parseArgs } from "@std/cli/parse-args";
import { dedent } from "@qnighy/dedent";
import { optimizeWasmFile } from "./wasm-opt.ts";

const RUST_FLAGS = ["--cfg=web_sys_unstable_apis", "-Awarnings"];
Deno.env.set("RUSTFLAGS", RUST_FLAGS.join(" "));

const flags = parseArgs(Deno.args, {
    boolean: ["opt"],
    string: ["profile", "features"],
    default: { opt: true, profile: "release", features: "" },
    negatable: ["opt"],
});

const name = "datex_web";
const outDir = "./src/datex-web";
const profile = flags.profile === "release" ? "release" : "debug";

await runCargoBuildCommand({
    profile,
    cargoFlags: flags.features ? ["--features", flags.features] : [],
});

await runWasmBindgen({
    name,
    profile,
    outDir,
})

await generateJsMainFile({
    name,
    outDir,
});

if (flags.opt) {
    await optimizeWasmFile(outDir + `/${name}.wasm`)
}

const wasmFilePath = `${outDir}/${name}.wasm`;
const fileSize = (await Deno.stat(wasmFilePath))!.size;
console.info(`✅ Build complete: (${format(fileSize)})`);


/**
 * Run cargo build with the appropriate flags to build the wasm module, then run wasm-bindgen to generate the JS bindings
 * @param args
 */
async function runCargoBuildCommand(args: {
    profile: "release" | "debug";
    cargoFlags: string[];
}) {
    // first ensure rustup wasm32-unknown-unknown is installed
    try {
        const rustupAddWasm = new Deno.Command("rustup", {
            args: ["target", "add", "wasm32-unknown-unknown"],
        });
        console.log(
            `Ensuring wasm32-unknown-unknown target installed...`,
        );
        const rustupAddWasmOutput = await rustupAddWasm.output();
        if (!rustupAddWasmOutput.success) {
            console.error(`adding wasm32-unknown-unknown target failed`);
            Deno.exit(1);
        }
    }
    catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            console.info(
                `rustup not found. Ensure wasm32-unknown-unknown installed manually.`,
            );
        }
        else {
            throw error;
        }
    }

    const cargoBuildCmd = [
        "build",
        "--lib",
        "--target",
        "wasm32-unknown-unknown",
        ...args.cargoFlags,
    ];

    if (args.profile === "release") {
        cargoBuildCmd.push("--release");
    }

    const cargoBuildProcess = new Deno.Command("cargo", {
        args: cargoBuildCmd,
        env: {
            RUSTFLAGS: Deno.env.get("RUSTFLAGS") ?? "",
        },
    }).spawn();

    const res = await cargoBuildProcess.status;
    if (!res.success) {
        console.error(`❌ Cargo build failed.`);
        Deno.exit(1);
    }
}

async function runWasmBindgen(args: {
    name: string,
    outDir: string;
    profile: "release" | "debug";
}) {
    const wasmBindgenCmd = [
        `target/wasm32-unknown-unknown/${args.profile}/${args.name}.wasm`,
        "--target",
        "bundler",
        "--out-dir",
        args.outDir.toString(),
        "--omit-default-module-path",
    ];

    const wasmBindgenProcess = new Deno.Command("wasm-bindgen", {
        args: wasmBindgenCmd,
    }).spawn();

    const res = await wasmBindgenProcess.status;
    if (!res.success) {
        console.error(`❌ wasm-bindgen failed.`);
        Deno.exit(1);
    }

    // rename x_bg.js to x.internal.js
    const jsBgFilePath = `${args.outDir}/${args.name}_bg.js`;
    const jsInternalFilePath = `${args.outDir}/${args.name}.internal.js`;
    await Deno.rename(jsBgFilePath, jsInternalFilePath);

    // rename x_bg.wasm to x.wasm
    const wasmFilePath = `${args.outDir}/${args.name}_bg.wasm`;
    const wasmDestFilePath = `${args.outDir}/${args.name}.wasm`;
    await Deno.rename(wasmFilePath, wasmDestFilePath);

    // rename x_bg.wasm.d.ts to x.wasm.d.ts
    const dtsFilePath = `${args.outDir}/${args.name}_bg.wasm.d.ts`;
    const dtsDestFilePath = `${args.outDir}/${args.name}.wasm.d.ts`;
    await Deno.rename(dtsFilePath, dtsDestFilePath);
}

async function generateJsMainFile(args: {
    name: string,
    outDir: string;
}) {
    const jsFile = dedent`
        import * as imports from "./${args.name}.internal.js";
        import { runtimeInterface } from "../utils/js-runtime-compat/js-runtime.ts";
        const wasm = (await runtimeInterface.instantiateWebAssembly(
            new URL("${args.name}.wasm", import.meta.url),
            {
                "./${args.name}_bg.js": imports,
            },
        )).instance;
        export * from "./${args.name}.internal.js";
        import { __wbg_set_wasm } from "./${args.name}.internal.js";
        __wbg_set_wasm(wasm.exports);
        wasm.exports.__wbindgen_start();
    `.trimStart();

    const jsFilePath = `${args.outDir}/${args.name}.js`;
    await Deno.writeTextFile(jsFilePath, jsFile);
}