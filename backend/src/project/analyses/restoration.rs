use super::*;

/// Read compatibility never mutates saved provenance or checks live object availability.
#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
#[serde(tag = "status", rename_all = "snake_case")]
pub(crate) enum RequestRestoration {
    Supported { request: Box<RestoredRequest> },
    Unsupported { reason: String },
}
#[derive(Clone, Debug, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(tag = "kind", content = "request", rename_all = "kebab-case")]
pub(crate) enum RestoredRequest {
    Frequency(FrequencyRequest),
    Concordance(ConcordanceRequest),
    Quotation(QuotationRequest),
    TopicModeling(topic_modeling::TopicRequest),
    Annotation(Box<annotation::execution::Request>),
    Trends(plots::TrendsRequest),
    Compare(plots::CompareRequest),
    Scatter(plots::ScatterRequest),
    Heatmap(plots::HeatmapRequest),
    Sankey(plots::SankeyRequest),
}
impl RequestRestoration {
    pub(super) fn read(kind: &str, value: &Value) -> Self {
        match serde_json::from_value(serde_json::json!({"kind":kind,"request":value})) {
            Ok(request) => Self::Supported { request },
            Err(error) => Self::Unsupported {
                reason: error.to_string(),
            },
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restoration_preserves_unknown_json_and_does_not_require_live_inputs() {
        let request = serde_json::json!({"inputs":[{"source":{"schema":"data","name":"missing"},"column":"text","tokenizer":"missing"}]});
        assert!(matches!(
            RequestRestoration::read("frequency", &request),
            RequestRestoration::Supported { .. }
        ));
        let mut future = request.clone();
        future["future"] = serde_json::json!({"keep":true});
        assert!(matches!(
            RequestRestoration::read("frequency", &future),
            RequestRestoration::Unsupported { .. }
        ));
        assert_eq!(future["future"]["keep"], true);
        assert!(matches!(
            RequestRestoration::read("frequency", &serde_json::json!({"inputs":false})),
            RequestRestoration::Unsupported { .. }
        ));
    }
}

#[derive(Clone, Debug, Serialize, utoipa::ToSchema)]
#[serde(tag = "status", rename_all = "snake_case")]
pub(crate) enum SetupRestoration {
    Supported { request: annotation::ManualSetup },
    Unsupported { reason: String },
}
impl SetupRestoration {
    pub(super) fn read(value: &Value) -> Self {
        match serde_json::from_value(value.clone()) {
            Ok(request) => Self::Supported { request },
            Err(error) => Self::Unsupported {
                reason: error.to_string(),
            },
        }
    }
}
