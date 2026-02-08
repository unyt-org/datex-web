const [type] = Deno.args;

const ghOutput = Deno.env.get("GITHUB_OUTPUT")!;
if (!ghOutput) {
    throw new Error("Can not find GITHUB_OUTPUT environment variable");
}

if (!["major", "minor", "patch"].includes(type)) {
    throw new Error(
        "Invalid version bump type. Use 'major', 'minor', or 'patch'.",
    );
}

const cargoTomlPath = "./rs-lib/Cargo.toml";
const cargoToml = await Deno.readTextFile(cargoTomlPath);

const cargoLockPath = "./Cargo.lock";
const cargoLock = await Deno.readTextFile(cargoLockPath);

const runtimeTsPath = "./src/runtime/runtime.ts";
const runtimeTs = await Deno.readTextFile(runtimeTsPath);

const denoJsonPath = "./deno.json";
const denoJsonText = await Deno.readTextFile(denoJsonPath);
const denoJson = JSON.parse(denoJsonText);

// Extract versions from Cargo.toml and deno.json
const cargoVersionRegex = /version\s*=\s*"(\d+)\.(\d+)\.(\d+)"/;
const denoVersionRegex = /"version":\s*"(\d+\.\d+\.\d+)"/;

const match = cargoVersionRegex.exec(cargoToml);
if (!match) {
    throw new Error("Version not found in Cargo.toml");
}
let [major, minor, patch] = match.slice(1).map(Number);
const cargoVersion = `${major}.${minor}.${patch}`;

const denoVersion = denoJson.version;
if (!denoVersion) {
    throw new Error("Version not found in deno.json");
}

// check if versions match
if (denoVersion !== cargoVersion) {
    throw new Error("Version mismatch between Cargo.toml and deno.json");
}

switch (type) {
    case "major":
        major++;
        minor = 0;
        patch = 0;
        break;
    case "minor":
        minor++;
        patch = 0;
        break;
    case "patch":
        patch++;
        break;
}

const newVersion = `${major}.${minor}.${patch}`;

// update Cargo.toml
const updatedCargoToml = cargoToml.replace(
    cargoVersionRegex,
    `version = "${newVersion}"`,
);
await Deno.writeTextFile(cargoTomlPath, updatedCargoToml);

// update Cargo.lock
const updatedCargoLock = cargoLock.replace(
    new RegExp(`name = "datex-web"\\nversion = "${cargoVersion}"`),
    `name = "datex-web"\nversion = "${newVersion}"`,
);
await Deno.writeTextFile(cargoLockPath, updatedCargoLock);

// update deno.json
const updatedDenoJson = denoJsonText.replace(
    denoVersionRegex,
    `"version": "${newVersion}"`,
);
await Deno.writeTextFile(denoJsonPath, updatedDenoJson);

// update runtime.ts
const updatedRuntimeTs = runtimeTs.replace(
    /const VERSION: string = "(\d+\.\d+\.\d+)";/,
    `const VERSION: string = "${newVersion}";`,
);
await Deno.writeTextFile(runtimeTsPath, updatedRuntimeTs);

// pass new version to the next step
await Deno.writeTextFile(ghOutput, `NEW_VERSION=${newVersion}`, {
    append: true,
});

console.log(`Version updated to ${newVersion}`, ghOutput);
