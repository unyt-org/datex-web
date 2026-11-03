use swc_common::DUMMY_SP;
use swc_ecma_ast::{
    Decl, ExportDecl, Module, ModuleItem, Str, TsType, TsTypeAliasDecl,
};
use swc_ecma_codegen::to_code;

use crate::ts::{swc::ts_ident, utils::to_jsdoc};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
};

use swc_ecma_ast::{ImportDecl, ImportNamedSpecifier, ImportSpecifier};

#[derive(Debug, Clone, Default)]
pub struct TsAst {
    pub files: BTreeMap<PathBuf, TsFileAst>,
}

#[derive(Debug, Clone, Default)]
pub struct TsFileAst {
    pub imports: BTreeMap<String, BTreeSet<String>>,
    pub declarations: BTreeMap<String, TsDeclaration>,
    pub declaration_order: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct TsDeclaration {
    pub docs: Option<String>,
    pub declaration: Decl,
}

impl TsAst {
    pub fn file(&self, path: impl AsRef<Path>) -> Option<&TsFileAst> {
        self.files.get(path.as_ref())
    }

    /// Render every generated TypeScript file.
    pub fn to_typescript(&self) -> BTreeMap<PathBuf, String> {
        self.files
            .iter()
            .map(|(path, file)| (path.clone(), file.to_typescript()))
            .collect()
    }

    pub(crate) fn clear(&mut self) {
        self.files.clear();
    }

    pub(crate) fn ensure_file(&mut self, path: PathBuf) {
        self.files.entry(path).or_default();
    }

    pub(crate) fn add_import(
        &mut self,
        file: &Path,
        source: impl Into<String>,
        name: impl Into<String>,
    ) {
        self.files
            .entry(file.to_path_buf())
            .or_default()
            .imports
            .entry(source.into())
            .or_default()
            .insert(name.into());
    }

    /// Returns `false` when the declaration already exists in that file.
    pub(crate) fn add_declaration(
        &mut self,
        file: &Path,
        name: String,
        docs: Option<String>,
        declaration: Decl,
    ) -> bool {
        let file = self.files.entry(file.to_path_buf()).or_default();
        if file.declarations.contains_key(&name) {
            return false;
        }
        file.declaration_order.push(name.clone());
        file.declarations.insert(name, TsDeclaration {
            declaration,
            docs,
        });
        true
    }
}

impl TsFileAst {
    pub fn to_typescript(&self) -> String {
        let mut sections = Vec::new();

        if !self.imports.is_empty() {
            let module = Module {
                span: DUMMY_SP,
                body: self
                    .imports
                    .iter()
                    .map(|(source, names)| {
                        ImportDecl {
                            span: DUMMY_SP,
                            specifiers: names
                                .iter()
                                .map(|name| {
                                    ImportSpecifier::Named(
                                        ImportNamedSpecifier {
                                            span: DUMMY_SP,
                                            local: ts_ident(name),
                                            imported: None,
                                            is_type_only: false,
                                        },
                                    )
                                })
                                .collect(),
                            src: Box::new(Str {
                                span: DUMMY_SP,
                                value: source.clone().into(),
                                raw: None,
                            }),
                            type_only: true,
                            with: None,
                            phase: Default::default(),
                        }
                        .into()
                    })
                    .collect(),
                shebang: None,
            };

            sections.push(to_code(&module).trim_end().to_string());
        }

        for name in &self.declaration_order {
            let declaration = self
                .declarations
                .get(name)
                .expect("declaration order must only contain known aliases");

            let module = Module {
                span: DUMMY_SP,
                body: vec![
                    ExportDecl {
                        span: DUMMY_SP,
                        decl: declaration.declaration.clone(),
                    }
                    .into(),
                ],
                shebang: None,
            };

            let code = to_code(&module);
            let code = code.trim_end();

            sections.push(match declaration.docs.as_deref() {
                Some(docs) if !docs.trim().is_empty() => {
                    format!("{}\n{}", to_jsdoc(docs), code)
                }
                _ => code.to_string(),
            });
        }

        sections.join("\n\n")
    }
}
