use super::*;

fn column_type<'a>(columns: &'a [(String, String)], name: &str) -> Result<&'a str> {
    columns
        .iter()
        .find(|(n, _)| n == name)
        .map(|(_, t)| t.as_str())
        .ok_or_else(|| Error::invalid(format!("Unknown column: {name}")))
}
fn numeric(kind: &str) -> bool {
    [
        "TINYINT",
        "SMALLINT",
        "INTEGER",
        "BIGINT",
        "HUGEINT",
        "UTINYINT",
        "USMALLINT",
        "UINTEGER",
        "UBIGINT",
        "UHUGEINT",
        "FLOAT",
        "DOUBLE",
    ]
    .contains(&kind)
        || kind.starts_with("DECIMAL(")
}
fn field(name: &str) -> String {
    format!("source.{}", query::quote(name))
}
fn literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}
fn category(columns: &[(String, String)], names: &[&str], uncased: bool) -> Result<String> {
    let values = names
        .iter()
        .map(|name| {
            let kind = column_type(columns, name)?;
            let value = field(name);
            // Keep exact numeric labels out of JavaScript JSON-number coercion.
            // Every category position belongs to one typed source column; NULL stays distinct.
            Ok(if uncased && kind == "VARCHAR" {
                format!("lower({value})")
            } else {
                format!("CAST({value} AS VARCHAR)")
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(format!("CAST(json_array({}) AS VARCHAR)", values.join(",")))
}
fn decimal(value: &str) -> Result<(String, usize)> {
    let unsigned = value.strip_prefix('-').unwrap_or(value);
    let mut parts = unsigned.split('.');
    let whole = parts.next().unwrap_or("");
    let fraction = parts.next().unwrap_or("");
    if whole.is_empty()
        || !whole.bytes().all(|c| c.is_ascii_digit())
        || !fraction.bytes().all(|c| c.is_ascii_digit())
        || fraction.len() > 18
        || parts.next().is_some()
    {
        return Err(Error::invalid(
            "Use a decimal number with at most 18 fractional digits",
        ));
    }
    Ok((value.into(), fraction.len()))
}
pub(super) fn validate(request: &PlotRequest, columns: &[(String, String)]) -> Result<()> {
    for name in request.columns() {
        column_type(columns, name)?;
    }
    let (measure, value) = request.measure();
    if measure != Measure::Count {
        let value = value.ok_or_else(|| Error::invalid("Select a numeric measurement column"))?;
        if !numeric(column_type(columns, value)?) {
            return Err(Error::invalid("Measurement must be numeric"));
        }
    } else if value.is_some() {
        return Err(Error::invalid("Count does not use a measurement column"));
    }
    match request {
        PlotRequest::Trends(r) => {
            if r.groups.len() > 3 {
                return Err(Error::invalid("Choose at most three grouping columns"));
            }
            let kind = column_type(columns, &r.axis)?;
            match &r.interval {
                Interval::Numeric { width, origin } => {
                    if !numeric(kind) {
                        return Err(Error::invalid("Numeric intervals require a numeric axis"));
                    }
                    let (width, _) = decimal(width)?;
                    if width.starts_with('-') || !width.bytes().any(|c| matches!(c, b'1'..=b'9')) {
                        return Err(Error::invalid("Interval width must be positive"));
                    }
                    if let Some(origin) = origin {
                        decimal(origin)?;
                    }
                }
                Interval::Time { unit, step } => {
                    if !(kind == "DATE" || kind.starts_with("TIMESTAMP")) {
                        return Err(Error::invalid(
                            "Time intervals require a date or timestamp axis",
                        ));
                    }
                    if *step == 0
                        || (*step != 1
                            && matches!(unit, TimeUnit::Month | TimeUnit::Quarter | TimeUnit::Year))
                    {
                        return Err(Error::invalid("Invalid time interval"));
                    }
                }
            }
        }
        PlotRequest::Compare(_) | PlotRequest::Sankey(_)
            if !matches!(measure, Measure::Count | Measure::Sum) =>
        {
            return Err(Error::invalid(
                "Choose Count or Sum for nonnegative weights",
            ));
        }
        PlotRequest::Scatter(r) => {
            for name in [Some(r.x.as_str()), Some(r.y.as_str()), r.size.as_deref()]
                .into_iter()
                .flatten()
            {
                if !numeric(column_type(columns, name)?) {
                    return Err(Error::invalid("Scatter axes and sizes must be numeric"));
                }
            }
        }
        _ => {}
    }
    if let PlotRequest::Sankey(r) = request
        && (r.stages.len() < 2
            || r.stages
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len()
                != r.stages.len())
    {
        return Err(Error::invalid(
            "Select at least two distinct ordered stages",
        ));
    }
    Ok(())
}
fn measurement(request: &PlotRequest) -> String {
    let (measure, value) = request.measure();
    if measure == Measure::Count {
        return "1::UBIGINT".into();
    }
    let value = field(value.unwrap_or(""));
    format!("CASE WHEN isfinite({value}) THEN {value} END")
}
/// Fixed-point integer arithmetic avoids rounding large integer axes through DOUBLE.
fn numeric_interval(
    axis: &str,
    width: &str,
    origin: Option<&str>,
    kind: &str,
    table: &str,
    bucket_ref: &str,
) -> Result<(String, String, String)> {
    if matches!(kind, "FLOAT" | "DOUBLE") {
        let width = literal(width);
        let origin = origin
            .map(literal)
            .unwrap_or_else(|| format!("(SELECT min({axis}) FROM {table} WHERE isfinite({axis}))"));
        return Ok((
            format!(
                "CASE WHEN isfinite({axis}) THEN floor(({axis}-({origin}))/CAST({width} AS DOUBLE))::BIGINT END"
            ),
            format!(
                "CAST(CAST({origin} AS DOUBLE)+{bucket_ref}*CAST({width} AS DOUBLE) AS VARCHAR)"
            ),
            "1".into(),
        ));
    }
    let (_, wscale) = decimal(width)?;
    let oscale = origin.map(decimal).transpose()?.map_or(0, |(_, s)| s);
    let source_scale = if kind.starts_with("DECIMAL(") {
        kind.trim_end_matches(')')
            .split(',')
            .next_back()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(0)
    } else if matches!(kind, "FLOAT" | "DOUBLE") {
        12
    } else {
        0
    };
    let scale = wscale.max(oscale).max(source_scale);
    let scaled = |value: &str| {
        format!(
            "CAST(replace(CAST(CAST({value} AS DECIMAL(38,{scale})) AS VARCHAR),'.','') AS HUGEINT)"
        )
    };
    let width = scaled(&literal(width));
    let origin = origin.map(|v| scaled(&literal(v))).unwrap_or_else(|| {
        format!(
            "(SELECT min({}) FROM {table} WHERE isfinite({axis}))",
            scaled(axis)
        )
    });
    let delta = format!(
        "({}-({origin}))",
        scaled(&format!("CASE WHEN isfinite({axis}) THEN {axis} END"))
    );
    let index =
        format!("(({delta}) // ({width}) - CASE WHEN ({delta}) % ({width}) < 0 THEN 1 ELSE 0 END)");
    let value = format!("({origin}) + {bucket_ref} * ({width})");
    let text = if scale == 0 {
        format!("CAST(({value}) AS VARCHAR)")
    } else {
        format!(
            "concat(CASE WHEN ({value})<0 THEN '-' ELSE '' END, CAST(abs(({value})) // {} AS VARCHAR),'.',lpad(CAST(abs(({value})) % {} AS VARCHAR),{scale},'0'))",
            "1".to_owned() + &"0".repeat(scale),
            "1".to_owned() + &"0".repeat(scale)
        )
    };
    Ok((index, text, "1".into()))
}
fn trend_interval(
    conn: &Connection,
    r: &TrendsRequest,
    columns: &[(String, String)],
    table: &str,
    bucket_ref: &str,
) -> Result<(String, String, String)> {
    let axis = field(&r.axis);
    match &r.interval {
        Interval::Numeric { width, origin } => numeric_interval(
            &axis,
            width,
            origin.as_deref(),
            column_type(columns, &r.axis)?,
            table,
            bucket_ref,
        ),
        Interval::Time { unit, step } => {
            let duration = format!("INTERVAL '{} {}'", step, unit.sql());
            let aware = column_type(columns, &r.axis)? == "TIMESTAMP WITH TIME ZONE";
            if aware {
                let exists: bool = conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM pg_timezone_names() WHERE name=?)",
                    [&r.timezone],
                    |r| r.get(0),
                )?;
                if !exists {
                    return Err(Error::invalid("Unknown timezone"));
                }
                conn.execute_batch(&format!("SET TimeZone={}", literal(&r.timezone)))?;
            }
            let timezone = if aware {
                format!(",{}", literal(&r.timezone))
            } else {
                String::new()
            };
            Ok((
                format!("time_bucket({duration},{axis}{timezone})"),
                format!("CAST({bucket_ref} AS VARCHAR)"),
                duration,
            ))
        }
    }
}
pub(super) fn row_projection(
    conn: &Connection,
    request: &PlotRequest,
    columns: &[(String, String)],
    table: &str,
    uncased: bool,
) -> Result<String> {
    let extra;
    let mut usable = "true".to_owned();
    let mut group = "'[]'".to_owned();
    let mut cell = "'[]'".to_owned();
    let mut interval = "NULL::VARCHAR".to_owned();
    match request {
        PlotRequest::Trends(r) => {
            let (bucket, text, _) = trend_interval(conn, r, columns, table, "bucket")?;
            extra = format!(",{bucket} AS bucket");
            interval = text;
            usable = format!("isfinite({})", field(&r.axis));
            group = category(
                columns,
                &r.groups.iter().map(String::as_str).collect::<Vec<_>>(),
                uncased,
            )?;
        }
        PlotRequest::Compare(r) => {
            group = category(
                columns,
                &r.stack.as_deref().into_iter().collect::<Vec<_>>(),
                uncased,
            )?;
            cell = category(
                columns,
                &std::iter::once(r.category.as_str())
                    .chain(r.stack.as_deref())
                    .collect::<Vec<_>>(),
                uncased,
            )?;
            extra = format!(
                ",{} AS category_key",
                category(columns, &[&r.category], uncased)?
            );
        }
        PlotRequest::Heatmap(r) => {
            cell = category(columns, &[&r.row, &r.column], uncased)?;
            extra = format!(
                ",{} AS category_key,{} AS column_key",
                category(columns, &[&r.row], uncased)?,
                category(columns, &[&r.column], uncased)?
            );
        }
        PlotRequest::Scatter(r) => {
            group = category(
                columns,
                &r.color.as_deref().into_iter().collect::<Vec<_>>(),
                uncased,
            )?;
            usable = format!("isfinite({}) AND isfinite({})", field(&r.x), field(&r.y));
            if let Some(size) = &r.size {
                usable.push_str(&format!(" AND isfinite({})", field(size)));
            }
            extra = format!(
                ",{} AS x,{} AS y,{} AS size,{} AS label",
                field(&r.x),
                field(&r.y),
                r.size.as_deref().map(field).unwrap_or_else(|| "1".into()),
                r.label
                    .as_deref()
                    .map(|n| format!("CAST({} AS VARCHAR)", field(n)))
                    .unwrap_or_else(|| "NULL::VARCHAR".into())
            );
        }
        PlotRequest::Sankey(r) => {
            let transitions = r
                .stages
                .windows(2)
                .enumerate()
                .map(|(i, pair)| {
                    let cats = category(columns, &[&pair[0], &pair[1]], uncased)?;
                    Ok(format!(
                        "CAST(json_array({i},CAST({cats} AS JSON)) AS VARCHAR)"
                    ))
                })
                .collect::<Result<Vec<_>>>()?;
            extra = format!(",[{}] AS transitions", transitions.join(","));
        }
    }
    Ok(format!(
        "SELECT *,{interval} AS interval_key FROM (SELECT row_id,source,{usable} AS usable,{} AS measurement,{group} AS group_key,{cell} AS cell_key{extra} FROM {table})",
        measurement(request)
    ))
}
fn aggregate(measure: Measure) -> &'static str {
    match measure {
        Measure::Count => "count(*)",
        Measure::Sum => "sum(measurement)",
        Measure::Mean => "avg(measurement)",
        Measure::Median => "median(measurement)",
    }
}
pub(super) fn chart_projection(
    conn: &Connection,
    request: &PlotRequest,
    columns: &[(String, String)],
    table: &str,
    query: &PlotQuery,
) -> Result<String> {
    let rows = row_projection(conn, request, columns, table, query.uncased)?;
    let agg = aggregate(request.measure().0);
    let common = format!(
        "WITH rows AS ({rows}), groups AS (SELECT group_key,count(*) AS group_count FROM rows WHERE usable GROUP BY group_key HAVING count(*)>={}), eligible AS (SELECT rows.*,group_count FROM rows JOIN groups USING(group_key) WHERE usable)",
        query.minimum_rows
    );
    let sql = match request {
        PlotRequest::Trends(r) => {
            let (_, text, step) = trend_interval(conn, r, columns, table, "grid.bucket")?;
            let empty = if matches!(r.measure, Measure::Count | Measure::Sum) {
                "0"
            } else {
                "NULL"
            };
            let bounds = if matches!(r.interval, Interval::Numeric { .. }) {
                "CAST(min(bucket) AS BIGINT) AS start,CAST(max(bucket) AS BIGINT) AS finish"
            } else {
                "min(bucket) AS start,max(bucket) AS finish"
            };
            // A correlated series may be eagerly materialized by DuckDB. Probe
            // scalar bounds with an uncorrelated streaming series before the join.
            let (start, finish, group_count): (Option<String>, Option<String>, u64) = conn.query_row(
                &format!("{common} SELECT CAST(min(bucket) AS VARCHAR),CAST(max(bucket) AS VARCHAR),(SELECT count(*) FROM groups) FROM rows WHERE usable"),
                [], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
            )?;
            if let (Some(start), Some(finish)) = (start, finish) {
                let kind = match r.interval {
                    Interval::Numeric { .. } => "BIGINT",
                    _ if column_type(columns, &r.axis)? == "TIMESTAMP WITH TIME ZONE" => {
                        "TIMESTAMPTZ"
                    }
                    _ => "TIMESTAMP",
                };
                let budget = 100_000 / group_count.max(1);
                let size: u64 = conn.query_row(
                    &format!("SELECT count(*) FROM (SELECT * FROM generate_series(CAST(? AS {kind}),CAST(? AS {kind}),{step}) LIMIT {})",budget+1),
                    [&start,&finish], |row| row.get(0),
                )?;
                if size > budget && group_count > 0 {
                    return Err(Error::new(
                        "display_capacity_exceeded",
                        "This interval grid exceeds 100000 plotted values. Saved rows are complete. Use wider intervals, fewer groups, or increase minimum rows per group.",
                    ));
                }
            }
            // The grid covers source bounds, even when group visibility/minimum excludes observations.
            format!(
                "{common}, bounds AS (SELECT {bounds} FROM rows WHERE usable), grid AS (SELECT bucket FROM bounds, LATERAL generate_series(start,finish,{step}) AS series(bucket)), aggregated AS (SELECT bucket,group_key,{agg} AS value,count(*) AS row_count,count(measurement) AS contributing_count FROM eligible GROUP BY bucket,group_key) SELECT {text} AS interval_key,CAST({text} AS VARCHAR) AS axis_value,g.group_key,g.group_count,CASE WHEN a.row_count IS NULL THEN {empty} ELSE a.value END AS value,coalesce(a.row_count,0)::UBIGINT AS row_count,coalesce(a.contributing_count,0)::UBIGINT AS contributing_count FROM grid CROSS JOIN groups g LEFT JOIN aggregated a ON a.bucket=grid.bucket AND a.group_key=g.group_key ORDER BY grid.bucket,g.group_key {}",
                if group_count == 0 { "LIMIT 0" } else { "" }
            )
        }
        PlotRequest::Compare(_) => format!(
            "{common}, aggregated AS (SELECT category_key,group_key,cell_key,max(group_count) AS group_count,{agg} AS value,count(*)::UBIGINT AS row_count,count(measurement)::UBIGINT AS contributing_count FROM eligible GROUP BY category_key,group_key,cell_key) SELECT *,sum(value) OVER(PARTITION BY category_key) AS category_total FROM aggregated ORDER BY category_total DESC NULLS LAST,category_key,group_key"
        ),
        PlotRequest::Heatmap(_) => format!(
            "{common} SELECT category_key,column_key,cell_key,{agg} AS value,count(*)::UBIGINT AS row_count,count(measurement)::UBIGINT AS contributing_count FROM eligible GROUP BY category_key,column_key,cell_key ORDER BY category_key,column_key"
        ),
        PlotRequest::Scatter(_) => format!(
            "{common} SELECT row_id,x,y,size,label,group_key,group_count FROM eligible ORDER BY row_id"
        ),
        PlotRequest::Sankey(_) => format!(
            "{common}, links AS (SELECT unnest(transitions) AS transition_key,measurement FROM eligible) SELECT transition_key,{agg} AS value,count(*)::UBIGINT AS row_count,count(measurement)::UBIGINT AS contributing_count FROM links GROUP BY transition_key ORDER BY transition_key"
        ),
    };
    Ok(sql)
}
pub(super) fn selection_predicate(
    request: &PlotRequest,
    query: &PlotQuery,
    selection: &PlotSelection,
) -> Result<(String, Vec<SqlValue>)> {
    let _ = query;
    let mut parameters = Vec::new();
    let mut clauses = Vec::new();
    let mut filter = |column: &str, values: &[String], exclude: bool| {
        if !values.is_empty() {
            let placeholders = values
                .iter()
                .map(|value| {
                    parameters.push(SqlValue::Text(value.clone()));
                    "?"
                })
                .collect::<Vec<_>>()
                .join(",");
            clauses.push(format!(
                "{column} {} IN ({placeholders})",
                if exclude { "NOT" } else { "" }
            ));
        }
    };
    filter("group_key", &selection.hidden, true);
    match request {
        PlotRequest::Trends(_) => filter("interval_key", &selection.intervals, false),
        PlotRequest::Scatter(_) => filter("CAST(row_id AS VARCHAR)", &selection.rows, false),
        PlotRequest::Compare(_) | PlotRequest::Heatmap(_) => {
            filter("cell_key", &selection.cells, false)
        }
        PlotRequest::Sankey(_) => {
            if !selection.transitions.is_empty() {
                let checks = selection
                    .transitions
                    .iter()
                    .map(|value| {
                        parameters.push(SqlValue::Text(value.clone()));
                        "list_contains(transitions,?)"
                    })
                    .collect::<Vec<_>>();
                clauses.push(format!("({})", checks.join(" OR ")));
            }
        }
    }
    Ok((
        if clauses.is_empty() {
            "true".into()
        } else {
            clauses.join(" AND ")
        },
        parameters,
    ))
}
