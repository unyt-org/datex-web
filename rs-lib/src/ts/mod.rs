use std::{collections::BTreeMap, path::PathBuf};

pub use crate::ts::type_folder::TsTypeFolder;
use crate::ts::{ast::TsAst, type_folder::TsTypeFolderError};
pub use datex_core::{
    runtime::cache::shared_references_cache::SharedReferencesCache,
    types::r#type::Type,
    datex_registry::all_datex_type_registrations
};

mod ast;
mod swc;
mod type_folder;
mod utils;

pub struct TsExport<'a> {
    pub ty: Type,
    pub name: &'a str,
    pub docs: Option<&'a str>,
}

pub fn resolve_registry_types<'a>(
    memory: &mut SharedReferencesCache,
    folder: &'a mut TsTypeFolder,
) -> Result<&'a TsAst, TsTypeFolderError> {
    let mut exports_by_file = BTreeMap::<PathBuf, Vec<TsExport<'_>>>::new();

    for registration in all_datex_type_registrations() {
        let metadata = &registration.metadata;

        let namespace = format!("{}.ts", metadata.namespace)
            .split("src/") // FIXME
            .last()
            .unwrap_or(metadata.namespace)
            .to_string();

        exports_by_file
            .entry(namespace.into())
            .or_default()
            .push(TsExport {
                ty: registration.resolve(memory),
                name: metadata.name,
                docs: metadata.docs,
            });
    }

    folder.fold_modules(exports_by_file)
}

#[cfg(test)]
mod tests {
    use crate::ts::{
        TsExport, TsTypeFolder, TsTypeFolderError, resolve_registry_types,
        swc::*,
    };
    use datex_core::{
        datex_proxy::DatexProxyTypes, macros::Datex,
        runtime::cache::shared_references_cache::SharedReferencesCache,
        values::core_values::endpoint::Endpoint,
    };
    use std::collections::{BTreeMap, BTreeSet};

    fn names(values: &[&str]) -> BTreeSet<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }
    fn folder() -> TsTypeFolder {
        TsTypeFolder::new()
            .with_known_types("@datex/core", ["Endpoint", "Tagged"])
    }

    #[derive(Datex, Debug, Clone, PartialEq)]
    #[datex(structural)]
    struct Dependency {
        endpoint: Endpoint,
    }

    #[derive(Datex, Debug, Clone, PartialEq)]
    #[datex(structural)]
    struct Root {
        dependency: Dependency,
    }

    #[test]
    fn external_and_cross_file_imports() {
        let memory = &mut SharedReferencesCache::default();
        let dependency = Dependency::datex_type(memory);
        let root = Root::datex_type(memory);
        let mut folder = folder();
        let ast = folder
            .fold_modules([
                (
                    "dependency.ts",
                    vec![TsExport {
                        ty: dependency,
                        name: "Dependency",
                        docs: None,
                    }],
                ),
                (
                    "root.ts",
                    vec![TsExport {
                        ty: root,
                        name: "Root",
                        docs: None,
                    }],
                ),
            ])
            .unwrap();

        assert_eq!(ast.files.len(), 2);

        let dependency_file = ast.file("dependency.ts").unwrap();
        let root_file = ast.file("root.ts").unwrap();

        assert_eq!(
            dependency_file.imports,
            BTreeMap::from([
                ("@datex/core".to_string(), names(&["Endpoint"]),)
            ]),
        );

        assert_eq!(
            root_file.imports,
            BTreeMap::from([(
                "./dependency".to_string(),
                names(&["Dependency"]),
            )]),
        );

        assert_eq!(
            dependency_file
                .declarations
                .keys()
                .cloned()
                .collect::<BTreeSet<_>>(),
            names(&["Dependency"]),
        );

        assert_eq!(
            root_file
                .declarations
                .keys()
                .cloned()
                .collect::<BTreeSet<_>>(),
            names(&["Root"]),
        );

        let dependency_alias =
            &dependency_file.declarations["Dependency"].declaration;

        assert_eq!(
            dependency_alias.type_ann,
            ts_type_literal(vec![ts_string_property(
                "endpoint",
                ts_type_reference("Endpoint", vec![]),
            ),]),
        );

        let root_alias = &root_file.declarations["Root"].declaration;
        assert_eq!(
            root_alias.type_ann,
            ts_type_literal(vec![ts_string_property(
                "dependency",
                ts_type_reference("Dependency", vec![]),
            ),]),
        );

        let declaration_count = ast
            .files
            .values()
            .map(|file| file.declarations.len())
            .sum::<usize>();

        assert_eq!(declaration_count, 2);
    }

    #[test]
    fn error_missing_export_for_ref() {
        let memory = &mut SharedReferencesCache::default();
        let root = Root::datex_type(memory);
        let mut folder = folder();

        let error = folder
            .fold_modules([(
                "root.ts",
                vec![TsExport {
                    ty: root,
                    name: "Root",
                    docs: None,
                }],
            )])
            .unwrap_err();

        assert_eq!(
            error,
            TsTypeFolderError::MissingExport {
                name: "Dependency".to_string(),
            },
        );
    }

    #[test]
    fn error_double_export() {
        let memory = &mut SharedReferencesCache::default();
        let dependency_a = Dependency::datex_type(memory);
        let dependency_b = Dependency::datex_type(memory);
        let mut folder = folder();
        let error = folder
            .fold_modules([
                (
                    "first.ts",
                    vec![TsExport {
                        ty: dependency_a,
                        name: "Dependency",
                        docs: None,
                    }],
                ),
                (
                    "second.ts",
                    vec![TsExport {
                        ty: dependency_b,
                        name: "Dependency",
                        docs: None,
                    }],
                ),
            ])
            .unwrap_err();
        assert_eq!(
            error,
            TsTypeFolderError::DuplicateExport {
                name: "Dependency".to_string(),
                first_file: "first.ts".into(),
                second_file: "second.ts".into(),
            },
        );
    }

    #[test]
    fn no_unused_import() {
        #[derive(Datex, Debug, Clone, PartialEq)]
        #[datex(structural)]
        struct Plain {
            value: String,
        }

        let memory = &mut SharedReferencesCache::default();
        let plain = Plain::datex_type(memory);
        let mut folder = folder();
        let ast = folder
            .fold_modules([(
                "plain.ts",
                vec![TsExport {
                    ty: plain,
                    name: "Plain",
                    docs: None,
                }],
            )])
            .unwrap();

        let file = ast.file("plain.ts").unwrap();
        assert!(file.imports.is_empty());
        assert_eq!(
            file.declarations.keys().cloned().collect::<BTreeSet<_>>(),
            names(&["Plain"]),
        );
    }

    #[derive(Datex, Debug, Clone, PartialEq)]
    #[datex(structural)]
    #[datex(namespace = "a/b/c")]
    struct Example {
        a: u8,
        b: String,
        c: Endpoint,
    }

    #[derive(Datex, Debug, Clone, PartialEq)]
    #[datex(structural)]
    #[datex(namespace = "a/c")]
    struct WrappedExample {
        inner: Example,
    }

    #[test]
    fn complex_cross_file_import() {
        let memory = &mut SharedReferencesCache::default();
        let example = Example::datex_type(memory);
        let wrapped_example = WrappedExample::datex_type(memory);
        let mut folder = TsTypeFolder::new()
            .with_known_types("@datex/core", ["Endpoint", "Tagged"]);
        let ast = folder
            .fold_modules([
                (
                    "a/b/c.ts",
                    vec![TsExport {
                        ty: example,
                        name: "Example",
                        docs: None,
                    }],
                ),
                (
                    "a/c.ts",
                    vec![TsExport {
                        ty: wrapped_example,
                        name: "WrappedExample",
                        docs: None,
                    }],
                ),
            ])
            .unwrap();

        assert_eq!(ast.files.len(), 2);
        let example_file = ast.file("a/b/c.ts").unwrap();
        let wrapped_file = ast.file("a/c.ts").unwrap();

        assert_eq!(
            example_file.imports,
            BTreeMap::from([(
                "@datex/core".to_string(),
                BTreeSet::from(["Endpoint".to_string()]),
            )]),
        );
        assert_eq!(
            wrapped_file.imports,
            BTreeMap::from([(
                "./b/c".to_string(),
                BTreeSet::from(["Example".to_string()]),
            )]),
        );
        assert_eq!(
            example_file
                .declarations
                .keys()
                .cloned()
                .collect::<BTreeSet<_>>(),
            BTreeSet::from(["Example".to_string()]),
        );
        assert_eq!(
            wrapped_file
                .declarations
                .keys()
                .cloned()
                .collect::<BTreeSet<_>>(),
            BTreeSet::from(["WrappedExample".to_string()]),
        );
        assert_eq!(
            example_file.declarations["Example"].declaration.type_ann,
            ts_type_literal(vec![
                ts_string_property("a", ts_number()),
                ts_string_property("b", ts_string()),
                ts_string_property("c", ts_type_reference("Endpoint", vec![]),),
            ]),
        );
        assert_eq!(
            wrapped_file.declarations["WrappedExample"]
                .declaration
                .type_ann,
            ts_type_literal(vec![ts_string_property(
                "inner",
                ts_type_reference("Example", vec![]),
            )]),
        );
        let declaration_count = ast
            .files
            .values()
            .map(|file| file.declarations.len())
            .sum::<usize>();

        assert_eq!(declaration_count, 2);
    }

    #[test]
    fn print_all() {
        let memory = &mut SharedReferencesCache::default();
        let mut folder = folder();
        let ast = resolve_registry_types(memory, &mut folder).unwrap();

        for (file, content) in ast
            .files
            .iter()
            .map(|(file, ast)| (file, ast.to_typescript()))
        {
            println!("{}\n{}\n", file.display(), content);
        }
    }
}
