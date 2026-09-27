#![cfg(feature = "data")]
#![allow(clippy::unwrap_used)]
use arrow_array::{Array, StringArray};
use arrow_schema::DataType;
use ldaca_rs::data::{profiles, tabulate::Config, RoCrate};
use serde_json::{json, Value};

#[test]
fn selected_types_preserve_graph_and_property_order() {
    let krate=RoCrate::from_value(json!({"@graph":[{"@id":"b","@type":"Work","name":"Café 🎙"},{"@id":"p","@type":"Person","name":"José"},{"@id":"a","@type":"Work","late":7}]})).unwrap();
    assert_eq!(krate.types(), ["Work", "Person"]);
    let tables = krate.select_tables(&["Work".into()]).unwrap();
    let table = &tables.tables["Work"];
    assert_eq!(table.num_rows(), 2);
    assert_eq!(
        table
            .schema
            .fields()
            .iter()
            .map(|f| f.name().as_str())
            .collect::<Vec<_>>(),
        ["entity_id", "@type", "name", "late"]
    );
    assert_eq!(
        table.batches[0]
            .column(0)
            .as_any()
            .downcast_ref::<StringArray>()
            .unwrap()
            .value(0),
        "b"
    );
}
fn strings(table: &ldaca_rs::data::Table, column: &str) -> Vec<Option<String>> {
    table
        .batches
        .iter()
        .flat_map(|batch| {
            batch
                .column_by_name(column)
                .unwrap()
                .as_any()
                .downcast_ref::<StringArray>()
                .unwrap()
                .iter()
                .map(|value| value.map(str::to_owned))
                .collect::<Vec<_>>()
        })
        .collect()
}

fn integers(table: &ldaca_rs::data::Table, column: &str) -> Vec<Option<i64>> {
    table
        .batches
        .iter()
        .flat_map(|batch| {
            batch
                .column_by_name(column)
                .unwrap()
                .as_any()
                .downcast_ref::<arrow_array::Int64Array>()
                .unwrap()
                .iter()
                .collect::<Vec<_>>()
        })
        .collect()
}

#[test]
fn relationship_threshold_preserves_ids_and_ordinals_for_each_source() {
    for count in [9, 10, 11, 12] {
        let refs: Vec<_> = (0..count).map(|n| json!({"@id":format!("p{n}")})).collect();
        let krate = RoCrate::from_value(json!({"@graph":[
            {"@id":"first","@type":"Work","authors":refs},
            {"@id":"second","@type":"Work","authors":refs}
        ]}))
        .unwrap();
        let tables = krate.select_tables(&["Work".into()]).unwrap();
        if count > 10 {
            let table = &tables.tables["Work_authors"];
            assert_eq!(table.num_rows(), 2 * count);
            assert_eq!(
                strings(table, "source_id"),
                [
                    vec![Some("first".into()); count],
                    vec![Some("second".into()); count]
                ]
                .concat()
            );
            assert_eq!(
                integers(table, "ordinal"),
                (0..count)
                    .chain(0..count)
                    .map(|n| Some(n as i64))
                    .collect::<Vec<_>>()
            );
            assert_eq!(
                strings(table, "target_id"),
                (0..count)
                    .chain(0..count)
                    .map(|n| Some(format!("p{n}")))
                    .collect::<Vec<_>>()
            );
            assert_eq!(table.schema.metadata()["ldaca.property"], "authors");
        } else {
            assert_eq!(tables.tables.len(), 1);
            for n in 0..count {
                let column = if n == 0 {
                    "authors_id".into()
                } else {
                    format!("authors_id_{n}")
                };
                assert_eq!(
                    strings(&tables.tables["Work"], &column),
                    vec![Some(format!("p{n}")); 2]
                );
            }
        }
    }
}

#[test]
fn scalar_threshold_preserves_all_values() {
    for count in [10, 11, 12, 15] {
        let values: Vec<_> = (0..count).map(|n| json!(n)).collect();
        let krate =
            RoCrate::from_value(json!({"@graph":[{"@id":"w","@type":"Work","tags":values}]}))
                .unwrap();
        let tables = krate.select_tables(&["Work".into()]).unwrap();
        if count > 11 {
            let table = &tables.tables["Work_tags"];
            assert_eq!(strings(table, "source_id"), vec![Some("w".into()); count]);
            assert_eq!(
                integers(table, "ordinal"),
                (0..count).map(|n| Some(n as i64)).collect::<Vec<_>>()
            );
            assert_eq!(
                integers(table, "value"),
                (0..count).map(|n| Some(n as i64)).collect::<Vec<_>>()
            );
            assert_eq!(
                table.batches[0]
                    .column_by_name("target_id")
                    .unwrap()
                    .logical_null_count(),
                count
            );
        } else {
            assert_eq!(tables.tables.len(), 1);
            for n in 0..count {
                let column = if n == 0 {
                    "tags".into()
                } else {
                    format!("tags_{n}")
                };
                assert_eq!(
                    integers(&tables.tables["Work"], &column),
                    vec![Some(n as i64)]
                );
            }
        }
    }
}

#[test]
fn generated_names_cannot_hide_source_properties() {
    let krate = RoCrate::from_value(
        json!({"@graph":[{"@id":"w","@type":"Work","tag":["one","two"],"tag_1":"real"}]}),
    )
    .unwrap();
    assert!(krate
        .select_tables(&["Work".into()])
        .unwrap_err()
        .to_string()
        .contains("collision"));
}
#[test]
fn unresolved_references_and_rich_values_survive() {
    let krate=RoCrate::from_value(json!({"@graph":[{"@id":"w","@type":"Work","author":{"@id":"missing"},"name":{"@value":"Café","@language":"fr"}}]})).unwrap();
    let tables = krate.select_tables(&["Work".into()]).unwrap();
    let batch = &tables.tables["Work"].batches[0];
    let ids = batch
        .column_by_name("author_id")
        .unwrap()
        .as_any()
        .downcast_ref::<StringArray>()
        .unwrap();
    assert_eq!(ids.value(0), "missing");
    let name = batch
        .column_by_name("name")
        .unwrap()
        .as_any()
        .downcast_ref::<StringArray>()
        .unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(name.value(0)).unwrap(),
        json!({"@value":"Café","@language":"fr"})
    );
}
#[test]
fn expansions_stop_after_one_level_even_with_cycles() {
    let krate=RoCrate::from_value(json!({"@graph":[{"@id":"w","@type":"Work","author":{"@id":"p"}},{"@id":"p","@type":"Person","name":"José","work":{"@id":"w"}}]})).unwrap();
    let config =
        Config::from_value(json!({"tables":{"Work":{"expand_props":["author"]}}})).unwrap();
    let tables = krate.to_tables(&config).unwrap();
    assert!(tables.tables["Work"]
        .schema
        .field_with_name("author_work_id")
        .is_ok());
    assert_eq!(tables.tables["Work"].num_rows(), 1);
}
#[test]
fn lossless_type_inference_scans_all_rows() {
    let krate=RoCrate::from_value(json!({"@graph":[{"@id":"a","@type":"W","large":9007199254740993i64,"mixed":true},{"@id":"b","@type":"W","large":0.5,"mixed":"text","late":42}]})).unwrap();
    let table = &krate.select_tables(&["W".into()]).unwrap().tables["W"];
    assert_eq!(
        table.schema.field_with_name("large").unwrap().data_type(),
        &DataType::Utf8
    );
    assert_eq!(
        table.schema.field_with_name("mixed").unwrap().data_type(),
        &DataType::Utf8
    );
    assert_eq!(
        table.schema.field_with_name("late").unwrap().data_type(),
        &DataType::Int64
    );
    assert_eq!(
        strings(table, "large"),
        vec![Some("9007199254740993".into()), Some("0.5".into())]
    );
    assert_eq!(
        strings(table, "mixed"),
        vec![Some("true".into()), Some("text".into())]
    );
    assert_eq!(integers(table, "late"), vec![None, Some(42)]);
}

#[test]
fn compatible_numbers_promote_losslessly_with_nulls() {
    use arrow_array::Float64Array;
    for values in [
        json!([-2, 0.5, null]),
        json!([9223372036854775808u64, 0.5, null]),
    ] {
        let rows: Vec<_> = values
            .as_array()
            .unwrap()
            .iter()
            .enumerate()
            .map(|(i, value)| json!({"@id":i.to_string(), "@type":"Work", "value":value}))
            .collect();
        let tables = RoCrate::from_value(json!({"@graph":rows}))
            .unwrap()
            .select_tables(&["Work".into()])
            .unwrap();
        let array = tables.tables["Work"].batches[0]
            .column_by_name("value")
            .unwrap()
            .as_any()
            .downcast_ref::<Float64Array>()
            .unwrap();
        assert_eq!(
            array.iter().collect::<Vec<_>>(),
            vec![values[0].as_f64(), Some(0.5), None]
        );
    }
    let tables = RoCrate::from_value(json!({"@graph":[
        {"@id":"a", "@type":"Work", "value":9223372036854775809u64},
        {"@id":"b", "@type":"Work", "value":0.5},
        {"@id":"c", "@type":"Work", "value":null}
    ]}))
    .unwrap()
    .select_tables(&["Work".into()])
    .unwrap();
    assert_eq!(
        strings(&tables.tables["Work"], "value"),
        vec![Some("9223372036854775809".into()), Some("0.5".into()), None]
    );
}
#[test]
fn invalid_graphs_are_errors_and_empty_selected_types_are_tables() {
    for input in [
        json!({}),
        json!({"@graph":[3]}),
        json!({"@graph":[{}]}),
        json!({"@graph":[{"@id":"x"},{"@id":"x"}]}),
    ] {
        assert!(RoCrate::from_value(input).is_err());
    }
    let krate = RoCrate::from_value(json!({"@graph":[]})).unwrap();
    let tables = krate.select_tables(&["Person".into()]).unwrap();
    assert_eq!(tables.tables["Person"].num_rows(), 0);
    assert_eq!(
        tables.tables["Person"].schema.field(0).data_type(),
        &DataType::Utf8
    );
}
#[test]
fn wordflow_baseline_schemas_are_unchanged() {
    let baseline: Value =
        serde_json::from_str(include_str!("fixtures/wordflow-baseline.json")).unwrap();
    for fixture in baseline["fixtures"].as_array().unwrap() {
        let krate = RoCrate::from_value(fixture["metadata"].clone()).unwrap();
        let table = profiles::wordflow_metadata(
            &krate,
            "fixture",
            Some(Config::from_value(fixture["config"].clone()).unwrap()),
        )
        .unwrap();
        assert_eq!(
            table.schema_json(),
            fixture["schema"],
            "{}",
            fixture["name"]
        );
    }
}
#[test]
fn combined_expansions_move_to_companion_tables() {
    let roles: Vec<_> = (0..6).map(|n| json!(n)).collect();
    let krate = RoCrate::from_value(json!({"@graph":[
        {"@id":"w","@type":"Work","author":[{"@id":"a"},{"@id":"b"}]},
        {"@id":"a","@type":"Person","role":roles},
        {"@id":"b","@type":"Person","role":roles}
    ]}))
    .unwrap();
    let config =
        Config::from_value(json!({"tables":{"Work":{"expand_props":["author"]}}})).unwrap();
    let tables = krate.to_tables(&config).unwrap();
    assert_eq!(tables.tables["Work_author_role"].num_rows(), 12);
}

proptest::proptest! {
    #[test]
    fn repeated_unicode_values_survive_tabulation(values in proptest::collection::vec(".{0,32}", 1..25)) {
        let krate = RoCrate::from_value(json!({"@graph":[{"@id":"w","@type":"Work","tags":values}]})).unwrap();
        let tables = krate.select_tables(&["Work".into()]).unwrap();
        let actual = if values.len() > 11 {
            strings(&tables.tables["Work_tags"], "value")
        } else {
            (0..values.len()).map(|n| {
                let name = if n == 0 { "tags".into() } else { format!("tags_{n}") };
                strings(&tables.tables["Work"], &name)[0].clone()
            }).collect()
        };
        proptest::prop_assert_eq!(actual, values.into_iter().map(Some).collect::<Vec<_>>());
    }
}
