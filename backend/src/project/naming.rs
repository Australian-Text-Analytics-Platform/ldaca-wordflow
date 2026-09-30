//! Short defaults for application-created Data Blocks, separate from import names.
use super::*;

fn source_prefix(sources: &[&str]) -> String {
    let limit = if sources.len() > 1 { 7 } else { 16 };
    let parts: Vec<String> = sources
        .iter()
        .take(2)
        .map(|source| {
            let mut normalized = String::new();
            for c in source.chars() {
                if c.is_alphanumeric() {
                    normalized.push(c);
                } else if !normalized.is_empty() && !normalized.ends_with('_') {
                    normalized.push('_');
                }
            }
            let prefix: String = normalized.chars().take(limit).collect();
            let prefix = prefix.trim_matches('_');
            if prefix.is_empty() {
                "data".into()
            } else {
                prefix.into()
            }
        })
        .collect();
    if parts.is_empty() {
        "data".into()
    } else {
        parts.join("_")
    }
}

pub(super) fn data_block_name(
    conn: &Connection,
    schema: &str,
    sources: &[&str],
    operation: &str,
    registered: bool,
) -> Result<String> {
    let names = occupied_object_names(conn, schema, registered)?;
    let stem = format!("{}_{operation}", source_prefix(sources));
    let mut number = 1;
    while names.contains(&format!("{stem}_{number}").to_ascii_lowercase()) {
        number += 1;
    }
    Ok(format!("{stem}_{number}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefixes_preserve_unicode_and_bound_chained_and_multiple_sources() {
        for (sources, expected) in [
            (vec![], "data"),
            (vec!["---"], "data"),
            (vec!["  Speech / texts! "], "Speech_texts"),
            (vec!["abcdefghijklmnop_more_flt_1"], "abcdefghijklmnop"),
            (
                vec!["中文研究资料一二三四五六七八九十末"],
                "中文研究资料一二三四五六七八九十",
            ),
            (
                vec!["speechA-long", "speechB-long", "ignored"],
                "speechA_speechB",
            ),
        ] {
            assert_eq!(source_prefix(&sources), expected);
        }
    }

    #[test]
    fn all_tab_codes_preserve_custom_and_legacy_names_after_reopen() {
        let mut project = Project::untitled().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("names.wfpj");
        let mut expected = Vec::new();
        for (kind, code) in [
            ("frequency", "FR"),
            ("concordance", "CC"),
            ("quotation", "QT"),
            ("topic-modeling", "TM"),
            ("annotation", "AN"),
            ("trends", "TR"),
            ("compare", "CP"),
            ("scatter", "SC"),
            ("heatmap", "HM"),
            ("sankey", "SK"),
        ] {
            for name in [
                None,
                Some("Legacy name 1".into()),
                Some(format!("{code}-2")),
                None,
            ] {
                let tab = project
                    .database
                    .create_analysis_tab(analyses::CreateTab {
                        kind: kind.into(),
                        name,
                    })
                    .unwrap();
                expected.push((tab.id, tab.name));
            }
            let names: Vec<_> = expected
                .iter()
                .rev()
                .take(4)
                .map(|(_, name)| name.as_str())
                .collect();
            assert_eq!(
                names,
                [
                    format!("{code}-3"),
                    format!("{code}-2"),
                    "Legacy name 1".into(),
                    format!("{code}-1")
                ]
            );
        }
        project.save_as(&path).unwrap();
        drop(project);
        let reopened = Project::open(&path).unwrap();
        for (id, name) in expected {
            assert_eq!(reopened.database.analysis_tab(id).unwrap().name, name);
        }
    }

    #[test]
    fn allocation_uses_catalogue_and_registered_names_without_changing_import_defaults() {
        let project = Project::untitled().unwrap();
        let conn = &project.database.conn;
        conn.execute_batch("CREATE TABLE data.source_cpy_1(x INT); CREATE TABLE data.SOURCE_CPY_3(x INT); INSERT INTO wordflow.nodes(table_name) VALUES ('source_cpy_2')").unwrap();
        assert_eq!(
            data_block_name(conn, "data", &["source"], "cpy", true).unwrap(),
            "source_cpy_4"
        );
        assert_eq!(
            data_block_name(conn, "data", &["source"], "cpy", false).unwrap(),
            "source_cpy_2"
        );
        assert_eq!(
            unique_object_name(conn, "data", "My imported file", true, &[]).unwrap(),
            "My imported file"
        );
    }
}
