use core::fmt;
use std::{
    collections::HashMap,
    fmt::Display,
    path::{Path, PathBuf},
};

use datex_core::{
    libs::core::type_id::{
        CoreLibBaseTypeId, CoreLibTypeId, CoreLibVariantTypeId,
    },
    types::{
        literal_type_definition::LiteralTypeDefinition,
        shared_container_containing_type::SharedContainerContainingType,
        r#type::Type,
        type_definition::{
            callable::CallableTypeDefinition,
            collection::type_definition::{
                list::ListCollectionTypeDefinition,
                list_slice::ListSliceCollectionTypeDefinition,
                map::MapCollectionTypeDefinition,
            },
            intersection::IntersectionTypeDefinition,
            list::ListTypeDefinition,
            map::MapTypeDefinition,
            range::RangeTypeDefinition,
            tagged_type::TaggedTypeDefinition,
            union::UnionTypeDefinition,
        },
        visitor::TypeFolder,
    },
    values::core_values::integer::typed_integer::TypedInteger,
};
use datex_core::types::entity_type::EntityType;
use datex_core::types::type_definition::impl_type::ImplMarkers;
use swc_common::DUMMY_SP;
use swc_ecma_ast::{TsKeywordType, TsType, TsTypeAliasDecl};

use crate::ts::{
    TsExport,
    ast::{TsAst, TsDeclaration},
    swc::*,
    utils::{rebase_known_type_source, relative_module_specifier},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AliasState {
    Visiting,
    Complete,
}
#[derive(Debug, Clone)]
struct ExportRegistration {
    file: PathBuf,
    docs: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TsTypeFolderError {
    DuplicateExport {
        name: String,
        first_file: PathBuf,
        second_file: PathBuf,
    },
    DuplicateDeclaration {
        name: String,
        file: PathBuf,
    },
    MissingExport {
        name: String,
    },
    KnownTypeConflictsWithExport {
        name: String,
    },
    NoActiveFile {
        referenced_type: String,
    },
    IncompleteAlias {
        name: String,
    },
}

impl Display for TsTypeFolderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DuplicateExport {
                name,
                first_file,
                second_file,
            } => write!(
                f,
                "TypeScript alias `{name}` is exported by both `{}` and `{}`",
                first_file.display(),
                second_file.display(),
            ),
            Self::DuplicateDeclaration { name, file } => write!(
                f,
                "TypeScript alias `{name}` was declared more than once in `{}`",
                file.display(),
            ),
            Self::MissingExport { name } => write!(
                f,
                "TypeScript alias `{name}` is referenced but was not exported",
            ),
            Self::KnownTypeConflictsWithExport { name } => write!(
                f,
                "TypeScript alias `{name}` is both an exported alias and a registered external type",
            ),
            Self::NoActiveFile { referenced_type } => write!(
                f,
                "TypeScript type `{referenced_type}` was referenced without an active output file",
            ),
            Self::IncompleteAlias { name } => write!(
                f,
                "TypeScript alias `{name}` was registered but did not produce a complete declaration",
            ),
        }
    }
}

#[derive(Debug, Default)]
pub struct TsTypeFolder {
    /// Exported alias -> owning file and docs.
    exports: HashMap<String, ExportRegistration>,
    /// Every declared named alias and its current state.
    aliases: HashMap<String, AliasState>,
    /// External type name -> module specifier.
    known_types: HashMap<String, String>,

    current_file: Option<PathBuf>,
    file_stack: Vec<Option<PathBuf>>,
    ast: TsAst,
}

impl TsTypeFolder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register external TypeScript types.
    ///
    /// Only referenced types are imported.
    pub fn with_known_types<I, S>(
        mut self,
        source: impl Into<String>,
        types: I,
    ) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let source = source.into();
        for ty in types {
            self.known_types.insert(ty.into(), source.clone());
        }
        self
    }

    pub fn ast(&self) -> &TsAst {
        &self.ast
    }

    /// Fold all files through this folder instance.
    ///
    /// Registration happens before traversal, so aliases can safely reference
    /// types owned by other generated files.
    pub fn fold_modules<'a, P, I>(
        &mut self,
        modules: I,
    ) -> Result<&TsAst, TsTypeFolderError>
    where
        P: Into<PathBuf>,
        I: IntoIterator<Item = (P, Vec<TsExport<'a>>)>,
    {
        self.reset_generation_state();

        let modules = modules
            .into_iter()
            .map(|(path, exports)| (path.into(), exports))
            .collect::<Vec<_>>();

        for (file, exports) in &modules {
            self.ast.ensure_file(file.clone());

            for export in exports {
                self.register_export(file, export)?;
            }
        }

        // fold through the same graph builder
        for (file, exports) in &modules {
            self.current_file = Some(file.clone());
            for export in exports {
                let definition =
                    datex_core::types::visitor::fold_type(self, &export.ty)?;
                self.ensure_declared(export.name, definition)?;
            }
        }

        self.current_file = None;

        // every registered export must resolve to one declaration
        for name in self.exports.keys() {
            if !matches!(self.aliases.get(name), Some(AliasState::Complete)) {
                return Err(TsTypeFolderError::IncompleteAlias {
                    name: name.clone(),
                });
            }
        }
        Ok(&self.ast)
    }

    /// Reset state to fold an entirely new set of modules with the same folder.
    fn reset_generation_state(&mut self) {
        self.exports.clear();
        self.aliases.clear();
        self.current_file = None;
        self.file_stack.clear();
        self.ast.clear();
    }

    /// Register an exported alias and its owning file.
    fn register_export(
        &mut self,
        file: &Path,
        export: &TsExport<'_>,
    ) -> Result<(), TsTypeFolderError> {
        if self.known_types.contains_key(export.name) {
            return Err(TsTypeFolderError::KnownTypeConflictsWithExport {
                name: export.name.to_string(),
            });
        }
        let registration = ExportRegistration {
            file: file.to_path_buf(),
            docs: export.docs.map(str::to_string),
        };
        if let Some(previous) =
            self.exports.insert(export.name.to_string(), registration)
        {
            return Err(TsTypeFolderError::DuplicateExport {
                name: export.name.to_string(),
                first_file: previous.file,
                second_file: file.to_path_buf(),
            });
        }
        Ok(())
    }

    /// Ensure that an exported alias has a complete declaration in the AST,
    /// otherswise produce it from the provided definition.
    fn ensure_declared(
        &mut self,
        name: &str,
        definition: Box<TsType>,
    ) -> Result<(), TsTypeFolderError> {
        match self.aliases.get(name) {
            Some(AliasState::Complete) => Ok(()),
            Some(AliasState::Visiting) => {
                Err(TsTypeFolderError::IncompleteAlias {
                    name: name.to_string(),
                })
            }
            None => self.complete_alias(name, definition),
        }
    }

    /// Complete an alias declaration and add it to the AST.
    fn complete_alias(
        &mut self,
        name: &str,
        definition: Box<TsType>,
    ) -> Result<(), TsTypeFolderError> {
        let registration =
            self.exports.get(name).cloned().ok_or_else(|| {
                TsTypeFolderError::MissingExport {
                    name: name.to_string(),
                }
            })?;

        self.aliases.insert(name.to_string(), AliasState::Complete);

        let inserted = self.ast.add_declaration(
            &registration.file,
            name.to_string(),
            TsDeclaration {
                docs: registration.docs,
                declaration: TsTypeAliasDecl {
                    span: DUMMY_SP,
                    declare: false,
                    id: ts_ident(name),
                    type_params: None,
                    type_ann: definition,
                },
            },
        );

        if !inserted {
            return Err(TsTypeFolderError::DuplicateDeclaration {
                name: name.to_string(),
                file: registration.file,
            });
        }
        Ok(())
    }

    /// Record a reference to an exported alias, adding an import if necessary.
    fn record_export_reference(
        &mut self,
        name: &str,
    ) -> Result<(), TsTypeFolderError> {
        let target_file = self
            .exports
            .get(name)
            .map(|registration| registration.file.clone())
            .ok_or_else(|| TsTypeFolderError::MissingExport {
                name: name.to_string(),
            })?;
        let current_file = self.current_file.clone().ok_or_else(|| {
            TsTypeFolderError::NoActiveFile {
                referenced_type: name.to_string(),
            }
        })?;
        if current_file != target_file {
            self.ast.add_import(
                &current_file,
                relative_module_specifier(&current_file, &target_file),
                name,
            );
        }
        Ok(())
    }

    /// Produce a reference to an external type, adding an import if necessary.
    fn external_type_reference(
        &mut self,
        name: &str,
        generics: Vec<Box<TsType>>,
    ) -> Result<Box<TsType>, TsTypeFolderError> {
        if let Some(source) = self.known_types.get(name).cloned() {
            let current_file = self.current_file.clone().ok_or_else(|| {
                TsTypeFolderError::NoActiveFile {
                    referenced_type: name.to_string(),
                }
            })?;

            let source = rebase_known_type_source(&current_file, &source);
            self.ast.add_import(&current_file, source, name);
        }

        Ok(ts_type_reference(name, generics))
    }
}

impl TypeFolder for TsTypeFolder {
    type Output = Box<TsType>;
    type Error = TsTypeFolderError;

    fn begin_named_alias(&mut self, name: &str) -> Result<bool, Self::Error> {
        let target_file = self
            .exports
            .get(name)
            .map(|registration| registration.file.clone())
            .ok_or_else(|| TsTypeFolderError::MissingExport {
                name: name.to_string(),
            })?;

        match self.aliases.get(name) {
            Some(_) => Ok(false),
            None => {
                self.aliases.insert(name.to_string(), AliasState::Visiting);
                self.file_stack.push(self.current_file.clone());
                self.current_file = Some(target_file);
                Ok(true)
            }
        }
    }

    fn end_named_alias(
        &mut self,
        name: &str,
        definition: Self::Output,
    ) -> Result<(), Self::Error> {
        let result = self.complete_alias(name, definition);
        self.current_file = self.file_stack.pop().flatten();
        result
    }

    fn fold_named_alias_reference(
        &mut self,
        name: &str,
    ) -> Result<Self::Output, Self::Error> {
        self.record_export_reference(name)?;
        Ok(ts_type_reference(name, vec![]))
    }

    fn fold_literal(
        &mut self,
        literal: &LiteralTypeDefinition,
    ) -> Result<Self::Output, Self::Error> {
        Ok(match literal {
            LiteralTypeDefinition::Text(text) => {
                ts_string_literal(text.0.to_string())
            }
            LiteralTypeDefinition::Integer(integer) => {
                ts_number_literal(integer.as_f64())
            }
            LiteralTypeDefinition::TypedInteger(integer) => match integer {
                TypedInteger::I8(_)
                | TypedInteger::I16(_)
                | TypedInteger::I32(_)
                | TypedInteger::I64(_)
                | TypedInteger::I128(_)
                | TypedInteger::U8(_)
                | TypedInteger::U16(_)
                | TypedInteger::U32(_)
                | TypedInteger::U64(_)
                | TypedInteger::U128(_) => ts_number_literal(integer.as_f64()),
                TypedInteger::IBig(big) => ts_bigint_literal(&big.0),
            },

            LiteralTypeDefinition::Decimal(decimal) => {
                ts_number_literal(decimal.into_f64())
            }
            LiteralTypeDefinition::TypedDecimal(decimal) => {
                ts_number_literal(decimal.as_f64())
            }
            LiteralTypeDefinition::Boolean(boolean) => {
                ts_boolean_literal(boolean)
            }
            LiteralTypeDefinition::Endpoint(endpoint) => self
                .external_type_reference(
                    "Endpoint",
                    vec![ts_string_literal(endpoint.to_string())],
                )?,
        })
    }

    fn fold_list(
        &mut self,
        _source: &ListTypeDefinition,
        elements: Vec<Self::Output>,
    ) -> Result<Self::Output, Self::Error> {
        Ok(ts_array(ts_union(elements)))
    }

    fn fold_map(
        &mut self,
        _source: &MapTypeDefinition,
        entries: Vec<(Self::Output, Self::Output)>,
    ) -> Result<Self::Output, Self::Error> {
        Ok(ts_object_type(entries))
    }

    fn fold_nested(
        &mut self,
        _source: &Type,
        inner: Self::Output,
    ) -> Result<Self::Output, Self::Error> {
        Ok(inner)
    }

    fn fold_union(
        &mut self,
        _source: &UnionTypeDefinition,
        members: Vec<Self::Output>,
    ) -> Result<Self::Output, Self::Error> {
        Ok(ts_union(members))
    }

    fn fold_intersection(
        &mut self,
        _source: &IntersectionTypeDefinition,
        members: Vec<Self::Output>,
    ) -> Result<Self::Output, Self::Error> {
        Ok(ts_intersection(members))
    }

    fn fold_callable(
        &mut self,
        _source: &CallableTypeDefinition,
        parameters: Vec<(Option<String>, Self::Output)>,
        rest_parameter: Option<(Option<String>, Self::Output)>,
        return_type: Option<Self::Output>,
        _yeet_type: Option<Self::Output>, // FIXME
    ) -> Result<Self::Output, Self::Error> {
        let mut parameters = parameters
            .into_iter()
            .enumerate()
            .map(|(index, (name, ty))| {
                ts_function_parameter(
                    name.unwrap_or_else(|| format!("arg{index}")),
                    ty,
                )
            })
            .collect::<Vec<_>>();
        if let Some((name, ty)) = rest_parameter {
            parameters.push(ts_rest_parameter(
                name.unwrap_or_else(|| "rest".to_string()),
                ty,
            ));
        }
        Ok(ts_function_type(
            parameters,
            return_type.unwrap_or_else(ts_void),
        ))
    }

    fn fold_shared_reference(
        &mut self,
        _shared: &SharedContainerContainingType,
    ) -> Result<Self::Output, Self::Error> {
        todo!()
    }

    fn fold_entity_reference(
        &mut self,
        _nominal: &EntityType,
    ) -> Result<Self::Output, Self::Error> {
        Ok(ts_null()) // TODO
    }

    fn fold_core_type(
        &mut self,
        core_type: CoreLibTypeId,
    ) -> Result<Self::Output, Self::Error> {
        match core_type {
            CoreLibTypeId::Base(base) => match base {
                CoreLibBaseTypeId::Boolean => Ok(ts_boolean()),
                CoreLibBaseTypeId::Text => Ok(ts_string()),
                CoreLibBaseTypeId::Integer => Ok(ts_number()),
                CoreLibBaseTypeId::Decimal => Ok(ts_number()),
                CoreLibBaseTypeId::Null => Ok(ts_null()),
                CoreLibBaseTypeId::Endpoint => {
                    self.external_type_reference("Endpoint", vec![])
                }
                CoreLibBaseTypeId::Unit => Ok(ts_void()),
                CoreLibBaseTypeId::Never => Ok(ts_never()),
                CoreLibBaseTypeId::Any => Ok(ts_unknown()),
                CoreLibBaseTypeId::List => Ok(ts_array(ts_unknown())),
                CoreLibBaseTypeId::Map => Ok(ts_type_reference(
                    "Map",
                    vec![ts_unknown(), ts_unknown()],
                )),
                CoreLibBaseTypeId::Callable => Ok(ts_function_type(
                    vec![ts_rest_parameter("args", ts_array(ts_unknown()))],
                    ts_unknown(),
                )),
                CoreLibBaseTypeId::Range => self.external_type_reference(
                    "Range",
                    vec![ts_unknown(), ts_unknown()],
                ),
                CoreLibBaseTypeId::Type => {
                    self.external_type_reference("Type", vec![ts_unknown()])
                }
                CoreLibBaseTypeId::Box => self.external_type_reference("Box", vec![ts_unknown()]),
            },
            CoreLibTypeId::Variant(variant) => match variant {
                CoreLibVariantTypeId::Decimal(_)
                | CoreLibVariantTypeId::Integer(_) => Ok(ts_number()),
            },
        }
    }

    fn fold_tagged_type(
        &mut self,
        source: &TaggedTypeDefinition,
        payload: Option<Self::Output>,
    ) -> Result<Self::Output, Self::Error> {
        let mut generics = vec![ts_string_literal(source.tag.clone())];
        if let Some(payload) = payload {
            generics.push(payload);
        }
        self.external_type_reference("Tagged", generics)
    }

    fn fold_range(
        &mut self,
        source: &RangeTypeDefinition,
        start: Self::Output,
        end: Self::Output,
    ) -> Result<Self::Output, Self::Error> {
        self.external_type_reference("Range", vec![start, end])
    }

    fn fold_impl_markers(
        &mut self,
        impl_markers: &ImplMarkers,
    ) -> Result<Self::Output, Self::Error> {
        todo!()
    }

    fn fold_list_collection(
        &mut self,
        source: &ListCollectionTypeDefinition,
        item: Self::Output,
    ) -> Result<Self::Output, Self::Error> {
        Ok(ts_array(item))
    }

    fn fold_list_slice_collection(
        &mut self,
        source: &ListSliceCollectionTypeDefinition,
        item: Self::Output,
    ) -> Result<Self::Output, Self::Error> {
        let size = source.size;
        self.external_type_reference(
            "ListSlice",
            vec![item, ts_number_literal(size as f64)],
        )
    }

    fn fold_map_collection(
        &mut self,
        source: &MapCollectionTypeDefinition,
        key: Self::Output,
        value: Self::Output,
    ) -> Result<Self::Output, Self::Error> {
        Ok(ts_type_reference("Record", vec![key, value]))
    }
}

#[cfg(test)]
mod tests {
    use crate::ts::{TsExport, TsTypeFolder};
    use datex_core::{
        macros::Datex,
        runtime::cache::shared_references_cache::SharedReferencesCache,
        types::r#type::Type,
    };
    use datex_core::traits::get_datex_type::GetDatexType;
    use dedent::dedent;
    use indexmap::IndexMap;

    /// Helper function to fold a type into a TypeScript AST and convert it to a string.
    fn to_typescript(ty: Type) -> String {
        let mut folder = TsTypeFolder::new();
        let ast = folder
            .fold_modules([(
                "test.ts",
                vec![TsExport {
                    name: "Test",
                    ty,
                    docs: None,
                }],
            )])
            .unwrap();
        ast.files
            .iter()
            .next()
            .map(|(_, file_ast)| file_ast.to_typescript())
            .expect("Expected exactly one file in AST")
    }

    #[test]
    fn simple_types() {
        #[derive(Datex)]
        #[datex(structural)]
        struct Test {
            a: String,
            b: i32,
        }

        assert_eq!(
            to_typescript(Test::datex_type(
                &mut SharedReferencesCache::default()
            )),
            dedent!(
                r#"
                export type Test = {
                    a: string;
                    b: number;
                };
                "#
            )
        );
    }

    #[test]
    fn list_and_map() {
        #[derive(Datex)]
        #[datex(structural)]
        struct Test {
            a: Vec<String>,
            b: IndexMap<String, i32>,
        }

        assert_eq!(
            to_typescript(Test::datex_type(
                &mut SharedReferencesCache::default()
            )),
            dedent!(
                r#"
                export type Test = {
                    a: string[];
                    b: Record<string, number>;
                };
                "#
            )
        );
    }

    #[test]
    fn option() {
        #[derive(Datex)]
        #[datex(structural)]
        struct Test {
            a: Option<String>,
        }

        assert_eq!(
            to_typescript(Test::datex_type(
                &mut SharedReferencesCache::default()
            )),
            dedent!(
                r#"
                export type Test = {
                    a: string | null;
                };
                "#
            )
        );
    }

    #[test]
    fn tagged() {
        #[derive(Datex)]
        #[datex(structural)]
        enum Test {
            A { x: i32 },
            B,
        }

        assert_eq!(
            to_typescript(Test::datex_type(
                &mut SharedReferencesCache::default()
            )),
            dedent!(
                r#"
                export type Test = Tagged<"A", {
                    x: number;
                }> | Tagged<"B">;
                "#
            )
        );
    }
}
