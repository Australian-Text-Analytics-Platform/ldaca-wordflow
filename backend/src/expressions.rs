//! Syntax-only expression transport. DuckDB owns parsing and SQL rendering; the
//! frontend catalogue decides which syntax has visual controls.
use crate::{
    error::{Error, Result},
    query,
};
use duckdb::Connection;
use serde::Serialize;
use serde_json::{Value, json};

#[derive(Serialize, utoipa::ToSchema)]
#[schema(as = ParsedExpression)]
pub(crate) struct Expression {
    pub(crate) sql: String,
    #[serde(flatten)]
    syntax: Syntax,
}
#[derive(Serialize, utoipa::ToSchema)]
#[schema(as = ExpressionSyntax)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Syntax {
    Column {
        names: Vec<String>,
    },
    Literal {
        #[schema(schema_with = literal_type_schema)]
        literal_type: &'static str,
        value: String,
    },
    Function {
        name: String,
        #[schema(no_recursion)]
        children: Vec<Expression>,
        distinct: bool,
        window: bool,
    },
    Operator {
        name: String,
        #[schema(no_recursion)]
        children: Vec<Expression>,
    },
    Cast {
        target: String,
        #[schema(no_recursion)]
        child: Box<Expression>,
        try_cast: bool,
    },
    ScalarQuery {
        source: Vec<String>,
        #[schema(no_recursion)]
        child: Box<Expression>,
    },
    Sql,
}

pub(crate) fn parse(conn: &Connection, expression: &str) -> Result<Expression> {
    // This SELECT is only serialized, never prepared or executed. Its shape
    // excludes list aliases, clauses and additional expressions or statements.
    let tree = query::parse(conn, &format!("SELECT\n{expression}\n"))?;
    let node = &tree["statements"][0]["node"];
    if !plain_select(node) || node["from_table"]["type"] != "EMPTY" {
        return Err(Error::invalid("Enter exactly one SQL expression"));
    }
    let template = query::parse(conn, "SELECT NULL")?;
    convert(conn, &template, &node["select_list"][0])
}
/// Accept only one ordinary NULL cast, using DuckDB's rendered type expression.
pub(crate) fn cast_type(conn: &Connection, input: &str) -> Result<String> {
    let expression = parse(conn, &format!("CAST(NULL AS {input})"))?;
    if let Syntax::Cast {
        child,
        try_cast: false,
        ..
    } = &expression.syntax
        && matches!(
            child.syntax,
            Syntax::Literal {
                literal_type: "null",
                ..
            }
        )
        && let Some(target) = expression
            .sql
            .strip_prefix("CAST(NULL AS ")
            .and_then(|s| s.strip_suffix(')'))
    {
        return Ok(target.to_owned());
    }
    Err(Error::invalid(
        "Enter one SQL type, such as DECIMAL(18,4) or VARCHAR[].",
    ))
}

fn plain_select(node: &Value) -> bool {
    node["type"] == "SELECT_NODE"
        && node["select_list"]
            .as_array()
            .is_some_and(|v| v.len() == 1 && v[0]["alias"] == "")
        && ["modifiers", "group_expressions", "group_sets"]
            .iter()
            .all(|k| empty(&node[k]))
        && empty(&node["cte_map"]["map"])
        && ["where_clause", "having", "qualify", "sample"]
            .iter()
            .all(|k| node[k].is_null())
        && node["aggregate_handling"] == "STANDARD_HANDLING"
}
fn empty(value: &Value) -> bool {
    value.as_array().is_some_and(Vec::is_empty)
}
fn string(value: &Value) -> String {
    value.as_str().unwrap_or_default().to_owned()
}
fn names(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|v| v.iter().map(string).collect())
        .unwrap_or_default()
}
fn convert(conn: &Connection, template: &Value, node: &Value) -> Result<Expression> {
    let mut tree = template.clone();
    tree["statements"][0]["node"]["select_list"] = json!([node]);
    let rendered = query::render(conn, &tree)?;
    let sql = rendered
        .strip_prefix("SELECT ")
        .ok_or_else(|| Error::invalid("Cannot render expression"))?
        .to_owned();
    let children = || -> Result<Vec<Expression>> {
        node["children"]
            .as_array()
            .ok_or_else(|| Error::invalid("Missing expression children"))?
            .iter()
            .map(|child| convert(conn, template, child))
            .collect()
    };
    let syntax = match node["class"].as_str() {
        Some("COLUMN_REF") => Syntax::Column {
            names: names(&node["column_names"]),
        },
        Some("CONSTANT") => {
            let value = &node["value"];
            let literal_type = if value["is_null"] == true {
                "null"
            } else {
                match value["type"]["id"].as_str() {
                    Some("VARCHAR") => "text",
                    Some("BOOLEAN") => "boolean",
                    Some(
                        "TINYINT" | "SMALLINT" | "INTEGER" | "BIGINT" | "HUGEINT" | "UTINYINT"
                        | "USMALLINT" | "UINTEGER" | "UBIGINT" | "UHUGEINT" | "DECIMAL" | "FLOAT"
                        | "DOUBLE",
                    ) => "number",
                    _ => "unknown",
                }
            };
            if literal_type == "unknown" {
                Syntax::Sql
            } else {
                Syntax::Literal {
                    literal_type,
                    value: match literal_type {
                        "text" => string(&value["value"]),
                        "boolean" => value["value"].to_string(),
                        "null" => String::new(),
                        // Render from DuckDB's exact constant, never through a JSON/JS float.
                        _ => sql.clone(),
                    },
                }
            }
        }
        Some("FUNCTION")
            if node["filter"].is_null()
                && empty(&node["order_bys"]["orders"])
                && node["export_state"] == false
                && node["catalog"] == ""
                && (node["schema"] == ""
                    || (node["schema"] == "main"
                        && matches!(
                            node["function_name"].as_str(),
                            Some("trim" | "substring")
                        ))) =>
        {
            if node["is_operator"] == true {
                Syntax::Operator {
                    name: string(&node["function_name"]),
                    children: children()?,
                }
            } else {
                Syntax::Function {
                    name: string(&node["function_name"]),
                    children: children()?,
                    distinct: node["distinct"] == true,
                    window: false,
                }
            }
        }
        Some("WINDOW") if simple_window(node) => Syntax::Function {
            name: string(&node["function_name"]),
            children: children()?,
            distinct: node["distinct"] == true,
            window: true,
        },
        Some("OPERATOR" | "CONJUNCTION") => Syntax::Operator {
            name: string(&node["type"]),
            children: children()?,
        },
        Some("COMPARISON") => Syntax::Operator {
            name: string(&node["type"]),
            children: vec![
                convert(conn, template, &node["left"])?,
                convert(conn, template, &node["right"])?,
            ],
        },
        Some("CAST") => Syntax::Cast {
            target: string(&node["cast_type"]["id"]),
            child: Box::new(convert(conn, template, &node["child"])?),
            try_cast: node["try_cast"] == true,
        },
        Some("SUBQUERY")
            if node["subquery_type"] == "SCALAR" && plain_select(&node["subquery"]["node"]) =>
        {
            let select = &node["subquery"]["node"];
            let from = &select["from_table"];
            if from["type"] == "BASE_TABLE"
                && from["alias"] == ""
                && from["sample"].is_null()
                && from["at_clause"].is_null()
                && empty(&from["column_name_alias"])
            {
                Syntax::ScalarQuery {
                    source: ["catalog_name", "schema_name", "table_name"]
                        .iter()
                        .map(|k| string(&from[k]))
                        .filter(|s| !s.is_empty())
                        .collect(),
                    child: Box::new(convert(conn, template, &select["select_list"][0])?),
                }
            } else {
                Syntax::Sql
            }
        }
        _ => Syntax::Sql,
    };
    Ok(Expression { sql, syntax })
}
fn simple_window(node: &Value) -> bool {
    node["type"] == "WINDOW_AGGREGATE"
        && node["catalog"] == ""
        && node["schema"] == ""
        && ["partitions", "orders", "arg_orders"]
            .iter()
            .all(|k| empty(&node[k]))
        && [
            "start_expr",
            "end_expr",
            "offset_expr",
            "default_expr",
            "filter_expr",
        ]
        .iter()
        .all(|k| node[k].is_null())
        && node["start"] == "UNBOUNDED_PRECEDING"
        && node["end"] == "CURRENT_ROW_RANGE"
        && node["exclude_clause"] == "NO_OTHER"
        && node["ignore_nulls"] == false
}

fn literal_type_schema() -> utoipa::openapi::schema::Object {
    crate::openapi::string_enum(&["text", "number", "boolean", "null"])
}

#[cfg(test)]
mod tests {
    #[test]
    fn cast_types_use_duckdb_syntax_without_accepting_expressions() {
        let conn = duckdb::Connection::open_in_memory().unwrap();
        for input in [
            "DECIMAL(18,4)",
            "INTEGER[]",
            "STRUCT(\"a b\" DECIMAL(38,9), x VARCHAR[]) /* comment */",
            "TIMESTAMPTZ",
            "TEXT",
            "\"custom type\"",
        ] {
            let normalized = super::cast_type(&conn, input).unwrap();
            assert!(!normalized.contains("comment"));
            assert!(!normalized.is_empty());
        }
        for input in [
            "",
            "INTEGER) + 1 --",
            "INTEGER) AS BIGINT --",
            "INTEGER); SELECT 1 --",
            "INTEGER) FROM x --",
        ] {
            assert!(super::cast_type(&conn, input).is_err(), "{input}");
        }
    }

    use super::*;
    fn parsed(sql: &str) -> Value {
        serde_json::to_value(parse(&Connection::open_in_memory().unwrap(), sql).unwrap()).unwrap()
    }
    #[test]
    fn retains_grouping_exact_constants_and_opaque_children() {
        let tree = parsed(
            "(900719925474099312345678.123456789 - a) / (b - CASE WHEN c THEN 2 ELSE 3 END)",
        );
        assert_eq!(tree["name"], "/");
        assert_eq!(
            tree["children"][0]["children"][0]["value"],
            "900719925474099312345678.123456789"
        );
        assert_eq!(tree["children"][1]["name"], "-");
        assert_eq!(tree["children"][1]["children"][1]["kind"], "sql");
    }
    #[test]
    fn parses_without_binding_or_executing_and_rejects_statements() {
        let conn = Connection::open_in_memory().unwrap();
        for sql in [
            "unknown_function(missing_column)",
            "nextval('missing_sequence')",
            "(SELECT x FROM absent_table)",
        ] {
            assert!(parse(&conn, sql).is_ok(), "{sql}");
        }
        for sql in [
            "a), b --",
            "a AS b",
            "a) FROM range(10) --",
            "a); SELECT 2 --",
            "SELECT 2",
            "lower(",
        ] {
            assert!(parse(&conn, sql).is_err(), "{sql}");
        }
    }
    #[test]
    fn transports_summary_forms_and_keeps_nonstandard_windows_opaque() {
        assert_eq!(parsed("sum(x) OVER ()")["window"], true);
        assert_eq!(parsed("sum(x) OVER (ORDER BY y)")["kind"], "sql");
        let tree = parsed("(SELECT avg(x) FROM data.\"a b\")");
        assert_eq!(tree["source"], json!(["data", "a b"]));
        assert_eq!(tree["child"]["name"], "avg");
        assert_eq!(parsed("(SELECT avg(x) FROM t WHERE x>1)")["kind"], "sql");
    }
    #[test]
    fn retains_cast_precision_qualified_names_and_function_variants() {
        let tree = parsed("CAST(\"世界\".\"a b\" AS DECIMAL(38,9))");
        assert_eq!(tree["child"]["names"], json!(["世界", "a b"]));
        assert!(tree["sql"].as_str().unwrap().contains("DECIMAL(38,9)"));
        assert_eq!(parsed("sum(x) FILTER (WHERE y)")["kind"], "sql");
        assert_eq!(parsed("other.lower(x)")["kind"], "sql");
        assert_eq!(parsed("main.upper(x)")["kind"], "sql");
        assert_eq!(parsed("trim(x)")["kind"], "function");
        assert_eq!(parsed("substring(x, 1, 2)")["kind"], "function");
    }
}
