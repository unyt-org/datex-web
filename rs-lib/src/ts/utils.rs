use std::path::{Component, Path, PathBuf};

use swc_common::{
    DUMMY_SP, Span,
    comments::{Comment, CommentKind, Comments, SingleThreadedComments},
};

/// Sanitize a string to be a valid TypeScript identifier by replacing invalid characters with underscores.
pub fn sanitize_ts_identifier(name: &str) -> String {
    let mut output = String::new();
    for (index, character) in name.chars().enumerate() {
        let valid = if index == 0 {
            character == '_'
                || character == '$'
                || character.is_ascii_alphabetic()
        } else {
            character == '_'
                || character == '$'
                || character.is_ascii_alphanumeric()
        };
        if valid {
            output.push(character);
        } else {
            output.push('_');
        }
    }
    if output.is_empty() {
        "_AnonymousType".to_string()
    } else {
        output
    }
}

/// Escape a string for use in JSDoc comments, preventing the comment from being prematurely closed.
pub fn to_jsdoc(docs: &str) -> String {
    let docs = docs.replace("*/", "* /");
    let mut output = String::from("/**\n");
    for line in docs.lines() {
        output.push_str(" *");
        if !line.is_empty() {
            output.push(' ');
            output.push_str(line);
        }
        output.push('\n');
    }
    output.push_str(" */");
    output
}

pub fn rebase_known_type_source(current_file: &Path, source: &str) -> String {
    if !is_relative_module_specifier(source) {
        return source.to_string();
    }
    let current_directory =
        current_file.parent().unwrap_or_else(|| Path::new(""));
    let target = normalize_relative_path(Path::new(source));
    relative_path_from_directory(current_directory, &target)
}

fn is_relative_module_specifier(source: &str) -> bool {
    source == "."
        || source == ".."
        || source.starts_with("./")
        || source.starts_with("../")
}

fn relative_path_from_directory(
    from_directory: &Path,
    to_path: &Path,
) -> String {
    let from = normalize_relative_path(from_directory);
    let to = normalize_relative_path(to_path);

    let from = normal_components(&from);
    let to = normal_components(&to);

    let common_length = from
        .iter()
        .zip(&to)
        .take_while(|(left, right)| left == right)
        .count();

    let mut parts = Vec::new();

    for _ in common_length..from.len() {
        parts.push("..".to_string());
    }

    parts.extend(to.into_iter().skip(common_length));

    let path = parts.join("/");

    if path.is_empty() {
        ".".to_string()
    } else if path.starts_with('.') {
        path
    } else {
        format!("./{path}")
    }
}

fn normalize_relative_path(path: &Path) -> PathBuf {
    let mut components = Vec::<String>::new();

    for component in path.components() {
        match component {
            Component::CurDir => {}

            Component::ParentDir => {
                match components.last().map(String::as_str) {
                    Some("..") | None => {
                        components.push("..".to_string());
                    }

                    Some(_) => {
                        components.pop();
                    }
                }
            }

            Component::Normal(value) => {
                components.push(value.to_string_lossy().into_owned());
            }

            Component::RootDir | Component::Prefix(_) => {
                panic!(
                    "Expected a relative TypeScript module path, got `{}`",
                    path.display(),
                );
            }
        }
    }

    components.into_iter().collect()
}

/// Produce a relative module specifier from one file to another, without the `.ts` extension.
pub fn relative_module_specifier(from_file: &Path, to_file: &Path) -> String {
    let from_directory = from_file.parent().unwrap_or_else(|| Path::new(""));
    relative_path_from_directory(from_directory, to_file)
}

/// Normalize path components to strings, ignoring `.` and `/` components.
pub fn normal_components(path: &Path) -> Vec<String> {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(value) => {
                Some(value.to_string_lossy().into_owned())
            }
            Component::ParentDir => Some("..".to_string()),
            Component::CurDir | Component::RootDir | Component::Prefix(_) => {
                None
            }
        })
        .collect()
}

pub fn add_jsdoc(comments: &SingleThreadedComments, span: Span, docs: &str) {
    let body = docs
        .lines()
        .map(|line| format!("     * {line}"))
        .collect::<Vec<_>>()
        .join("\n");

    comments.add_leading(
        span.lo,
        Comment {
            kind: CommentKind::Block,
            text: format!("*\n{body}\n     ").into(),
            span: DUMMY_SP,
        },
    );
}
