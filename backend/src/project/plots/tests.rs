use super::*;
use serde_json::json;
fn setup(mode: PlotMode, request: Value, sql: &str) -> (Project, Uuid) {
    let mut p = Project::untitled().unwrap();
    p.database.conn.execute_batch(sql).unwrap();
    p.database
        .conn
        .execute_batch(
            "INSERT INTO wordflow.nodes(table_name) VALUES ('corpus') ON CONFLICT DO NOTHING",
        )
        .unwrap();
    let tab = p
        .database
        .create_analysis_tab(CreateTab {
            kind: mode.kind().into(),
            name: None,
        })
        .unwrap();
    let id = p
        .database
        .begin_analysis_run(tab.id, mode.kind(), request.clone())
        .unwrap();
    p.database
        .run_plot(
            tab.id,
            id,
            mode,
            PlotRequest::decode(mode, request).unwrap(),
            |_| {},
        )
        .unwrap();
    (p, id)
}
fn rows(p: &Project, id: Uuid, mode: PlotMode, q: PlotQuery) -> Vec<Vec<String>> {
    let (request, result, relation) = saved(&p.database.conn, id, mode).unwrap();
    let sql = chart_projection(
        &p.database.conn,
        &request,
        &result.columns,
        &relation.sql(),
        &q,
    )
    .unwrap();
    let mut stmt = p.database.conn.prepare(&sql).unwrap();
    let n = stmt.query_arrow([]).unwrap().get_schema().fields().len();
    let sql = format!("SELECT {} FROM ({sql})", "CAST(COLUMNS(*) AS VARCHAR)");
    let mut stmt = p.database.conn.prepare(&sql).unwrap();
    let mut cursor = stmt.query([]).unwrap();
    let mut result = Vec::new();
    while let Some(row) = cursor.next().unwrap() {
        result.push(
            (0..n)
                .map(|i| {
                    row.get::<_, Option<String>>(i)
                        .unwrap()
                        .unwrap_or("NULL".into())
                })
                .collect(),
        );
    }
    result
}
#[test]
fn compare_snapshot_case_merging_and_publication_keep_original_rows() {
    let (mut p, id) = setup(
        PlotMode::Compare,
        json!({"source":{"name":"corpus"},"category":"party","stack":"stance","measure":"sum","value":"weight"}),
        "CREATE TABLE data.corpus(party VARCHAR,stance VARCHAR,weight INTEGER,note VARCHAR); INSERT INTO data.corpus VALUES ('A','Yes',1,'first'),('a','yes',9,'second'),(NULL,'',2,'third'); INSERT INTO wordflow.nodes(table_name) VALUES ('corpus')",
    );
    let q = PlotQuery {
        uncased: true,
        ..Default::default()
    };
    let projected = rows(&p, id, PlotMode::Compare, q.clone());
    assert_eq!(projected.len(), 2);
    assert!(projected.iter().any(|r| r[4] == "10"));
    p.database
        .conn
        .execute_batch("DROP TABLE data.corpus")
        .unwrap();
    p.database
        .publish_plot(
            id,
            PlotMode::Compare,
            PlotPublish {
                name: "chosen".into(),
                columns: vec!["note".into()],
                query: q,
                selection: PlotSelection {
                    cells: vec!["[\"a\",\"yes\"]".into()],
                    ..Default::default()
                },
            },
        )
        .unwrap();
    assert_eq!(
        p.database
            .conn
            .query_row(
                "SELECT string_agg(note,',' ORDER BY weight) FROM data.chosen",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
        "first,second"
    );
}
#[test]
fn heatmap_merges_measurements_before_mean_and_preserves_null_category() {
    let (p, id) = setup(
        PlotMode::Heatmap,
        json!({"source":{"name":"corpus"},"row":"r","column":"c","measure":"mean","value":"v"}),
        "CREATE TABLE data.corpus(r VARCHAR,c VARCHAR,v DOUBLE); INSERT INTO data.corpus VALUES ('A','X',1),('a','X',3),('a','X',8),(NULL,'X',NULL),('','X',4)",
    );
    let projected = rows(
        &p,
        id,
        PlotMode::Heatmap,
        PlotQuery {
            uncased: true,
            ..Default::default()
        },
    );
    assert_eq!(projected.len(), 3);
    assert!(projected.iter().any(|r| r[0] == "[\"a\"]" && r[3] == "4.0"));
}
#[test]
fn sankey_transition_union_deduplicates_rows() {
    let (mut p, id) = setup(
        PlotMode::Sankey,
        json!({"source":{"name":"corpus"},"stages":["a","b","c"],"measure":"count","value":null}),
        "CREATE TABLE data.corpus(a VARCHAR,b VARCHAR,c VARCHAR); INSERT INTO data.corpus VALUES ('x','y','z'),('x','q','z'),(NULL,'y','z')",
    );
    assert_eq!(
        rows(&p, id, PlotMode::Sankey, PlotQuery::default()).len(),
        5
    );
    p.database
        .publish_plot(
            id,
            PlotMode::Sankey,
            PlotPublish {
                name: "chosen".into(),
                columns: vec![],
                query: PlotQuery::default(),
                selection: PlotSelection {
                    transitions: vec!["[0,[\"x\",\"y\"]]".into(), "[1,[\"y\",\"z\"]]".into()],
                    ..Default::default()
                },
            },
        )
        .unwrap();
    assert_eq!(
        p.database
            .conn
            .query_row("SELECT count(*) FROM data.chosen", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        2
    );
}
#[test]
fn numeric_trends_fill_gaps_and_keep_large_integer_bins_distinct() {
    let (p, id) = setup(
        PlotMode::Trends,
        json!({"source":{"name":"corpus"},"axis":"x","groups":[],"measure":"count","value":null,"interval":{"type":"numeric","width":"1","origin":null},"timezone":"UTC"}),
        "CREATE TABLE data.corpus(x UBIGINT); INSERT INTO data.corpus VALUES (9007199254740993),(9007199254740995)",
    );
    let projected = rows(&p, id, PlotMode::Trends, PlotQuery::default());
    assert_eq!(projected.len(), 3);
    assert_eq!(projected[0][0], "9007199254740993");
    assert_eq!(projected[1][4], "0");
    assert_eq!(projected[2][0], "9007199254740995");
}
#[test]
fn scatter_duplicate_points_have_distinct_row_identity() {
    let (p, id) = setup(
        PlotMode::Scatter,
        json!({"source":{"name":"corpus"},"x":"x","y":"y","color":null,"size":null,"label":null}),
        "CREATE TABLE data.corpus(x INTEGER,y INTEGER); INSERT INTO data.corpus VALUES (1,2),(1,2),(NULL,2)",
    );
    let projected = rows(&p, id, PlotMode::Scatter, PlotQuery::default());
    assert_eq!(projected.len(), 2);
    assert_ne!(projected[0][0], projected[1][0]);
}
#[test]
fn daily_trends_fill_empty_days_but_all_null_measurements_are_gaps() {
    let (p, id) = setup(
        PlotMode::Trends,
        json!({"source":{"name":"corpus"},"axis":"date","groups":[],"measure":"sum","value":"v","interval":{"type":"time","unit":"day","step":1},"timezone":"UTC"}),
        "CREATE TABLE data.corpus(date DATE,v INTEGER); INSERT INTO data.corpus VALUES ('2026-01-01',1),('2026-01-03',NULL)",
    );
    let projected = rows(&p, id, PlotMode::Trends, PlotQuery::default());
    assert_eq!(projected.len(), 3);
    assert_eq!(projected[1][4], "0");
    assert_eq!(projected[2][4], "NULL");
}
#[test]
fn numeric_bins_handle_negative_fractional_widths_and_missing_values() {
    let (p, id) = setup(
        PlotMode::Trends,
        json!({"source":{"name":"corpus"},"axis":"bucket","groups":[],"measure":"count","value":null,"interval":{"type":"numeric","width":"0.5","origin":"0"},"timezone":"UTC"}),
        "CREATE TABLE data.corpus(bucket DECIMAL(20,2)); INSERT INTO data.corpus VALUES (-0.1),(0.6),(NULL)",
    );
    let projected = rows(&p, id, PlotMode::Trends, PlotQuery::default());
    assert_eq!(projected.len(), 3);
    assert_eq!(projected[0][0], "-0.50");
    assert_eq!(projected[2][0], "0.50");
}
#[test]
fn floating_axes_skip_nonfinite_values_without_rounding_small_values_to_zero() {
    let (p, id) = setup(
        PlotMode::Trends,
        json!({"source":{"name":"corpus"},"axis":"x","groups":[],"measure":"count","value":null,"interval":{"type":"numeric","width":"0.00000000000001","origin":"0"},"timezone":"UTC"}),
        "CREATE TABLE data.corpus(x DOUBLE); INSERT INTO data.corpus VALUES (0.00000000000001),(0.00000000000003),('NaN'),('Infinity')",
    );
    let projected = rows(&p, id, PlotMode::Trends, PlotQuery::default());
    assert_eq!(projected.len(), 3);
}
#[test]
fn empty_source_is_a_completed_empty_plot() {
    let (p, id) = setup(
        PlotMode::Trends,
        json!({"source":{"name":"corpus"},"axis":"x","groups":[],"measure":"count","value":null,"interval":{"type":"numeric","width":"1","origin":null},"timezone":"UTC"}),
        "CREATE TABLE data.corpus(x INTEGER)",
    );
    assert!(rows(&p, id, PlotMode::Trends, PlotQuery::default()).is_empty());
    assert!(p.database.analysis(id).unwrap().result.is_some());
}

#[test]
fn merged_median_uses_observations_and_minimum_counts_the_whole_group() {
    let (p, id) = setup(
        PlotMode::Trends,
        json!({"source":{"name":"corpus"},"axis":"x","groups":["g"],"measure":"median","value":"v","interval":{"type":"numeric","width":"1","origin":null},"timezone":"UTC"}),
        "CREATE TABLE data.corpus(x INTEGER,g VARCHAR,v INTEGER); INSERT INTO data.corpus VALUES (0,'A',1),(0,'A',3),(0,'a',100),(2,'a',10),(0,'B',99)",
    );
    let output = rows(
        &p,
        id,
        PlotMode::Trends,
        PlotQuery {
            uncased: true,
            minimum_rows: 4,
        },
    );
    assert_eq!(output.len(), 3);
    assert_eq!(output[0][4], "3.0");
    assert_eq!(output[1][4], "NULL");
    assert_eq!(output[2][4], "10.0");
}

#[test]
fn publication_copies_annotations_and_clear_keeps_request_without_touching_published_rows() {
    let (mut p, id) = setup(
        PlotMode::Scatter,
        json!({"source":{"name":"corpus"},"x":"x","y":"y","color":null,"size":null,"label":"source"}),
        "CREATE TABLE data.corpus(x INTEGER,y INTEGER,source VARCHAR,row_id INTEGER); INSERT INTO data.corpus VALUES (1,2,'original',42); INSERT INTO wordflow.arrow_metadata(schema_name,relation_name,field_path,extension_name,extension_metadata) VALUES ('data','corpus','[\"source\"]','example.text','opaque payload')",
    );
    p.database
        .publish_plot(
            id,
            PlotMode::Scatter,
            PlotPublish {
                name: "published".into(),
                columns: vec!["row_id".into()],
                query: PlotQuery::default(),
                selection: PlotSelection::default(),
            },
        )
        .unwrap();
    let metadata:String=p.database.conn.query_row("SELECT extension_metadata FROM wordflow.arrow_metadata WHERE schema_name='data' AND relation_name='published'",[],|r|r.get(0)).unwrap();
    assert_eq!(metadata, "opaque payload");
    let tab = read_analysis(&p.database.conn, id).unwrap().tab_id;
    p.database.clear_analysis_tab(tab).unwrap();
    let retained = read_analysis(&p.database.conn, id).unwrap();
    assert!(retained.result.is_none());
    assert_eq!(retained.request["label"], "source");
    assert_eq!(
        p.database
            .conn
            .query_row("SELECT row_id FROM data.published", [], |r| r
                .get::<_, i32>(0))
            .unwrap(),
        42
    );
}

#[test]
fn compare_orders_large_exact_totals_and_preserves_numeric_category_identity() {
    let (p, id) = setup(
        PlotMode::Compare,
        json!({"source":{"name":"corpus"},"category":"category","stack":null,"measure":"sum","value":"weight"}),
        "CREATE TABLE data.corpus(category BIGINT,weight BIGINT); INSERT INTO data.corpus VALUES (9007199254740992,9007199254740992),(9007199254740993,9007199254740993)",
    );
    let output = rows(&p, id, PlotMode::Compare, PlotQuery::default());
    assert_eq!(output[0][0], "[\"9007199254740993\"]");
    assert_eq!(output[1][0], "[\"9007199254740992\"]");
}

#[test]
fn capacity_rejects_display_without_truncating_saved_rows_or_publication() {
    let (mut p, id) = setup(
        PlotMode::Scatter,
        json!({"source":{"name":"corpus"},"x":"x","y":"y","color":null,"size":null,"label":null}),
        "CREATE TABLE data.corpus AS SELECT i AS x,i AS y FROM range(100001) t(i)",
    );
    let error = p
        .database
        .plot_page(id, PlotMode::Scatter, PlotQuery::default())
        .unwrap_err();
    assert!(error.to_string().contains("100000"));
    p.database.conn.execute_batch("ROLLBACK").unwrap();
    let (_, result, _) = saved(&p.database.conn, id, PlotMode::Scatter).unwrap();
    assert_eq!(result.row_count, 100001);
    p.database
        .publish_plot(
            id,
            PlotMode::Scatter,
            PlotPublish {
                name: "complete".into(),
                columns: vec![],
                query: PlotQuery::default(),
                selection: PlotSelection::default(),
            },
        )
        .unwrap();
    assert_eq!(
        p.database
            .conn
            .query_row("SELECT count(*) FROM data.complete", [], |r| r
                .get::<_, u64>(0))
            .unwrap(),
        100001
    );
}

#[test]
#[ignore = "synthetic million-row snapshot and publication benchmark"]
fn million_row_snapshot_projection_and_publication() {
    let started = std::time::Instant::now();
    let (mut p, id) = setup(
        PlotMode::Trends,
        json!({"source":{"name":"corpus"},"axis":"x","groups":["g"],"measure":"count","value":null,"interval":{"type":"numeric","width":"1","origin":null},"timezone":"UTC"}),
        "CREATE TABLE data.corpus AS SELECT i%100 AS x,(i%10)::VARCHAR AS g,'document ' || i::VARCHAR AS text FROM range(1000000) t(i)",
    );
    let captured = started.elapsed();
    let output = p
        .database
        .plot_page(id, PlotMode::Trends, PlotQuery::default())
        .unwrap();
    assert!(output.as_file().metadata().unwrap().len() > 0);
    let queried = started.elapsed();
    p.database
        .publish_plot(
            id,
            PlotMode::Trends,
            PlotPublish {
                name: "selected".into(),
                columns: vec!["text".into()],
                query: PlotQuery::default(),
                selection: PlotSelection {
                    intervals: vec!["0".into()],
                    ..Default::default()
                },
            },
        )
        .unwrap();
    assert_eq!(
        p.database
            .conn
            .query_row("SELECT count(*) FROM data.selected", [], |r| r
                .get::<_, u64>(0))
            .unwrap(),
        10000
    );
    eprintln!(
        "PLOTS_MEMORY_BENCHMARK capture {:?}, query {:?}, publication {:?}",
        captured,
        queried - captured,
        started.elapsed() - queried
    );
}

#[test]
fn distant_observations_reject_an_excessive_empty_interval_grid() {
    let (p, id) = setup(
        PlotMode::Trends,
        json!({"source":{"name":"corpus"},"axis":"x","groups":[],"measure":"count","value":null,"interval":{"type":"numeric","width":"1","origin":null},"timezone":"UTC"}),
        "CREATE TABLE data.corpus(x BIGINT); INSERT INTO data.corpus VALUES (0),(1000000000000)",
    );
    let (request, result, relation) = saved(&p.database.conn, id, PlotMode::Trends).unwrap();
    let error = chart_projection(
        &p.database.conn,
        &request,
        &result.columns,
        &relation.sql(),
        &PlotQuery::default(),
    )
    .unwrap_err();
    assert_eq!(error.code, "display_capacity_exceeded");
}

#[test]
fn app_renames_rebase_requests_without_changing_saved_plot_bindings() {
    let (mut p, id) = setup(
        PlotMode::Compare,
        json!({"source":{"name":"corpus"},"category":"party","stack":null,"measure":"count","value":null}),
        "CREATE TABLE data.corpus(party VARCHAR); INSERT INTO data.corpus VALUES ('A'),('B')",
    );
    let before = rows(&p, id, PlotMode::Compare, PlotQuery::default());
    for (from, to) in [("party", "group"), ("group", "renamed")] {
        p.database
            .change_column(
                "corpus".into(),
                mutations::ColumnChange::Rename {
                    column: from.into(),
                    name: to.into(),
                },
            )
            .unwrap();
        assert_eq!(
            rows(&p, id, PlotMode::Compare, PlotQuery::default()),
            before
        );
        assert_eq!(p.database.analysis(id).unwrap().request["category"], to);
    }
    p.database.rename_node("corpus", "new corpus").unwrap();
    assert_eq!(
        rows(&p, id, PlotMode::Compare, PlotQuery::default()),
        before
    );
    assert_eq!(
        p.database.analysis(id).unwrap().request["source"]["name"],
        "new corpus"
    );
}
