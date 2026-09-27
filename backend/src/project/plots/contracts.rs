use super::*;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum PlotMode {
    Trends,
    Compare,
    Scatter,
    Heatmap,
    Sankey,
}
impl PlotMode {
    pub fn kind(self) -> &'static str {
        match self {
            Self::Trends => "trends",
            Self::Compare => "compare",
            Self::Scatter => "scatter",
            Self::Heatmap => "heatmap",
            Self::Sankey => "sankey",
        }
    }
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Measure {
    #[default]
    Count,
    Sum,
    Mean,
    Median,
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum TimeUnit {
    Second,
    Minute,
    Hour,
    Day,
    Week,
    Month,
    Quarter,
    Year,
}
impl TimeUnit {
    pub fn sql(self) -> &'static str {
        match self {
            Self::Second => "second",
            Self::Minute => "minute",
            Self::Hour => "hour",
            Self::Day => "day",
            Self::Week => "week",
            Self::Month => "month",
            Self::Quarter => "quarter",
            Self::Year => "year",
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum Interval {
    Numeric {
        width: String,
        origin: Option<String>,
    },
    Time {
        unit: TimeUnit,
        step: u32,
    },
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct TrendsRequest {
    pub source: ObjectTarget,
    pub axis: String,
    pub groups: Vec<String>,
    pub measure: Measure,
    pub value: Option<String>,
    pub interval: Interval,
    pub timezone: String,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct CompareRequest {
    pub source: ObjectTarget,
    pub category: String,
    pub stack: Option<String>,
    pub measure: Measure,
    pub value: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct ScatterRequest {
    pub source: ObjectTarget,
    pub x: String,
    pub y: String,
    pub color: Option<String>,
    pub size: Option<String>,
    pub label: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct HeatmapRequest {
    pub source: ObjectTarget,
    pub row: String,
    pub column: String,
    pub measure: Measure,
    pub value: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct SankeyRequest {
    pub source: ObjectTarget,
    pub stages: Vec<String>,
    pub measure: Measure,
    pub value: Option<String>,
}
#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
#[serde(untagged)]
pub(crate) enum PlotRequest {
    Trends(TrendsRequest),
    Compare(CompareRequest),
    Scatter(ScatterRequest),
    Heatmap(HeatmapRequest),
    Sankey(SankeyRequest),
}
impl PlotRequest {
    pub fn decode(mode: PlotMode, value: Value) -> Result<Self> {
        Ok(match mode {
            PlotMode::Trends => Self::Trends(serde_json::from_value(value)?),
            PlotMode::Compare => Self::Compare(serde_json::from_value(value)?),
            PlotMode::Scatter => Self::Scatter(serde_json::from_value(value)?),
            PlotMode::Heatmap => Self::Heatmap(serde_json::from_value(value)?),
            PlotMode::Sankey => Self::Sankey(serde_json::from_value(value)?),
        })
    }
    pub fn source(&self) -> &ObjectTarget {
        match self {
            Self::Trends(r) => &r.source,
            Self::Compare(r) => &r.source,
            Self::Scatter(r) => &r.source,
            Self::Heatmap(r) => &r.source,
            Self::Sankey(r) => &r.source,
        }
    }
    pub fn columns(&self) -> Vec<&str> {
        match self {
            Self::Trends(r) => std::iter::once(r.axis.as_str())
                .chain(r.groups.iter().map(String::as_str))
                .chain(r.value.as_deref())
                .collect(),
            Self::Compare(r) => std::iter::once(r.category.as_str())
                .chain(r.stack.as_deref())
                .chain(r.value.as_deref())
                .collect(),
            Self::Scatter(r) => [
                Some(r.x.as_str()),
                Some(r.y.as_str()),
                r.color.as_deref(),
                r.size.as_deref(),
                r.label.as_deref(),
            ]
            .into_iter()
            .flatten()
            .collect(),
            Self::Heatmap(r) => [
                Some(r.row.as_str()),
                Some(r.column.as_str()),
                r.value.as_deref(),
            ]
            .into_iter()
            .flatten()
            .collect(),
            Self::Sankey(r) => r
                .stages
                .iter()
                .map(String::as_str)
                .chain(r.value.as_deref())
                .collect(),
        }
    }
    pub fn measure(&self) -> (Measure, Option<&str>) {
        match self {
            Self::Trends(r) => (r.measure, r.value.as_deref()),
            Self::Compare(r) => (r.measure, r.value.as_deref()),
            Self::Heatmap(r) => (r.measure, r.value.as_deref()),
            Self::Sankey(r) => (r.measure, r.value.as_deref()),
            Self::Scatter(_) => (Measure::Count, None),
        }
    }
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct PlotQuery {
    #[serde(default)]
    pub uncased: bool,
    #[serde(default)]
    pub minimum_rows: u64,
}
/// Selection keys come from the projection, never from freshly read source positions.
#[derive(Clone, Debug, Default, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct PlotSelection {
    #[serde(default)]
    pub hidden: Vec<String>,
    #[serde(default)]
    pub intervals: Vec<String>,
    #[serde(default)]
    pub cells: Vec<String>,
    #[serde(default)]
    pub rows: Vec<String>,
    #[serde(default)]
    pub transitions: Vec<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub(crate) struct PlotPublish {
    pub name: String,
    pub columns: Vec<String>,
    pub query: PlotQuery,
    pub selection: PlotSelection,
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
pub(crate) struct PlotResultV1 {
    #[serde(default)]
    pub field_bindings: std::collections::BTreeMap<String, String>,
    pub rows: Uuid,
    pub source: ObjectTarget,
    pub columns: Vec<(String, String)>,
    pub document_column: Option<String>,
    pub row_count: u64,
    pub usable_rows: u64,
    pub omitted_measurements: u64,
    pub nonnegative: bool,
}
