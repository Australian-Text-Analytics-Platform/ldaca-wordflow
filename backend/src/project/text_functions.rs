//! Small SQL text functions shared by live View queries, Preview and Table edits.
use super::*;
use duckdb::arrow::{
    array::{
        Array, ArrayRef, BooleanArray, Int64Array, ListBuilder, RecordBatch, StringArray,
        StringBuilder,
    },
    datatypes::DataType,
};
use duckdb::vscalar::{ArrowFunctionSignature, VArrowScalar};
use quick_xml::{Reader, events::Event};
use regex::{Regex, RegexBuilder};
use std::collections::HashMap;

pub(super) fn register(conn: &Connection) -> Result<()> {
    let present: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM duckdb_functions() WHERE function_name='wordflow_replace')",
        [],
        |row| row.get(0),
    )?;
    if present {
        return Ok(());
    }
    conn.register_scalar_function::<Replace>("wordflow_replace")?;
    conn.register_scalar_function::<Matches>("wordflow_matches")?;
    conn.register_scalar_function::<Split>("wordflow_split")?;
    conn.register_scalar_function_with_state::<UnaryText>(
        "wordflow_clean_xml",
        &TextOperation::Xml,
    )?;
    conn.register_scalar_function_with_state::<UnaryText>(
        "wordflow_title_case",
        &TextOperation::Title,
    )?;
    conn.register_scalar_function::<XmlValid>("wordflow_xml_valid")?;
    conn.register_scalar_function::<Words>("wordflow_word_count")?;
    Ok(())
}

type FunctionResult = std::result::Result<ArrayRef, Box<dyn std::error::Error>>;
fn strings(
    input: &RecordBatch,
    index: usize,
) -> std::result::Result<&StringArray, Box<dyn std::error::Error>> {
    input
        .column(index)
        .as_any()
        .downcast_ref::<StringArray>()
        .ok_or_else(|| "Expected text".into())
}
fn bools(
    input: &RecordBatch,
    index: usize,
) -> std::result::Result<&BooleanArray, Box<dyn std::error::Error>> {
    input
        .column(index)
        .as_any()
        .downcast_ref::<BooleanArray>()
        .ok_or_else(|| "Expected a boolean".into())
}
type PatternKey = (String, bool, bool, bool);
fn matcher<'a>(
    cache: &'a mut HashMap<PatternKey, Regex>,
    pattern: &str,
    regex: bool,
    whole: bool,
    sensitive: bool,
) -> std::result::Result<&'a Regex, regex::Error> {
    let key = (pattern.into(), regex, whole, sensitive);
    if !cache.contains_key(&key) {
        let pattern = if regex {
            pattern.into()
        } else if whole {
            ldaca_rs::text::literal_word_pattern(pattern)
        } else {
            regex::escape(pattern)
        };
        cache.insert(
            key.clone(),
            RegexBuilder::new(&pattern)
                .case_insensitive(!sensitive)
                .build()?,
        );
    }
    Ok(&cache[&key])
}
struct Replace;
impl VArrowScalar for Replace {
    type State = ();
    fn signatures() -> Vec<ArrowFunctionSignature> {
        vec![ArrowFunctionSignature::exact(
            vec![
                DataType::Utf8,
                DataType::Utf8,
                DataType::Utf8,
                DataType::Boolean,
                DataType::Boolean,
                DataType::Boolean,
                DataType::Boolean,
            ],
            DataType::Utf8,
        )]
    }
    fn invoke(_: &(), input: RecordBatch) -> FunctionResult {
        let text = strings(&input, 0)?;
        let pattern = strings(&input, 1)?;
        let replacement = strings(&input, 2)?;
        let regular = bools(&input, 3)?;
        let whole = bools(&input, 4)?;
        let sensitive = bools(&input, 5)?;
        let first = bools(&input, 6)?;
        let mut cache = HashMap::new();
        let mut result = Vec::with_capacity(text.len());
        for (row, text) in text.iter().enumerate() {
            let Some(text) = text else {
                result.push(None);
                continue;
            };
            let pattern = pattern.value(row);
            if pattern.is_empty() {
                return Err("Enter text or a pattern to find".into());
            }
            let compiled = matcher(
                &mut cache,
                pattern,
                regular.value(row),
                whole.value(row),
                sensitive.value(row),
            )?;
            let limit = if first.value(row) { 1 } else { 0 };
            let replacement = replacement.value(row);
            result.push(Some(if regular.value(row) {
                compiled.replacen(text, limit, replacement).into_owned()
            } else {
                compiled
                    .replacen(text, limit, regex::NoExpand(replacement))
                    .into_owned()
            }));
        }
        Ok(Arc::new(StringArray::from(result)))
    }
}
struct Matches;
impl VArrowScalar for Matches {
    type State = ();
    fn signatures() -> Vec<ArrowFunctionSignature> {
        vec![ArrowFunctionSignature::exact(
            vec![
                DataType::Utf8,
                DataType::Utf8,
                DataType::Boolean,
                DataType::Boolean,
                DataType::Boolean,
            ],
            DataType::List(Arc::new(duckdb::arrow::datatypes::Field::new(
                "item",
                DataType::Utf8,
                true,
            ))),
        )]
    }
    fn invoke(_: &(), input: RecordBatch) -> FunctionResult {
        let text = strings(&input, 0)?;
        let pattern = strings(&input, 1)?;
        let regular = bools(&input, 2)?;
        let whole = bools(&input, 3)?;
        let sensitive = bools(&input, 4)?;
        let mut cache = HashMap::new();
        let mut result = ListBuilder::new(StringBuilder::new());
        for (row, text) in text.iter().enumerate() {
            let Some(text) = text else {
                result.append(false);
                continue;
            };
            let pattern = pattern.value(row);
            if pattern.is_empty() {
                return Err("Enter text or a pattern to find".into());
            }
            for matched in matcher(
                &mut cache,
                pattern,
                regular.value(row),
                whole.value(row),
                sensitive.value(row),
            )?
            .find_iter(text)
            {
                result.values().append_value(matched.as_str());
            }
            result.append(true);
        }
        Ok(Arc::new(result.finish()))
    }
}

fn delimiter_pattern(
    delimiters: &[String],
    right: bool,
) -> std::result::Result<Regex, regex::Error> {
    let mut delimiters: Vec<_> = delimiters
        .iter()
        .map(|d| {
            if right {
                d.chars().rev().collect::<String>()
            } else {
                d.clone()
            }
        })
        .collect();
    delimiters.sort_by_key(|d| std::cmp::Reverse(d.len()));
    Regex::new(
        &delimiters
            .iter()
            .map(|d| regex::escape(d))
            .collect::<Vec<_>>()
            .join("|"),
    )
}
/// Reverse before matching from the right so overlapping delimiters keep direction.
fn split_text(text: &str, pattern: &Regex, parts: usize, right: bool) -> Vec<String> {
    let reverse = |text: &str| text.chars().rev().collect::<String>();
    let text = if right { reverse(text) } else { text.into() };
    let mut result: Vec<String> = Vec::new();
    let mut start = 0;
    for delimiter in pattern.find_iter(&text).take(parts - 1) {
        result.push(text[start..delimiter.start()].into());
        start = delimiter.end();
    }
    result.push(text[start..].into());
    if right {
        result = result
            .into_iter()
            .rev()
            .map(|part| reverse(&part))
            .collect();
    }
    result
}
struct Split;
impl VArrowScalar for Split {
    type State = ();
    fn signatures() -> Vec<ArrowFunctionSignature> {
        vec![ArrowFunctionSignature::exact(
            vec![
                DataType::Utf8,
                DataType::Utf8,
                DataType::Int64,
                DataType::Boolean,
            ],
            DataType::List(Arc::new(duckdb::arrow::datatypes::Field::new(
                "item",
                DataType::Utf8,
                true,
            ))),
        )]
    }
    fn invoke(_: &(), input: RecordBatch) -> FunctionResult {
        let text = strings(&input, 0)?;
        let delimiters = strings(&input, 1)?;
        let parts = input
            .column(2)
            .as_any()
            .downcast_ref::<Int64Array>()
            .ok_or("Expected a column count")?;
        let right = bools(&input, 3)?;
        let mut result = ListBuilder::new(StringBuilder::new());
        let mut delimiter_cache: HashMap<(String, bool), Regex> = HashMap::new();
        for (row, text) in text.iter().enumerate() {
            let Some(text) = text else {
                result.append(false);
                continue;
            };
            let parts = usize::try_from(parts.value(row))?;
            if !(2..=50).contains(&parts) {
                return Err("Split needs between 2 and 50 columns".into());
            }
            let key = (delimiters.value(row).to_string(), right.value(row));
            if !delimiter_cache.contains_key(&key) {
                let parsed: Vec<String> = serde_json::from_str(&key.0)?;
                if parsed.is_empty() || parsed.iter().any(String::is_empty) {
                    return Err("Enter nonempty literal delimiters".into());
                }
                let pattern = delimiter_pattern(&parsed, key.1)?;
                delimiter_cache.insert(key.clone(), pattern);
            }
            let values = split_text(text, &delimiter_cache[&key], parts, right.value(row));
            for value in &values {
                result.values().append_value(value);
            }
            for _ in values.len()..parts {
                result.values().append_null();
            }
            result.append(true);
        }
        Ok(Arc::new(result.finish()))
    }
}

fn clean_xml(text: &str) -> Option<String> {
    let mut reader = Reader::from_str(text);
    let mut result = String::new();
    let mut depth: usize = 0;
    let mut roots = 0;
    loop {
        match reader.read_event().ok()? {
            Event::Start(element) => {
                for attribute in element.attributes() {
                    let attribute = attribute.ok()?;
                    attribute
                        .normalized_value(quick_xml::XmlVersion::Implicit1_0)
                        .ok()?;
                }
                if depth == 0 {
                    roots += 1;
                }
                depth += 1;
            }
            Event::Empty(element) => {
                for attribute in element.attributes() {
                    let attribute = attribute.ok()?;
                    attribute
                        .normalized_value(quick_xml::XmlVersion::Implicit1_0)
                        .ok()?;
                }
                if depth == 0 {
                    roots += 1;
                }
            }
            Event::End(_) => {
                depth = depth.checked_sub(1)?;
            }
            Event::Text(value) => {
                if depth == 0 && !value.trim().is_empty() {
                    return None;
                }
                result.push_str(&value.xml10_content());
            }
            Event::CData(value) => {
                if depth == 0 {
                    return None;
                }
                result.push_str(&value.xml10_content());
            }
            Event::GeneralRef(value) => {
                if depth == 0 {
                    return None;
                }
                let character = if let Some(c) = value.resolve_char_ref().ok()? {
                    c
                } else {
                    match &*value {
                        "lt" => '<',
                        "gt" => '>',
                        "amp" => '&',
                        "apos" => '\'',
                        "quot" => '"',
                        _ => return None,
                    }
                };
                result.push(character);
            }
            Event::Eof => return (depth == 0 && roots == 1).then_some(result),
            _ => {}
        }
    }
}
fn title_case(text: &str) -> String {
    let mut word = false;
    let mut result = String::new();
    for c in text.chars() {
        if c.is_alphanumeric() || c == '_' {
            if word {
                result.extend(c.to_lowercase());
            } else {
                result.extend(c.to_uppercase());
            }
            word = true;
        } else {
            result.push(c);
            if !matches!(c, '\'' | '’') {
                word = false;
            }
        }
    }
    result
}
#[derive(Clone, Default)]
enum TextOperation {
    #[default]
    Xml,
    Title,
}
struct UnaryText;
impl VArrowScalar for UnaryText {
    type State = TextOperation;
    fn signatures() -> Vec<ArrowFunctionSignature> {
        vec![ArrowFunctionSignature::exact(
            vec![DataType::Utf8],
            DataType::Utf8,
        )]
    }
    fn invoke(operation: &TextOperation, input: RecordBatch) -> FunctionResult {
        Ok(Arc::new(StringArray::from(
            strings(&input, 0)?
                .iter()
                .map(|text| {
                    text.map(|text| match operation {
                        TextOperation::Xml => clean_xml(text).unwrap_or_else(|| text.into()),
                        TextOperation::Title => title_case(text),
                    })
                })
                .collect::<Vec<_>>(),
        )))
    }
}
struct XmlValid;
impl VArrowScalar for XmlValid {
    type State = ();
    fn signatures() -> Vec<ArrowFunctionSignature> {
        vec![ArrowFunctionSignature::exact(
            vec![DataType::Utf8],
            DataType::Boolean,
        )]
    }
    fn invoke(_: &(), input: RecordBatch) -> FunctionResult {
        Ok(Arc::new(BooleanArray::from(
            strings(&input, 0)?
                .iter()
                .map(|text| text.map(|text| clean_xml(text).is_some()))
                .collect::<Vec<_>>(),
        )))
    }
}
struct Words;
impl VArrowScalar for Words {
    type State = ();
    fn signatures() -> Vec<ArrowFunctionSignature> {
        vec![ArrowFunctionSignature::exact(
            vec![DataType::Utf8],
            DataType::Int64,
        )]
    }
    fn invoke(_: &(), input: RecordBatch) -> FunctionResult {
        Ok(Arc::new(Int64Array::from(
            strings(&input, 0)?
                .iter()
                .map(|text| text.map(|text| ldaca_rs::text::word_count(text) as i64))
                .collect::<Vec<_>>(),
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saved_text_views_reopen_with_native_functions_registered() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("text.wfpj");
        {
            let project = Project::create(&path).unwrap();
            project.database.conn.execute_batch(
                "CREATE TABLE data.source AS SELECT '<r>IT&apos;S 猫</r>' AS body; \
                 CREATE VIEW data.cleaned AS SELECT wordflow_title_case(wordflow_clean_xml(body)) AS body, \
                 wordflow_word_count(body) AS words, wordflow_split(body, '[\" \" ]', 2, false) AS parts FROM data.source; \
                 CHECKPOINT",
            ).unwrap();
        }
        let reopened = Project::open(&path).unwrap();
        assert_eq!(
            reopened
                .database
                .conn
                .query_row(
                    "SELECT body, words IS NOT NULL AND len(parts)=2 FROM data.cleaned",
                    [],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, bool>(1)?)),
                )
                .unwrap(),
            ("It's 猫".into(), true)
        );
    }
    #[test]
    fn xml_parser_decodes_entities_and_cdata_and_preserves_malformed_text() {
        assert_eq!(
            clean_xml(
                "<?xml version=\"1.0\"?><r>One &amp; &#x732b;<![CDATA[<two>]]><!-- comment --><b>!</b></r>"
            ),
            Some("One & 猫<two>!".into())
        );
        for text in [
            "<r>broken",
            "<r><a></r>",
            "<r>&unknown;</r>",
            "<a/><b/>",
            "<a x='&unknown;'/>",
        ] {
            assert_eq!(clean_xml(text), None, "{text}");
        }
        assert_eq!(title_case("IT'S AN O’NEILL STORY"), "It's An O’neill Story");
    }
    #[test]
    fn native_text_functions_keep_literal_dollars_nulls_unicode_and_split_remainders() {
        let project = Project::untitled().unwrap();
        let conn = &project.database.conn;
        assert_eq!(
            conn.query_row(
                "SELECT wordflow_replace('猫猫 cat cats', '猫', '$1', false, true, true, false)",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "$1$1 cat cats"
        );
        assert_eq!(
            conn.query_row(
                "SELECT wordflow_replace('cat dog', '(cat)', '$1!', true, false, true, true)",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "cat! dog"
        );
        assert_eq!(
            conn.query_row(
                "SELECT wordflow_replace('café cafés', 'café', 'X', false, true, true, false)",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "X cafés"
        );
        assert_eq!(
            conn.query_row("SELECT wordflow_word_count(NULL)", [], |r| r
                .get::<_, Option<i64>>(0))
                .unwrap(),
            None
        );
        assert_eq!(
            split_text(
                "a::b:c::d",
                &delimiter_pattern(&[":".into(), "::".into()], false).unwrap(),
                3,
                false
            ),
            vec!["a", "b", "c::d"]
        );
        assert_eq!(
            split_text(
                "a::b:c::d",
                &delimiter_pattern(&[":".into(), "::".into()], true).unwrap(),
                3,
                true
            ),
            vec!["a::b", "c", "d"]
        );
        assert_eq!(
            conn.query_row(
                "SELECT to_json(wordflow_split('a::b:c::d','[\":\",\"::\"]',3,true))",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "[\"a::b\",\"c\",\"d\"]"
        );
    }
}
