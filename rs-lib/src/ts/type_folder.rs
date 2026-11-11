use core::fmt;
use std::{
    collections::HashMap,
    fmt::Display,
    num::NonZero,
    path::{Path, PathBuf},
};

use crate::ts::{
    TsExport,
    ast::{TsAst, TsDeclaration, TsImportKind},
    swc::*,
    utils::{add_jsdoc, rebase_known_type_source, relative_module_specifier},
};
use datex_core::{
    libs::core::type_id::{
        CoreLibBaseTypeId, CoreLibTypeId, CoreLibVariantTypeId,
    },
    shared_values::{
        ReferenceMutability, SharedContainerMutability,
        SharedContainerOwnership,
    },
    types::{
        entities::entity_type_definition::EntityTypeDefinition,
        entity_type::EntityType,
        literal_type_definition::LiteralTypeDefinition,
        shared_container_containing_type::SharedContainerContainingType,
        r#type::Type,
        type_definition::{
            callable::CallableTypeDefinition,
            collection::type_definition::{
                ListCollectionTypeDefinition,
                ListSliceCollectionTypeDefinition, MapCollectionTypeDefinition,
                ReceiverTypeDefinition, SenderTypeDefinition,
            },
            impl_type::ImplMarkers,
            intersection::IntersectionTypeDefinition,
            list::ListTypeDefinition,
            map::MapTypeDefinition,
            range::RangeTypeDefinition,
            tagged_type::TaggedTypeDefinition,
            union::UnionTypeDefinition,
        },
        type_definition_with_metadata::TypeMetadata,
        visitor::TypeFolder,
    },
    values::core_values::{
        callable::Callable, integer::typed_integer::TypedInteger,
    },
};
use datex_core::types::type_definition::TypeDefinition;
use datex_core::types::type_definition_with_metadata::TypeDefinitionWithMetadata;
use datex_core::values::core_values::text::Text;
use swc_common::{BytePos, DUMMY_SP, Span};
use swc_ecma_ast::{
    Accessibility, ClassDecl, ClassMember, ClassMethod, Decl, EmptyStmt,
    Function, Ident, IdentName, PropName, TsEntityName, TsKeywordType, TsType,
    TsTypeAliasDecl, TsTypeAnn, TsTypeRef,
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
    UnexpectedDeclaration,
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
            Self::UnexpectedDeclaration => write!(
                f,
                "TypeScript alias was expected to be a type alias declaration, but was not",
            ),
        }
    }
}

#[derive(Debug)]
struct KnownType {
    pub name: String,
    pub kind: TsImportKind,
}
impl KnownType {
    pub fn new(name: impl Into<String>, kind: TsImportKind) -> Self {
        Self {
            name: name.into(),
            kind,
        }
    }
}

#[derive(Debug)]
pub struct TsTypeFolder {
    /// Exported alias -> owning file and docs.
    exports: HashMap<String, ExportRegistration>,
    /// Every declared named alias and its current state.
    aliases: HashMap<String, AliasState>,
    /// External type name -> module specifier.
    known_types: HashMap<String, KnownType>,

    current_file: Option<PathBuf>,
    file_stack: Vec<Option<PathBuf>>,
    ast: TsAst,
    next_span: NonZero<u32>,
}
impl Default for TsTypeFolder {
    fn default() -> Self {
        Self {
            exports: HashMap::default(),
            aliases: HashMap::default(),
            known_types: HashMap::default(),
            current_file: None,
            file_stack: Vec::default(),
            ast: TsAst::default(),
            next_span: NonZero::new(1).unwrap(),
        }
    }
}

impl TsTypeFolder {
    pub fn new() -> Self {
        Self::default()
    }

    fn next_span(&mut self) -> Span {
        let lo = BytePos(self.next_span.get());
        self.next_span = NonZero::new(self.next_span.get() + 1).unwrap();
        Span::new(lo, BytePos(self.next_span.get()))
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
            self.known_types.insert(
                ty.into(),
                KnownType::new(source.clone(), TsImportKind::Type),
            );
        }
        self
    }

    pub fn with_known_imports<I, S>(
        mut self,
        source: impl Into<String>,
        imports: I,
    ) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let source = source.into();
        for import in imports {
            self.known_types.insert(
                import.into(),
                KnownType::new(source.clone(), TsImportKind::Value),
            );
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
                let declaration =
                    datex_core::types::visitor::fold_type(self, &export.ty)?;
                self.ensure_declared(export.name, declaration)?;
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
        declaration: TsTypeOrClassDeclaration,
    ) -> Result<(), TsTypeFolderError> {
        match self.aliases.get(name) {
            Some(AliasState::Complete) => Ok(()),
            Some(AliasState::Visiting) => {
                Err(TsTypeFolderError::IncompleteAlias {
                    name: name.to_string(),
                })
            }
            None => self.complete_alias(name, declaration),
        }
    }

    /// Complete an alias declaration and add it to the AST.
    fn complete_alias(
        &mut self,
        name: &str,
        declaration: TsTypeOrClassDeclaration,
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
            registration.docs,
            declaration.create_declaration(name),
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
                TsImportKind::Type,
            );
        }
        Ok(())
    }

    /// Produce a reference to an external type, adding an import if necessary.
    fn register_external_type_reference(
        &mut self,
        name: &str,
        generics: Vec<TsType>,
    ) -> Result<TsType, TsTypeFolderError> {
        if let Some(known_type) = self.known_types.get(name) {
            let current_file = self.current_file.clone().ok_or_else(|| {
                TsTypeFolderError::NoActiveFile {
                    referenced_type: name.to_string(),
                }
            })?;

            let source =
                rebase_known_type_source(&current_file, &known_type.name);
            self.ast
                .add_import(&current_file, source, name, known_type.kind);
        }

        Ok(ts_type_reference(name, generics))
    }

    fn shared_container_mutability_to_ts(
        &mut self,
        mutability: &SharedContainerMutability,
    ) -> Result<TsType, TsTypeFolderError> {
        self.register_external_type_reference(
            "SharedContainerMutability",
            vec![],
        )?;

        Ok(match mutability {
            SharedContainerMutability::Mutable => ts_property_access_type(
                ts_ident("SharedContainerMutability"),
                "Mutable",
            ),
            SharedContainerMutability::Immutable => ts_property_access_type(
                ts_ident("SharedContainerMutability"),
                "Immutable",
            ),
        })
    }

    fn shared_reference_mutability_to_ts(
        &mut self,
        mutability: &ReferenceMutability,
    ) -> Result<TsType, TsTypeFolderError> {
        self.register_external_type_reference(
            "SharedReferenceMutability",
            vec![],
        )?;

        Ok(match mutability {
            ReferenceMutability::Mutable => ts_property_access_type(
                ts_ident("SharedReferenceMutability"),
                "Mutable",
            ),
            ReferenceMutability::Immutable => ts_property_access_type(
                ts_ident("SharedReferenceMutability"),
                "Immutable",
            ),
        })
    }

    fn callable_to_ts_type(
        &mut self,
        callable: &Callable,
        is_static: bool,
    ) -> Result<ClassMember, TsTypeFolderError> {
        let is_async = true; // FIXME
        let ts_return_type = match &callable.signature.return_type {
            Some(ty) => {
                datex_core::types::visitor::fold_type(self, ty)?.into_ts_type()
            }
            None => ts_void(),
        };
        let method_span = self.next_span();
        if let Some(docs) = callable.docs.as_deref() {
            let file = self.current_file.as_ref().expect("active output file");
            let comments =
                &self.ast.files.get(file).expect("file exists").comments;
            add_jsdoc(comments, method_span, docs);
        }

        let return_type = Some(Box::new(TsTypeAnn {
            // if async, wrap in Promise
            type_ann: Box::new(if is_async {
                ts_type_promise(ts_return_type)
            } else {
                ts_return_type
            }),
            span: Default::default(),
        }));

        return Ok(ClassMember::Method(ClassMethod {
            span: method_span,
            // FIXME: assumes method name always exists (should be the case)
            key: PropName::Ident(
                ts_ident(&callable.name.as_ref().expect("method name exists"))
                    .into(),
            ),
            function: Box::new(Function {
                params: vec![],
                decorators: vec![],
                span: method_span,
                ctxt: Default::default(),
                body: None,
                is_generator: false,
                is_async: false,
                type_params: None,
                return_type,
            }),
            kind: Default::default(),
            is_static,
            accessibility: Some(Accessibility::Public),
            is_abstract: false,
            is_optional: false,
            is_override: false,
        }));
    }
}

#[derive(Debug, Clone)]
pub enum TsTypeOrClassDeclaration {
    TsType(Box<TsType>),
    ClassDecl(ClassDecl),
}

impl TsTypeOrClassDeclaration {
    /// Convert a TsTypeDefinition into a TsType, converting ClassDecls into TsTypeRefs.
    fn into_ts_type(self) -> TsType {
        match self {
            Self::TsType(ty) => *ty,
            Self::ClassDecl(class_decl) => TsType::TsTypeRef(TsTypeRef {
                span: Default::default(),
                type_name: TsEntityName::Ident(Ident {
                    span: Default::default(),
                    ctxt: Default::default(),
                    sym: class_decl.ident.sym.clone(),
                    optional: false,
                }),
                type_params: None,
            }),
        }
    }

    fn vec_into_ts_type(vec: Vec<Self>) -> Vec<TsType> {
        vec.into_iter().map(|def| def.into_ts_type()).collect()
    }

    /// Converts a [TsTypeOrClassDeclaration] into a Decl, creating a TsTypeAliasDecl for TsTypes and returning ClassDecls as-is.
    fn create_declaration(self, name: &str) -> Decl {
        match self {
            Self::TsType(ty) => Decl::TsTypeAlias(Box::new(TsTypeAliasDecl {
                span: DUMMY_SP,
                declare: false,
                id: ts_ident(name),
                type_params: None,
                type_ann: ty,
            })),
            Self::ClassDecl(class_decl) => Decl::Class(class_decl),
        }
    }
}

impl From<Box<TsType>> for TsTypeOrClassDeclaration {
    fn from(ty: Box<TsType>) -> Self {
        Self::TsType(ty)
    }
}
impl From<TsType> for TsTypeOrClassDeclaration {
    fn from(ty: TsType) -> Self {
        Self::TsType(Box::new(ty))
    }
}
impl From<ClassDecl> for TsTypeOrClassDeclaration {
    fn from(class_decl: ClassDecl) -> Self {
        Self::ClassDecl(class_decl)
    }
}

impl TypeFolder for TsTypeFolder {
    type Output = TsTypeOrClassDeclaration;
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
        declaration: Self::Output,
    ) -> Result<(), Self::Error> {
        let result = self.complete_alias(name, declaration);
        self.current_file = self.file_stack.pop().flatten();
        result
    }

    fn fold_named_alias_reference(
        &mut self,
        name: &str,
    ) -> Result<Self::Output, Self::Error> {
        self.record_export_reference(name)?;
        Ok(ts_type_reference(name, vec![]).into())
    }

    fn fold_type_definition_with_metadata(
        &mut self,
        metadata: &TypeMetadata,
        inner: Self::Output,
    ) -> Result<Self::Output, Self::Error> {
        Ok(match metadata {
            TypeMetadata::Shared {
                ownership: SharedContainerOwnership::Owned,
                mutability,
            } => {
                let generics = vec![
                    inner.into_ts_type(),
                    self.shared_container_mutability_to_ts(mutability)?,
                ];
                self.register_external_type_reference(
                    "OwnedSharedContainer",
                    generics,
                )?
                .into()
            }
            TypeMetadata::Shared {
                ownership:
                    SharedContainerOwnership::Referenced(reference_mutability),
                mutability,
            } => {
                let generics = vec![
                    inner.into_ts_type(),
                    self.shared_container_mutability_to_ts(mutability)?,
                    self.shared_reference_mutability_to_ts(
                        reference_mutability,
                    )?,
                ];
                self.register_external_type_reference("SharedRef", generics)?
                    .into()
            }
            _ => inner,
        })
    }

    fn fold_literal(
        &mut self,
        literal: &LiteralTypeDefinition,
    ) -> Result<Self::Output, Self::Error> {
        Ok(match literal {
            LiteralTypeDefinition::Text(text) => {
                ts_string_literal(text.as_string()).into()
            }
            LiteralTypeDefinition::Integer(integer) => {
                ts_number_literal(integer.as_f64()).into()
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
                | TypedInteger::U128(_) => {
                    ts_number_literal(integer.as_f64()).into()
                }
                TypedInteger::IBig(big) => ts_bigint_literal(&big.0).into(),
            },

            LiteralTypeDefinition::Decimal(decimal) => {
                ts_number_literal(decimal.into_f64()).into()
            }
            LiteralTypeDefinition::TypedDecimal(decimal) => {
                ts_number_literal(decimal.as_f64()).into()
            }
            LiteralTypeDefinition::Boolean(boolean) => {
                ts_boolean_literal(boolean).into()
            }
            LiteralTypeDefinition::Endpoint(endpoint) => self
                .register_external_type_reference(
                    "Endpoint",
                    vec![ts_string_literal(endpoint.to_string())],
                )?
                .into(),
        })
    }

    fn fold_list(
        &mut self,
        _source: &ListTypeDefinition,
        elements: Vec<Self::Output>,
    ) -> Result<Self::Output, Self::Error> {
        Ok(
            ts_array(ts_union(TsTypeOrClassDeclaration::vec_into_ts_type(
                elements,
            )))
            .into(),
        )
    }

    fn fold_map(
        &mut self,
        _source: &MapTypeDefinition,
        entries: Vec<(Self::Output, Self::Output)>,
    ) -> Result<Self::Output, Self::Error> {
        Ok(ts_object_type(
            entries
                .into_iter()
                .map(|(k, v)| (k.into_ts_type(), v.into_ts_type()))
                .collect(),
        )
        .into())
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
        Ok(
            ts_union(TsTypeOrClassDeclaration::vec_into_ts_type(members))
                .into(),
        )
    }

    fn fold_intersection(
        &mut self,
        _source: &IntersectionTypeDefinition,
        members: Vec<Self::Output>,
    ) -> Result<Self::Output, Self::Error> {
        Ok(
            ts_intersection(TsTypeOrClassDeclaration::vec_into_ts_type(
                members,
            ))
            .into(),
        )
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
                    ty.into_ts_type(),
                )
            })
            .collect::<Vec<_>>();
        if let Some((name, ty)) = rest_parameter {
            parameters.push(ts_rest_parameter(
                name.unwrap_or_else(|| "rest".to_string()),
                ty.into_ts_type(),
            ));
        }
        Ok(ts_function_type(
            parameters,
            return_type
                .unwrap_or_else(|| ts_void().into())
                .into_ts_type(),
        )
        .into())
    }

    fn fold_shared_reference(
        &mut self,
        _shared: &SharedContainerContainingType,
    ) -> Result<Self::Output, Self::Error> {
        todo!()
    }

    fn fold_entity_reference(
        &mut self,
        entity_type: &EntityType,
    ) -> Result<Self::Output, Self::Error> {
        let definition = entity_type.entity_definition();
        let mut members = Vec::new();

        // if type is map, push class properties
        if let TypeDefinition::Map(map_definition) = definition.definition() {
            for (key, value) in &map_definition.0 {
                if let Type::Definition(TypeDefinitionWithMetadata{definition: TypeDefinition::Literal(LiteralTypeDefinition::Text(text)), ..}) = key {
                    members.push(ClassMember::ClassProp(ts_class_property(
                        text.as_str(),
                        datex_core::types::visitor::fold_type(self, value)?.into_ts_type(),
                        Accessibility::Public,
                    )));
                }
                else {
                    unimplemented!("Map key is not a Text literal, cannot convert to TypeScript class");
                }
            }
        }
        else {
            unimplemented!("EntityTypeDefinition is not a Map type, cannot convert to TypeScript class");
        }

        for entity_impl in definition.impls().iter() {
            for method in entity_impl.methods().iter() {
                members
                    .push(self.callable_to_ts_type(&method.callable, false)?);
            }
            for static_method in entity_impl.static_methods().iter() {
                members.push(self.callable_to_ts_type(&static_method, true)?);
            }
        }

        Ok(ts_class_declaration(definition.name(), members).into())
    }

    fn fold_core_type(
        &mut self,
        core_type: CoreLibTypeId,
    ) -> Result<Self::Output, Self::Error> {
        match core_type {
            CoreLibTypeId::Base(base) => match base {
                CoreLibBaseTypeId::Boolean => Ok(ts_boolean().into()),
                CoreLibBaseTypeId::Text => Ok(ts_string().into()),
                CoreLibBaseTypeId::Integer => Ok(ts_number().into()),
                CoreLibBaseTypeId::Decimal => Ok(ts_number().into()),
                CoreLibBaseTypeId::Null => Ok(ts_null().into()),
                CoreLibBaseTypeId::Endpoint => Ok(self
                    .register_external_type_reference("Endpoint", vec![])?
                    .into()),
                CoreLibBaseTypeId::Unit => Ok(ts_void().into()),
                CoreLibBaseTypeId::Never => Ok(ts_never().into()),
                CoreLibBaseTypeId::Any => Ok(ts_unknown().into()),
                CoreLibBaseTypeId::List => Ok(ts_array(ts_unknown()).into()),
                CoreLibBaseTypeId::Map => Ok(ts_type_reference(
                    "Map",
                    vec![ts_unknown(), ts_unknown()],
                )
                .into()),
                CoreLibBaseTypeId::Callable => Ok(ts_function_type(
                    vec![ts_rest_parameter("args", ts_array(ts_unknown()))],
                    ts_unknown(),
                )
                .into()),
                CoreLibBaseTypeId::Range => Ok(self
                    .register_external_type_reference(
                        "Range",
                        vec![ts_unknown(), ts_unknown()],
                    )?
                    .into()),
                CoreLibBaseTypeId::Type => Ok(self
                    .register_external_type_reference(
                        "Type",
                        vec![ts_unknown()],
                    )?
                    .into()),
                CoreLibBaseTypeId::Box => Ok(self
                    .register_external_type_reference(
                        "Box",
                        vec![ts_unknown()],
                    )?
                    .into()),
                CoreLibBaseTypeId::Instant => Ok(ts_date().into()),
                CoreLibBaseTypeId::EntityTypeDefinition => Ok(self
                    .register_external_type_reference(
                        "__EntityTypeDefinition",
                        vec![],
                    )?
                    .into()),
                CoreLibBaseTypeId::Sender => Ok(self
                    .register_external_type_reference(
                        "WritableStream",
                        vec![ts_unknown()],
                    )?
                    .into()),
                CoreLibBaseTypeId::Receiver => Ok(self
                    .register_external_type_reference(
                        "ReadableStream",
                        vec![ts_unknown()],
                    )?
                    .into()),
            },
            CoreLibTypeId::Variant(variant) => match variant {
                CoreLibVariantTypeId::Decimal(_)
                | CoreLibVariantTypeId::Integer(_) => Ok(ts_number().into()),
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
            generics.push(payload.into_ts_type());
        }
        Ok(self
            .register_external_type_reference("Tagged", generics)?
            .into())
    }

    fn fold_range(
        &mut self,
        source: &RangeTypeDefinition,
        start: Self::Output,
        end: Self::Output,
    ) -> Result<Self::Output, Self::Error> {
        Ok(self
            .register_external_type_reference(
                "Range",
                vec![start.into_ts_type(), end.into_ts_type()],
            )?
            .into())
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
        Ok(ts_array(item.into_ts_type()).into())
    }

    fn fold_list_slice_collection(
        &mut self,
        source: &ListSliceCollectionTypeDefinition,
        item: Self::Output,
    ) -> Result<Self::Output, Self::Error> {
        let size = source.size;
        Ok(self
            .register_external_type_reference(
                "ListSlice",
                vec![item.into_ts_type(), ts_number_literal(size as f64)],
            )?
            .into())
    }

    fn fold_map_collection(
        &mut self,
        source: &MapCollectionTypeDefinition,
        key: Self::Output,
        value: Self::Output,
    ) -> Result<Self::Output, Self::Error> {
        Ok(ts_type_reference(
            "Record",
            vec![key.into_ts_type(), value.into_ts_type()],
        )
        .into())
    }

    fn fold_sender(
        &mut self,
        source: &SenderTypeDefinition,
        item: Self::Output,
    ) -> Result<Self::Output, Self::Error> {
        Ok(self
            .register_external_type_reference(
                "WritableStream",
                vec![item.into_ts_type()],
            )?
            .into())
    }
    fn fold_receiver(
        &mut self,
        source: &ReceiverTypeDefinition,
        item: Self::Output,
    ) -> Result<Self::Output, Self::Error> {
        Ok(self
            .register_external_type_reference(
                "ReadableStream",
                vec![item.into_ts_type()],
            )?
            .into())
    }
}

#[cfg(test)]
mod tests {
    use crate::ts::{TsExport, TsTypeFolder};
    use datex_core::{
        macros::Datex,
        runtime::cache::shared_references_cache::SharedReferencesCache,
        traits::get_datex_type::GetDatexType, types::r#type::Type,
    };
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
