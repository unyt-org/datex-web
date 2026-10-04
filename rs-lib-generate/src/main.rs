use datex_web::ts::{
    SharedReferencesCache, TsTypeFolder, resolve_registry_types,
};
use std::{env, fs, path::PathBuf};

const GENERATED_FILE_HEADER: &str = "\
// @generated file -- do not edit
// deno-lint-ignore-file
// deno-fmt-ignore-file

";

fn main() {
    let output_dir = env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("generated"));
    if output_dir.exists() {
        fs::remove_dir_all(&output_dir).unwrap();
    }
    fs::create_dir_all(&output_dir).unwrap();

    let mut folder = TsTypeFolder::new()
        .with_known_types("../../lib/mod.ts", ["Endpoint", "Tagged", "Type"]);
    let memory = &mut SharedReferencesCache::default();
    let resolved = resolve_registry_types(memory, &mut folder);
    if resolved.is_err() {
        eprintln!("Failed to resolve registry types: {:#?}", resolved.err());
        std::process::exit(1);
    }

    let ast = resolved.unwrap();
    for (file, content) in ast
        .files
        .iter()
        .map(|(file, ast)| (file, ast.to_typescript()))
    {
        let destination = output_dir.join(file);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).unwrap();
        }

        fs::write(destination, format!("{GENERATED_FILE_HEADER}{content}"))
            .unwrap();
    }
}
