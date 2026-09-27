//! DuckDB parses SELECT bodies; the small lexer only reads DDL headers and request boundaries.
use crate::error::{Error, Result};
use duckdb::{Connection, OptionalExt};
use serde_json::{Value, json};
use std::collections::HashSet;

pub(crate) const INPUT: &str = "__wf_current";
pub(crate) const PREVIOUS: &str = "__wf_previous";

pub(crate) fn literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

pub(crate) fn quote(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

#[derive(
    Clone, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize, utoipa::ToSchema,
)]
pub(crate) struct Relation {
    pub schema: String,
    pub name: String,
}
impl Relation {
    pub fn sql(&self) -> String {
        format!("{}.{}", quote(&self.schema), quote(&self.name))
    }
}

struct Token {
    start: usize,
    value: String,
    quoted: bool,
    end: usize,
}
impl Token {
    fn is(&self, word: &str) -> bool {
        !self.quoted && self.value.eq_ignore_ascii_case(word)
    }
}

fn lexical_error(message: &str, preceding: &[Token]) -> Error {
    let mut error = Error::invalid(message);
    error.statement_index = Some(
        preceding
            .split_inclusive(|token| token.is(";"))
            .filter(|part| {
                part.last().is_some_and(|token| token.is(";"))
                    && part.iter().any(|token| !token.is(";"))
            })
            .count(),
    );
    error
}

fn tokens(sql: &str) -> Result<Vec<Token>> {
    let b = sql.as_bytes();
    let mut i = 0;
    let mut out = Vec::new();
    while i < b.len() {
        if b[i].is_ascii_whitespace() {
            i += 1;
            continue;
        }
        if b[i..].starts_with(b"--") {
            while i < b.len() && b[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        if b[i..].starts_with(b"/*") {
            i += 2;
            let mut depth = 1;
            while i < b.len() && depth > 0 {
                if b[i..].starts_with(b"/*") {
                    depth += 1;
                    i += 2;
                } else if b[i..].starts_with(b"*/") {
                    depth -= 1;
                    i += 2;
                } else {
                    i += 1;
                }
            }
            if depth > 0 {
                return Err(lexical_error("Unclosed SQL comment", &out));
            }
            continue;
        }
        let start = i;
        if b[i] == b'\'' || b[i] == b'"' {
            let delimiter = b[i];
            let escaped = delimiter == b'\''
                && out
                    .last()
                    .is_some_and(|t: &Token| t.is("E") && t.end == start);
            i += 1;
            loop {
                if i == b.len() {
                    return Err(lexical_error("Unclosed SQL quote", &out));
                }
                if escaped && b[i] == b'\\' {
                    i = (i + 2).min(b.len());
                    continue;
                }
                if b[i] == delimiter {
                    i += 1;
                    if i < b.len() && b[i] == delimiter {
                        i += 1;
                    } else {
                        break;
                    }
                } else {
                    i += 1;
                }
            }
            let q = char::from(delimiter).to_string();
            out.push(Token {
                start,
                value: sql[start + 1..i - 1].replace(&q.repeat(2), &q),
                quoted: true,
                end: i,
            });
        } else if b[i] == b'$' && dollar_tag(&sql[i..]).is_some() {
            let tag =
                dollar_tag(&sql[i..]).ok_or_else(|| lexical_error("Invalid dollar quote", &out))?;
            i += tag.len();
            let end = sql[i..]
                .find(tag)
                .ok_or_else(|| lexical_error("Unclosed dollar quote", &out))?;
            i += end + tag.len();
            out.push(Token {
                start,
                value: sql[start..i].to_owned(),
                quoted: true,
                end: i,
            });
        } else if b"();,.".contains(&b[i]) {
            i += 1;
            out.push(Token {
                start,
                value: sql[start..i].to_owned(),
                quoted: false,
                end: i,
            });
        } else {
            i += 1;
            while i < b.len()
                && !b[i].is_ascii_whitespace()
                && !b"();,.'\"".contains(&b[i])
                && !b[i..].starts_with(b"--")
                && !b[i..].starts_with(b"/*")
            {
                i += 1;
            }
            out.push(Token {
                start,
                value: sql[start..i].to_owned(),
                quoted: false,
                end: i,
            });
        }
    }
    Ok(out)
}
fn dollar_tag(sql: &str) -> Option<&str> {
    let end = sql.get(1..)?.find('$')? + 1;
    let inner = &sql[1..end];
    if inner
        .bytes()
        .all(|c| c.is_ascii_alphanumeric() || c == b'_')
    {
        Some(&sql[..=end])
    } else {
        None
    }
}

/// Split only statement boundaries, retaining the original SQL and its quoting/comments.
pub(crate) fn split_script(sql: &str) -> Result<Vec<String>> {
    let mut statements = Vec::new();
    let mut start = 0;
    let mut has_statement = false;
    for token in tokens(sql)? {
        if token.is(";") {
            if has_statement {
                statements.push(sql[start..token.end].to_owned());
            }
            start = token.end;
            has_statement = false;
        } else {
            has_statement = true;
        }
    }
    if has_statement {
        statements.push(sql[start..].to_owned());
    }
    Ok(statements)
}

/// Validate the whole batch before prepare can execute intermediate statements.
/// Request-local state is allowed; transaction ownership and shared settings stay with the host.
pub(crate) fn validate_statement(sql: &str) -> Result<()> {
    let t = tokens(sql)?;
    let first = t
        .first()
        .ok_or_else(|| Error::invalid("Empty SQL statement"))?;
    if t.iter()
        .enumerate()
        .any(|(i, token)| token.is(";") && i + 1 != t.len())
    {
        return Err(Error::invalid(
            "Each batch entry must contain exactly one statement",
        ));
    }
    if (first.is("SET") || first.is("RESET"))
        && !t
            .get(1)
            .is_some_and(|scope| scope.is("VARIABLE") || scope.is("SESSION"))
    {
        return Err(Error::invalid(
            "Use explicit SESSION or VARIABLE scope; shared settings belong to the project runtime",
        ));
    }
    if [
        "BEGIN",
        "START",
        "COMMIT",
        "END",
        "ROLLBACK",
        "ABORT",
        "SAVEPOINT",
        "RELEASE",
        "PREPARE",
        "EXECUTE",
        "ATTACH",
        "DETACH",
        "INSTALL",
        "LOAD",
        "PRAGMA",
    ]
    .iter()
    .any(|word| first.is(word))
    {
        return Err(Error::invalid(
            "Transactions and connection configuration belong to the project runtime",
        ));
    }
    Ok(())
}

pub(crate) fn parse(conn: &Connection, sql: &str) -> Result<Value> {
    let serialized: String = conn.query_row(
        "SELECT json_serialize_sql(CAST(? AS VARCHAR))",
        [sql],
        |r| r.get(0),
    )?;
    let value: Value = serde_json::from_str(&serialized)?;
    if value["error"] == true {
        return Err(Error::new(
            "sql_error",
            value["error_message"]
                .as_str()
                .unwrap_or("SQL parsing failed"),
        ));
    }
    if value["statements"].as_array().map(Vec::len) != Some(1) {
        return Err(Error::invalid("Exactly one SELECT is required"));
    }
    Ok(value)
}
pub(crate) fn render(conn: &Connection, tree: &Value) -> Result<String> {
    Ok(conn.query_row(
        "SELECT json_deserialize_sql(CAST(? AS JSON))",
        [tree.to_string()],
        |r| r.get(0),
    )?)
}

pub(crate) fn view_query(conn: &Connection, relation: &Relation) -> Result<Option<String>> {
    let ddl: Option<String> = conn.query_row(
        "SELECT sql FROM duckdb_views() WHERE database_name=current_database() AND schema_name=? AND view_name=?",
        [&relation.schema, &relation.name], |r| r.get(0)).optional()?;
    ddl.map(|ddl| select_body(&ddl)).transpose()
}
pub(crate) fn select_body(ddl: &str) -> Result<String> {
    let t = tokens(ddl)?;
    let mut depth = 0;
    let mut aliases = Vec::new();
    for token in &t {
        if token.is("(") {
            depth += 1;
        } else if token.is(")") {
            depth -= 1;
        } else if token.is("AS") && depth == 0 {
            let body = ddl[token.end..].trim().trim_end_matches(';');
            return Ok(if aliases.is_empty() {
                body.to_owned()
            } else {
                format!(
                    "SELECT * FROM ({body}) AS definition ({})",
                    aliases.join(", ")
                )
            });
        } else if depth > 0 && !token.is(",") {
            aliases.push(quote(&token.value));
        }
    }
    Err(Error::invalid("Unrecognized DuckDB CREATE VIEW header"))
}

pub(crate) fn wrap(conn: &Connection, outer: &str, previous: &str) -> Result<String> {
    let mut tree = parse(conn, outer)?;
    let root = &mut tree["statements"][0]["node"];
    let from = &root["from_table"];
    if root["type"] != "SELECT_NODE"
        || from["type"] != "BASE_TABLE"
        || from["table_name"] != INPUT
        || from["schema_name"] != ""
        || from["catalog_name"] != ""
        || from["alias"]
            .as_str()
            .is_some_and(|v| !v.is_empty() && v != INPUT)
    {
        return Err(Error::invalid(
            "In-place SELECT must use FROM __wf_current without a different alias",
        ));
    }
    // A CTE could shadow the reserved input and make the wrapper's meaning ambiguous.
    root["from_table"]["alias"] = json!("");
    if has_reserved_name(root) {
        return Err(Error::invalid("Reserved wrapper name in query"));
    }
    let old = parse(conn, previous)?;
    root["from_table"] = json!({"type":"SUBQUERY", "alias": INPUT, "sample":null,
        "subquery": old["statements"][0], "column_name_alias":[]});
    // Keep the caller's input qualifier while marking exactly this FROM wrapper for undo.
    root["from_table"]["alias"] = json!(PREVIOUS);
    rename_input_qualifiers(root);
    let sql = render(conn, &tree)?;
    parse(conn, &sql)?;
    Ok(sql)
}
fn has_reserved_name(v: &Value) -> bool {
    match v {
        Value::Object(map) => map.iter().any(|(k, v)| {
            ((k == "alias" || k == "key")
                && v.as_str().is_some_and(|s| s == PREVIOUS || s == INPUT))
                || has_reserved_name(v)
        }),
        Value::Array(a) => a.iter().any(has_reserved_name),
        _ => false,
    }
}
fn rename_input_qualifiers(v: &mut Value) {
    if v["class"] == "COLUMN_REF" && v["column_names"][0] == INPUT {
        v["column_names"][0] = json!(PREVIOUS);
    }
    if v["class"] == "STAR" && v["relation_name"] == INPUT {
        v["relation_name"] = json!(PREVIOUS);
    }
    // The inserted old query already has its own binding scopes.
    if v["type"] == "SUBQUERY" && v["alias"] == PREVIOUS {
        return;
    }
    if let Some(m) = v.as_object_mut() {
        for child in m.values_mut() {
            rename_input_qualifiers(child);
        }
    } else if let Some(a) = v.as_array_mut() {
        for child in a {
            rename_input_qualifiers(child);
        }
    }
}
pub(crate) fn unwrap(conn: &Connection, sql: &str) -> Result<String> {
    let mut tree = parse(conn, sql)?;
    let from = &tree["statements"][0]["node"]["from_table"];
    if !can_undo(&tree) {
        return Err(Error::new(
            "nothing_to_undo",
            "No Wordflow query wrapper to undo",
        ));
    }
    tree["statements"][0] = from["subquery"].clone();
    render(conn, &tree)
}

/// Rebase qualified catalogue identifiers in catalogue DDL, including sequence reference
/// literals in nextval/currval. Ordinary strings, comments and defaults remain untouched.
pub(crate) fn portable_ddl(sql: &str, database: &str) -> Result<String> {
    let t = tokens(sql)?;
    let mut edits = Vec::new();
    for parts in t.windows(5) {
        if parts[0].value.eq_ignore_ascii_case(database)
            && parts[1].is(".")
            && parts[3].is(".")
            && !sql[parts[0].start..].starts_with('\'')
        {
            edits.push((parts[0].start, parts[1].end, String::new()));
        }
    }
    for parts in t.windows(4) {
        if (parts[0].is("nextval") || parts[0].is("currval"))
            && parts[1].is("(")
            && parts[3].is(")")
            && sql[parts[2].start..].starts_with('\'')
        {
            let name = tokens(&parts[2].value)?;
            if name.len() == 5
                && name[0].value.eq_ignore_ascii_case(database)
                && name[1].is(".")
                && name[3].is(".")
            {
                edits.push((
                    parts[2].start,
                    parts[2].end,
                    literal(&format!(
                        "{}.{}",
                        quote(&name[2].value),
                        quote(&name[4].value)
                    )),
                ));
            }
        }
    }
    edits.sort_by_key(|(start, _, _)| *start);
    let mut result = sql.to_owned();
    for (start, end, replacement) in edits.into_iter().rev() {
        result.replace_range(start..end, &replacement);
    }
    Ok(result)
}

/// Generated columns must be recomputed by their preserved Table definition during insertion.
pub(crate) fn generated_columns(ddl: &str) -> Result<HashSet<String>> {
    let mut generated = HashSet::new();
    let mut depth = 0;
    let mut column = None;
    for token in tokens(ddl)? {
        if token.is("(") {
            depth += 1;
            continue;
        }
        if token.is(")") {
            depth -= 1;
            continue;
        }
        if depth != 1 {
            continue;
        }
        if token.is(",") {
            column = None;
        } else if column.is_none() {
            column = Some(token.value.clone());
        } else if token.is("GENERATED")
            && let Some(name) = &column
        {
            generated.insert(name.clone());
        }
    }
    Ok(generated)
}

/// Rebase a SELECT onto the same schemas in a portable database, never touching literals.
pub(crate) fn portable_select(
    conn: &Connection,
    sql: &str,
    context: &ReferenceContext<'_>,
) -> Result<String> {
    let mut tree = parse(conn, sql)?;
    let relations = references_in(&mut tree, context, None);
    for relation in &relations {
        references_in(&mut tree, context, Some((relation, relation)));
    }
    fn visit(value: &mut Value, database: &str) -> Result<()> {
        if value["catalog_name"]
            .as_str()
            .is_some_and(|name| name.eq_ignore_ascii_case(database))
        {
            value["catalog_name"] = json!("");
        }
        if value["catalog"]
            .as_str()
            .is_some_and(|name| name.eq_ignore_ascii_case(database))
        {
            value["catalog"] = json!("");
        }
        if value["class"] == "COLUMN_REF"
            && let Some(names) = value["column_names"].as_array_mut()
            && names.len() >= 4
            && names[0]
                .as_str()
                .is_some_and(|name| name.eq_ignore_ascii_case(database))
        {
            names.remove(0);
        }
        if value["class"] == "STAR"
            && let Some(name) = value["relation_name"].as_str()
            && !name.is_empty()
        {
            let parts = tokens(name)?;
            if parts.len() == 5 && parts[0].value.eq_ignore_ascii_case(database) {
                value["relation_name"] = json!(format!(
                    "{}.{}",
                    quote(&parts[2].value),
                    quote(&parts[4].value)
                ));
            }
        }
        match value {
            Value::Object(map) => {
                for child in map.values_mut() {
                    visit(child, database)?;
                }
            }
            Value::Array(items) => {
                for child in items {
                    visit(child, database)?;
                }
            }
            _ => {}
        }
        Ok(())
    }
    visit(&mut tree, context.database)?;
    render(conn, &tree)
}

#[derive(Clone, Default)]
struct Scope {
    ctes: HashSet<String>,
    bindings: Vec<(Vec<String>, Vec<String>)>,
}
fn lower(s: &str) -> String {
    s.to_ascii_lowercase()
}
fn string(v: &Value, key: &str) -> String {
    v[key].as_str().unwrap_or_default().to_owned()
}

/// One scope-aware walk serves graph inspection and source replacement.
pub(crate) struct ReferenceContext<'a> {
    pub database: &'a str,
    pub schema: &'a str,
    pub search_path: &'a [String],
    pub catalogue: Option<&'a [Relation]>,
}
pub(crate) fn references_in(
    tree: &mut Value,
    context: &ReferenceContext<'_>,
    replacement: Option<(&Relation, &Relation)>,
) -> Vec<Relation> {
    inspect_references(
        tree,
        context,
        replacement.map(|(source, target)| Replacement {
            source,
            target,
            projection: None,
        }),
    )
}
#[derive(Clone, Copy)]
struct Replacement<'a> {
    source: &'a Relation,
    target: &'a Relation,
    projection: Option<&'a Value>,
}
/// Preserve a dependent View's interface while adapting one renamed source column.
pub(crate) fn project_references_in(
    tree: &mut Value,
    context: &ReferenceContext<'_>,
    source: &Relation,
    projection: &Value,
) -> Vec<Relation> {
    inspect_references(
        tree,
        context,
        Some(Replacement {
            source,
            target: source,
            projection: Some(projection),
        }),
    )
}
fn inspect_references(
    tree: &mut Value,
    context: &ReferenceContext<'_>,
    replacement: Option<Replacement<'_>>,
) -> Vec<Relation> {
    let mut found = Vec::new();
    walk(tree, &Scope::default(), context, replacement, &mut found);
    fn remove_markers(value: &mut Value) {
        match value {
            Value::Object(map) => {
                map.remove("__wordflow_projected");
                for child in map.values_mut() {
                    remove_markers(child);
                }
            }
            Value::Array(values) => {
                for child in values {
                    remove_markers(child);
                }
            }
            _ => {}
        }
    }
    remove_markers(tree);
    found
}

fn walk(
    v: &mut Value,
    inherited: &Scope,
    context: &ReferenceContext<'_>,
    replacement: Option<Replacement<'_>>,
    found: &mut Vec<Relation>,
) {
    if v.get("__wordflow_projected").and_then(Value::as_bool) == Some(true) {
        return;
    }
    if v.get("type")
        .and_then(Value::as_str)
        .is_some_and(|t| t.ends_with("_NODE"))
    {
        let mut scope = inherited.clone();
        if let Some(ctes) = v["cte_map"]["map"].as_array_mut() {
            for cte in ctes {
                let name = lower(&string(cte, "key"));
                let mut definition_scope = scope.clone();
                if cte["value"]["query"]["node"]["type"] == "RECURSIVE_CTE_NODE" {
                    definition_scope.ctes.insert(name.clone());
                }
                walk(
                    &mut cte["value"],
                    &definition_scope,
                    context,
                    replacement,
                    found,
                );
                scope.ctes.insert(name);
            }
        }
        let mut local = Vec::new();
        if let Some(from) = v.get_mut("from_table") {
            bind(from, &scope, context, replacement, found, &mut local);
        }
        local.extend(scope.bindings);
        scope.bindings = local;
        if let Some(map) = v.as_object_mut() {
            for (key, child) in map {
                if key != "cte_map" {
                    walk(child, &scope, context, replacement, found);
                }
            }
        }
        return;
    }
    if v["class"] == "COLUMN_REF" {
        if let Some(a) = v["column_names"].as_array() {
            let names: Vec<String> = a
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect();
            v["column_names"] = json!(rewrite_names(names, inherited));
        }
    } else if v["class"] == "STAR" {
        let qualifier = string(v, "relation_name");
        if !qualifier.is_empty()
            && let Ok(t) = tokens(&qualifier)
        {
            let mut names: Vec<String> = t
                .into_iter()
                .filter(|t| !t.is("."))
                .map(|t| t.value)
                .collect();
            names.push("*".into());
            let mut rewritten = rewrite_names(names, inherited);
            rewritten.pop();
            v["relation_name"] = json!(rewritten.join("."));
        }
    }
    if let Some(map) = v.as_object_mut() {
        for child in map.values_mut() {
            walk(child, inherited, context, replacement, found);
        }
    } else if let Some(a) = v.as_array_mut() {
        for child in a {
            walk(child, inherited, context, replacement, found);
        }
    }
}
fn rewrite_names(names: Vec<String>, scope: &Scope) -> Vec<String> {
    for (before, after) in &scope.bindings {
        if names.len() > before.len()
            && names
                .iter()
                .zip(before)
                .all(|(a, b)| a.eq_ignore_ascii_case(b))
        {
            let mut output = after.clone();
            output.extend_from_slice(&names[before.len()..]);
            return output;
        }
    }
    names
}
fn bind(
    v: &mut Value,
    scope: &Scope,
    context: &ReferenceContext<'_>,
    replacement: Option<Replacement<'_>>,
    found: &mut Vec<Relation>,
    bindings: &mut Vec<(Vec<String>, Vec<String>)>,
) {
    let alias = string(v, "alias");
    match v["type"].as_str() {
        Some("BASE_TABLE") => {
            let name = string(v, "table_name");
            let schema = string(v, "schema_name");
            let catalog = string(v, "catalog_name");
            let cte = schema.is_empty() && catalog.is_empty() && scope.ctes.contains(&lower(&name));
            let relation = Relation {
                schema: if schema.is_empty() {
                    context.schema.into()
                } else {
                    schema.clone()
                },
                name: name.clone(),
            };
            let local = catalog.is_empty() || catalog.eq_ignore_ascii_case(context.database);
            // Views search their own schema first, then the catalogue default and session path.
            let relation = if !cte && local {
                context
                    .catalogue
                    .and_then(|objects| {
                        let schemas = if schema.is_empty() {
                            std::iter::once(context.schema)
                                .chain(std::iter::once("main"))
                                .chain(context.search_path.iter().map(String::as_str))
                                .collect::<Vec<_>>()
                        } else {
                            vec![schema.as_str()]
                        };
                        schemas
                            .iter()
                            .find_map(|schema| {
                                objects.iter().find(|object| {
                                    object.schema.eq_ignore_ascii_case(schema)
                                        && object.name.eq_ignore_ascii_case(&name)
                                })
                            })
                            .cloned()
                    })
                    .unwrap_or(relation)
            } else {
                relation
            };
            let target = replacement
                .filter(|replacement| {
                    let old = replacement.source;
                    !cte && local
                        && old.schema.eq_ignore_ascii_case(&relation.schema)
                        && old.name.eq_ignore_ascii_case(&name)
                })
                .map(|replacement| replacement.target);
            if !cte && local {
                found.push(relation.clone());
            }
            let new = target.unwrap_or(&relation);
            if alias.is_empty() {
                for before in [
                    vec![
                        context.database.to_owned(),
                        relation.schema.clone(),
                        name.clone(),
                    ],
                    vec![relation.schema.clone(), name.clone()],
                    vec![name.clone()],
                ] {
                    let after = if target.is_some()
                        && replacement.is_some_and(|r| r.projection.is_some())
                    {
                        vec![name.clone()]
                    } else if target.is_some() {
                        match before.len() {
                            3 => vec![
                                context.database.to_owned(),
                                new.schema.clone(),
                                new.name.clone(),
                            ],
                            2 => vec![new.schema.clone(), new.name.clone()],
                            _ => vec![new.name.clone()],
                        }
                    } else {
                        before.clone()
                    };
                    bindings.push((before, after));
                }
            } else {
                bindings.push((vec![alias.clone()], vec![alias.clone()]));
            }
            if let Some(new) = target {
                if let Some(projection) = replacement.and_then(|r| r.projection) {
                    let sample = v.get("sample").cloned();
                    *v = projection.clone();
                    v["alias"] = json!(if alias.is_empty() { name } else { alias });
                    if let Some(sample) = sample {
                        v["sample"] = sample;
                    }
                    v["__wordflow_projected"] = json!(true);
                } else {
                    v["table_name"] = json!(new.name);
                    v["schema_name"] = json!(new.schema);
                }
            }
        }
        Some("JOIN") => {
            bind(&mut v["left"], scope, context, replacement, found, bindings);
            bind(
                &mut v["right"],
                scope,
                context,
                replacement,
                found,
                bindings,
            );
        }
        _ => {
            if !alias.is_empty() {
                bindings.push((vec![alias.clone()], vec![alias.clone()]));
            }
        }
    }
}

pub(crate) fn can_undo(tree: &Value) -> bool {
    let from = &tree["statements"][0]["node"]["from_table"];
    from["type"] == "SUBQUERY" && from["alias"] == PREVIOUS
}
