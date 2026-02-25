import { build, emptyDir } from "@deno/dnt";
import { walk } from "@std/fs/walk";

await emptyDir("./npm");

// get version from deno.json
const VERSION: string = await Deno.readTextFile(
    new URL("../deno.json", import.meta.url),
).then(JSON.parse).then((data: { version: string }) => data.version);

await build({
    entryPoints: [
        {
            name: ".",
            path: "./src/mod.ts",
        },
        {
            name: "./default",
            path: "./src/default.ts",
        },
        // interfaces
        {
            name: "./interfaces/websocket-server-base",
            path: "./src/network/interfaces/websocket-server-base.ts",
        },
        {
            name: "./interfaces/websocket-server-deno",
            path: "./src/network/interfaces/websocket-server-deno.ts",
        },
    ],
    outDir: "./npm",
    shims: { deno: false },
    typeCheck: false, // "both",
    scriptModule: false,
    test: false, // TODO: enable, currently fails, see https://github.com/denoland/dnt/issues/249

    package: {
        // package.json properties
        name: "@unyt/datex",
        version: VERSION,
        license: "MIT",
        repository: {
            type: "git",
            url: "git+https://github.com/unyt-org/datex-web.git",
        },
        bugs: {
            url: "https://github.com/unyt-org/datex-web/issues",
        },
    },
    // steps to run after building and before running the tests
    async postBuild() {
        // replace import.meta because dnt-shim-ignore does not work here
        const datexCoreJSInternalPath = new URL(
            "../npm/esm/datex-web/datex_web.js",
            import.meta.url,
        );
        const fileContent = Deno.readTextFileSync(datexCoreJSInternalPath);
        const updatedContent = fileContent.replace(
            `globalThis[Symbol.for("import-meta-ponyfill-esmodule")](import.meta).url`,
            `import.meta.url`,
        );
        Deno.writeTextFileSync(datexCoreJSInternalPath, updatedContent);

        // remove dnt polyfills completely because we don't need them
        // this also enables support for frontend npm module builds like Vite
        // walk all files in ../npm/esm and remove any import of _dnt.polyfills
        const esmDir = new URL("../npm/esm/", import.meta.url);
        const regex = /import ".*_dnt\.polyfills\.js";\n/gm;
        for await (const entry of walk(esmDir)) {
            if (entry.isFile) {
                const content = Deno.readTextFileSync(entry.path);
                if (regex.test(content)) {
                    Deno.writeTextFileSync(
                        entry.path,
                        content.replace(
                            regex,
                            "",
                        ),
                    );
                }
            }
        }
        // delte all _dnt.polyfills.js/_dnt.polyfills.d.ts/_dnt.polyfills.ts_dnt.polyfills.d.ts.map/_dnt.shims.ts files in ../npm
        const npmDir = new URL("../npm/", import.meta.url);
        for await (const entry of walk(npmDir)) {
            if (
                entry.isFile &&
                (entry.name === "_dnt.polyfills.js" ||
                    entry.name === "_dnt.polyfills.d.ts" ||
                    entry.name === "_dnt.polyfills.d.ts.map" ||
                    entry.name === "_dnt.polyfills.ts" ||
                    entry.name === "_dnt.shims.ts")
            ) {
                Deno.removeSync(entry.path);
            }
        }

        Deno.copyFileSync("README.md", "npm/README.md");
        Deno.copyFileSync(
            "src/datex-web/datex_web.wasm",
            "npm/esm/datex-web/datex_web.wasm",
        );

        // replace datex_web with custom version for node that also supports node vite builds for browsers
        Deno.copyFileSync(
            "scripts/datex_web.node.js",
            "npm/esm/datex-web/datex_web.js",
        );
        Deno.copyFileSync(
            "scripts/wasm_url.node.js",
            "npm/esm/datex-web/wasm_url.node.js",
        );

        // currently required for version tests
        Deno.copyFileSync("deno.json", "npm/esm/deno.json");
    },
});
