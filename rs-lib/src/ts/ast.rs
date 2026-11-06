use std::rc::Rc;
use swc_common::{DUMMY_SP, Span, comments::SingleThreadedComments};
use swc_ecma_ast::{
    Decl, ExportDecl, Module, ModuleItem, Str, TsType, TsTypeAliasDecl,
};

use crate::ts::{swc::ts_ident, utils::to_jsdoc};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
};
use swc_common::{SourceMap, comments::Comments, sync::Lrc};
use swc_ecma_codegen::{Config, Emitter, text_writer::JsWriter};

use swc_ecma_ast::{ImportDecl, ImportNamedSpecifier, ImportSpecifier};

#[derive(Debug, Clone, Default)]
pub struct TsAst {
    pub files: BTreeMap<PathBuf, TsFileAst>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TsImportKind {
    Type,
    Value,
}

#[derive(Debug, Clone, Default)]
pub struct TsFileAst {
    pub imports: BTreeMap<String, BTreeMap<String, TsImportKind>>,
    pub declarations: BTreeMap<String, TsDeclaration>,
    pub declaration_order: Vec<String>,
    pub comments: SingleThreadedComments,
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
        kind: TsImportKind,
    ) {
        let imports =
            &mut self.files.entry(file.to_path_buf()).or_default().imports;
        imports
            .entry(source.into())
            .or_default()
            .entry(name.into())
            .and_modify(|existing| {
                if kind == TsImportKind::Value {
                    *existing = TsImportKind::Value;
                }
            })
            .or_insert(kind);
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
        file.declarations
            .insert(name, TsDeclaration { declaration, docs });
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
                        let is_type_only = names
                            .values()
                            .all(|kind| *kind == TsImportKind::Type);
                        ImportDecl {
                            span: DUMMY_SP,
                            specifiers: names
                                .iter()
                                .map(|(name, kind)| {
                                    ImportSpecifier::Named(
                                        ImportNamedSpecifier {
                                            span: DUMMY_SP,
                                            local: ts_ident(name),
                                            imported: None,
                                            is_type_only: !is_type_only
                                                && *kind == TsImportKind::Type,
                                        },
                                    )
                                })
                                .collect(),
                            src: Box::new(Str {
                                span: DUMMY_SP,
                                value: source.clone().into(),
                                raw: None,
                            }),
                            type_only: is_type_only,
                            with: None,
                            phase: Default::default(),
                        }
                        .into()
                    })
                    .collect(),
                shebang: None,
            };

            sections.push(
                Self::emit_module(&module, &self.comments)
                    .trim_end()
                    .to_string(),
            );
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

            let code = Self::emit_module(&module, &self.comments);
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

    fn emit_module(
        module: &Module,
        comments: &SingleThreadedComments,
    ) -> String {
        let source_map: Rc<SourceMap> = Default::default();
        let mut output = Vec::new();
        let mut emitter = Emitter {
            cfg: Config::default(),
            cm: source_map.clone(),
            comments: Some(comments),
            wr: JsWriter::new(source_map, "\n", &mut output, None),
        };
        emitter
            .emit_module(module)
            .expect("failed to emit TypeScript");
        String::from_utf8(output).expect("emitter produced invalid UTF-8")
    }
}
