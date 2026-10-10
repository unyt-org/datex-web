use datex_core::values::core_values::boolean::Boolean;
use num_bigint::BigInt as NumBigInt;

use swc_common::DUMMY_SP;
use swc_ecma_ast::{
    BigInt, BindingIdent, Bool, Expr, Ident, Lit, ModuleItem, Number, Pat,
    RestPat, Str, TsArrayType, TsEntityName, TsFnParam, TsFnType,
    TsIntersectionType, TsKeywordType, TsKeywordTypeKind, TsLit, TsLitType,
    TsPropertySignature, TsTupleElement, TsTupleType, TsType, TsTypeAliasDecl,
    TsTypeAnn, TsTypeElement, TsTypeParamInstantiation, TsTypeRef, TsUnionType,
};

use crate::ts::utils::sanitize_ts_identifier;

pub fn ts_ident(name: &str) -> Ident {
    Ident::new_no_ctxt(sanitize_ts_identifier(name).into(), DUMMY_SP)
}

pub fn ts_type_ann(ty: Box<TsType>) -> Box<TsTypeAnn> {
    Box::new(TsTypeAnn {
        span: DUMMY_SP,
        type_ann: ty,
    })
}

pub fn ts_keyword(kind: TsKeywordTypeKind) -> Box<TsType> {
    Box::new(TsType::TsKeywordType(TsKeywordType {
        span: DUMMY_SP,
        kind,
    }))
}
pub fn ts_type_alias(name: &str, definition: Box<TsType>) -> ModuleItem {
    TsTypeAliasDecl {
        span: DUMMY_SP,
        declare: false,
        id: ts_ident(name),
        type_params: None,
        type_ann: definition,
    }
    .into()
}

pub fn ts_unknown() -> Box<TsType> {
    ts_keyword(TsKeywordTypeKind::TsUnknownKeyword)
}

pub fn ts_date() -> Box<TsType> {
    ts_type_reference("Date", vec![])
}

pub fn ts_void() -> Box<TsType> {
    ts_keyword(TsKeywordTypeKind::TsVoidKeyword)
}

pub fn ts_number() -> Box<TsType> {
    ts_keyword(TsKeywordTypeKind::TsNumberKeyword)
}

pub fn ts_string() -> Box<TsType> {
    ts_keyword(TsKeywordTypeKind::TsStringKeyword)
}

pub fn ts_boolean() -> Box<TsType> {
    ts_keyword(TsKeywordTypeKind::TsBooleanKeyword)
}

pub fn ts_null() -> Box<TsType> {
    ts_keyword(TsKeywordTypeKind::TsNullKeyword)
}

pub fn ts_never() -> Box<TsType> {
    ts_keyword(TsKeywordTypeKind::TsNeverKeyword)
}

pub fn ts_array(element: Box<TsType>) -> Box<TsType> {
    Box::new(TsType::TsArrayType(TsArrayType {
        span: DUMMY_SP,
        elem_type: element,
    }))
}

pub fn ts_tuple(elements: Vec<Box<TsType>>) -> Box<TsType> {
    Box::new(TsType::TsTupleType(TsTupleType {
        span: DUMMY_SP,

        elem_types: elements
            .into_iter()
            .map(|ty| TsTupleElement {
                span: DUMMY_SP,
                label: None,
                ty,
            })
            .collect(),
    }))
}

pub fn ts_union(types: Vec<Box<TsType>>) -> Box<TsType> {
    match types.as_slice() {
        [] => ts_never(),
        [only] => only.clone(),
        _ => Box::new(
            TsUnionType {
                span: DUMMY_SP,
                types,
            }
            .into(),
        ),
    }
}

pub fn ts_intersection(types: Vec<Box<TsType>>) -> Box<TsType> {
    match types.as_slice() {
        [] => ts_unknown(),
        [only] => only.clone(),
        _ => Box::new(
            TsIntersectionType {
                span: DUMMY_SP,
                types,
            }
            .into(),
        ),
    }
}

pub fn ts_type_reference(
    name: &str,
    parameters: Vec<Box<TsType>>,
) -> Box<TsType> {
    let type_params = if parameters.is_empty() {
        None
    } else {
        Some(Box::new(TsTypeParamInstantiation {
            span: DUMMY_SP,
            params: parameters,
        }))
    };

    Box::new(TsType::TsTypeRef(TsTypeRef {
        span: DUMMY_SP,
        type_name: TsEntityName::Ident(ts_ident(name)),
        type_params,
    }))
}

pub fn ts_string_literal(value: impl Into<String>) -> Box<TsType> {
    let value = value.into();

    Box::new(TsType::TsLitType(TsLitType {
        span: DUMMY_SP,
        lit: TsLit::Str(Str {
            span: DUMMY_SP,
            value: value.into(),
            raw: None,
        }),
    }))
}

pub fn ts_boolean_literal(value: &Boolean) -> Box<TsType> {
    Box::new(TsType::TsLitType(TsLitType {
        span: DUMMY_SP,
        lit: TsLit::Bool(Bool {
            span: DUMMY_SP,
            value: value.0,
        }),
    }))
}

pub fn ts_number_literal(value: f64) -> Box<TsType> {
    let raw = value.to_string();
    Box::new(TsType::TsLitType(TsLitType {
        span: DUMMY_SP,
        lit: TsLit::Number(Number {
            span: DUMMY_SP,
            value,
            raw: Some(raw.into()),
        }),
    }))
}
pub fn ts_bigint_literal(value: &NumBigInt) -> Box<TsType> {
    let raw = value.to_string();
    Box::new(TsType::TsLitType(TsLitType {
        span: DUMMY_SP,
        lit: TsLit::BigInt(BigInt {
            span: DUMMY_SP,
            value: Box::new(value.clone()),
            raw: Some(raw.into()),
        }),
    }))
}

/// Create a property key from a string. If the string is a valid TypeScript identifier, it will be an identifier,
/// otherwise it will be a string literal (with quotse)
pub fn ts_property_key_from_str(key: &str) -> Box<Expr> {
    if Ident::verify_symbol(&key).is_ok() {
        Box::new(Expr::Ident(Ident::new_no_ctxt(key.into(), DUMMY_SP)))
    } else {
        Box::new(Expr::Lit(Lit::Str(key.into())))
    }
}

pub fn ts_property_key_from_type(key: Box<TsType>) -> Box<Expr> {
    match *key {
        TsType::TsLitType(TsLitType {
            lit: TsLit::Str(value),
            ..
        }) => ts_property_key_from_str(&value.value.to_string_lossy()),

        TsType::TsLitType(TsLitType {
            lit: TsLit::Number(value),
            ..
        }) => Box::new(Expr::Lit(Lit::Num(value))),

        TsType::TsLitType(TsLitType {
            lit: TsLit::Bool(value),
            ..
        }) => Box::new(Expr::Lit(Lit::Bool(value))),

        unsupported => todo!(
            "unsupported TypeScript property key type: {:?}",
            unsupported
        ),
    }
}

pub fn ts_object_type(entries: Vec<(Box<TsType>, Box<TsType>)>) -> Box<TsType> {
    let members = entries
        .into_iter()
        .map(|(key, value)| {
            TsTypeElement::TsPropertySignature(TsPropertySignature {
                span: DUMMY_SP,
                readonly: false,
                key: ts_property_key_from_type(key),
                computed: false,
                optional: false,
                type_ann: Some(ts_type_ann(value)),
            })
        })
        .collect::<Vec<_>>();

    ts_type_literal(members)
}

pub fn ts_string_property(name: &str, ty: Box<TsType>) -> TsTypeElement {
    TsTypeElement::TsPropertySignature(TsPropertySignature {
        span: DUMMY_SP,
        readonly: false,
        key: ts_property_key_from_str(name),
        computed: false,
        optional: false,
        type_ann: Some(ts_type_ann(ty)),
    })
}

pub fn ts_type_literal(members: Vec<TsTypeElement>) -> Box<TsType> {
    Box::new(TsType::TsTypeLit(swc_ecma_ast::TsTypeLit {
        span: DUMMY_SP,
        members,
    }))
}

pub fn ts_function_parameter(
    name: impl Into<String>,
    ty: Box<TsType>,
) -> TsFnParam {
    TsFnParam::Ident(BindingIdent {
        id: ts_ident(&name.into()),
        type_ann: Some(ts_type_ann(ty)),
    })
}

pub fn ts_rest_parameter(
    name: impl Into<String>,
    ty: Box<TsType>,
) -> TsFnParam {
    TsFnParam::Rest(RestPat {
        span: DUMMY_SP,
        dot3_token: DUMMY_SP,
        arg: Box::new(Pat::Ident(BindingIdent {
            id: ts_ident(&name.into()),
            type_ann: None,
        })),
        type_ann: Some(ts_type_ann(ty)),
    })
}

pub fn ts_function_type(
    parameters: Vec<TsFnParam>,
    return_type: Box<TsType>,
) -> Box<TsType> {
    Box::new(
        TsFnType {
            span: DUMMY_SP,
            params: parameters,
            type_params: None,
            type_ann: ts_type_ann(return_type),
        }
        .into(),
    )
}
