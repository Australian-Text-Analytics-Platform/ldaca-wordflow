//! JSON contracts at the application boundary; the fitting library stays transport-independent.
use ldaca_rs::topic_modeling::{self as engine, projection, segmentation};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SegmentationMethod {
    #[default]
    Automatic,
    Line,
    Sentence,
}
impl From<SegmentationMethod> for segmentation::SegmentationMethod {
    fn from(value: SegmentationMethod) -> Self {
        match value {
            SegmentationMethod::Automatic => Self::Automatic,
            SegmentationMethod::Line => Self::Line,
            SegmentationMethod::Sentence => Self::Sentence,
        }
    }
}
#[derive(Serialize, utoipa::ToSchema)]
pub(crate) struct RepresentativeWord {
    pub word: String,
    pub occurrence_count: usize,
}
impl From<engine::RepresentativeWord> for RepresentativeWord {
    fn from(value: engine::RepresentativeWord) -> Self {
        Self {
            word: value.word,
            occurrence_count: value.occurrence_count,
        }
    }
}
#[derive(Serialize, utoipa::ToSchema)]
pub(crate) struct TopicInfo {
    id: i32,
    representative_words: Vec<RepresentativeWord>,
    x: f32,
    y: f32,
}
#[derive(Serialize, utoipa::ToSchema)]
pub(crate) struct TopicProjectionBasis {
    topics: Vec<TopicInfo>,
    #[schema(value_type = Vec<(usize, usize, usize, usize)>)]
    activations: Vec<[usize; 4]>,
    has_outlier: bool,
}
impl From<projection::TopicProjectionBasis> for TopicProjectionBasis {
    fn from(value: projection::TopicProjectionBasis) -> Self {
        Self {
            topics: value
                .topics
                .into_iter()
                .map(|topic| TopicInfo {
                    id: topic.id,
                    x: topic.x,
                    y: topic.y,
                    representative_words: topic
                        .representative_words
                        .into_iter()
                        .map(Into::into)
                        .collect(),
                })
                .collect(),
            activations: value.activations,
            has_outlier: value.has_outlier,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transport_preserves_engine_json() {
        let basis = projection::TopicProjectionBasis {
            topics: vec![engine::TopicInfo {
                id: 2,
                representative_words: vec![
                    serde_json::from_value(serde_json::json!({
                        "word": "研究", "occurrence_count": 17
                    }))
                    .unwrap(),
                ],
                x: 1.25,
                y: -2.5,
            }],
            activations: vec![[0, 2, 1, 17]],
            has_outlier: true,
        };
        let original = serde_json::to_value(&basis).unwrap();
        assert_eq!(
            original,
            serde_json::to_value(TopicProjectionBasis::from(basis)).unwrap()
        );
        for method in [
            SegmentationMethod::Automatic,
            SegmentationMethod::Line,
            SegmentationMethod::Sentence,
        ] {
            assert_eq!(
                serde_json::to_value(method).unwrap(),
                serde_json::to_value(segmentation::SegmentationMethod::from(method)).unwrap()
            );
        }
    }
}
