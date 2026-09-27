//! Topic Segment construction for the topic-modeling pipeline.
//!
//! A Topic Segment is the unit embedded and clustered by the native topic-
//! modelling pipeline. Segmenting before embedding lets long documents
//! contribute several points and ultimately multi-Topic Coverage.
//!
//! Automatic mode prefers blank-line, Unicode sentence, word, and finally token
//! boundaries. Line and Sentence modes retain their semantic units and split an
//! oversized unit into complete, non-overlapping token-budgeted spans.
//!
//! Called by: `topic_modeling::run` (orchestrator) before embedding.

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use tokenizers::Tokenizer;
use unicode_segmentation::UnicodeSegmentation;

/// Selects how source documents become Topic Segments.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SegmentationMethod {
    /// Hierarchically split and pack text up to the configured token budget.
    #[default]
    Automatic,
    /// Treat every non-empty newline-delimited line as one segment.
    Line,
    /// Treat every Unicode UAX #29 sentence as one segment.
    Sentence,
}

/// One non-overlapping source span embedded and clustered as a Topic Segment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TopicSegment {
    pub doc_index: usize,
    pub start_byte: usize,
    pub end_byte: usize,
    pub owned_character_count: usize,
}

impl TopicSegment {
    pub fn text<'a>(&self, document: &'a str) -> Result<&'a str> {
        document
            .get(self.start_byte..self.end_byte)
            .with_context(|| {
                format!(
                    "Topic Segment byte range {}..{} is invalid for document {}",
                    self.start_byte, self.end_byte, self.doc_index
                )
            })
    }
}

/// Segmentation knobs. `max_tokens` is the per-segment embedding-model budget.
#[derive(Debug, Clone)]
pub struct SegmentationConfig {
    pub method: SegmentationMethod,
    pub max_tokens: usize,
}

impl Default for SegmentationConfig {
    fn default() -> Self {
        Self {
            method: SegmentationMethod::Automatic,
            max_tokens: 256,
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct TokenSpan {
    start: usize,
    end: usize,
}

#[derive(Debug, Clone, Copy)]
struct Boundary {
    token_end: usize,
    byte_end: usize,
}

struct BoundaryCursor {
    boundaries: Vec<Boundary>,
    next: usize,
}

impl BoundaryCursor {
    fn new(boundaries: Vec<Boundary>) -> Self {
        Self {
            boundaries,
            next: 0,
        }
    }

    fn latest(&mut self, token_start: usize, token_limit: usize) -> Option<Boundary> {
        while self
            .boundaries
            .get(self.next)
            .is_some_and(|boundary| boundary.token_end <= token_limit)
        {
            self.next += 1;
        }
        self.next
            .checked_sub(1)
            .and_then(|index| self.boundaries.get(index))
            .copied()
            .filter(|boundary| boundary.token_end > token_start)
    }
}

/// Split every document into token-budgeted Topic Segments.
///
/// Flow: tokenize each document once, select the configured semantic ranges,
/// and split only oversized ranges at source-faithful token boundaries. A
/// non-whitespace document always yields at least one segment (a short document
/// yields exactly one). Whitespace-only/empty documents yield zero segments; the
/// rollup stage maps those to an empty coverage value with `-1` dominant.
///
/// The `tokenizer` must have truncation disabled by the caller — otherwise the
/// sizer would cap segment sizes at the tokenizer's truncation limit instead of
/// `max_tokens`. `embedding` loads the tokenizer and clears truncation before
/// handing a clone here.
pub fn segment_documents(
    docs: &[&str],
    tokenizer: &Tokenizer,
    cfg: &SegmentationConfig,
) -> Result<Vec<TopicSegment>> {
    segment_documents_with_progress(docs, tokenizer, cfg, &mut |_, _| Ok(()))
}

/// Segment with a host-owned cancellation/progress boundary between documents.
pub fn segment_documents_with_progress(
    docs: &[&str],
    tokenizer: &Tokenizer,
    cfg: &SegmentationConfig,
    progress: &mut impl FnMut(usize, usize) -> Result<()>,
) -> Result<Vec<TopicSegment>> {
    if cfg.max_tokens == 0 {
        bail!("segmentation max_tokens must be > 0");
    }

    let mut segments = Vec::with_capacity(docs.len());
    for (doc_index, &doc) in docs.iter().enumerate() {
        progress(doc_index, docs.len())?;
        let (tokens, special_token_count) = token_spans(doc, tokenizer)?;
        let content_token_budget = cfg
            .max_tokens
            .checked_sub(special_token_count)
            .filter(|budget| *budget > 0)
            .with_context(|| {
                format!(
                    "segmentation max_tokens {} cannot fit the model's {special_token_count} special tokens",
                    cfg.max_tokens
                )
            })?;
        match cfg.method {
            SegmentationMethod::Automatic => {
                segments.extend(segment_document_automatic(
                    doc_index,
                    doc,
                    &tokens,
                    content_token_budget,
                )?);
            }
            SegmentationMethod::Line => {
                for (start, end) in line_ranges(doc) {
                    segment_line(
                        doc_index,
                        doc,
                        &tokens,
                        start,
                        end,
                        content_token_budget,
                        &mut segments,
                    )?;
                }
            }
            SegmentationMethod::Sentence => {
                for (start, sentence) in doc.split_sentence_bound_indices() {
                    split_range_by_tokens(
                        doc_index,
                        doc,
                        &tokens,
                        start,
                        start + sentence.len(),
                        content_token_budget,
                        &mut segments,
                    )?;
                }
            }
        }
    }
    Ok(segments)
}

fn token_spans(text: &str, tokenizer: &Tokenizer) -> Result<(Vec<TokenSpan>, usize)> {
    let encoding = tokenizer
        .encode(text, true)
        .map_err(|error| anyhow::anyhow!("segment tokenization failed: {error}"))?;
    if encoding.get_offsets().len() != encoding.get_special_tokens_mask().len() {
        bail!("segment tokenizer returned inconsistent offsets and special-token mask");
    }
    let special_token_count = encoding
        .get_special_tokens_mask()
        .iter()
        .filter(|&&special| special != 0)
        .count();
    let tokens = encoding
        .get_offsets()
        .iter()
        .zip(encoding.get_special_tokens_mask())
        .filter_map(|(&(start, end), &special)| (special == 0).then_some(TokenSpan { start, end }))
        .collect::<Vec<_>>();
    if tokens.iter().any(|token| {
        token.start >= token.end
            || token.end > text.len()
            || !text.is_char_boundary(token.start)
            || !text.is_char_boundary(token.end)
    }) || tokens
        .windows(2)
        .any(|pair| pair[0].start > pair[1].start || pair[0].end > pair[1].end)
    {
        bail!("segment tokenizer returned invalid or unordered byte offsets");
    }
    if tokens
        .len()
        .checked_add(special_token_count)
        .context("segment token count overflow")?
        != encoding.get_ids().len()
    {
        bail!("segment tokenizer returned a non-special token without a source span");
    }
    Ok((tokens, special_token_count))
}

fn segment_document_automatic(
    doc_index: usize,
    doc: &str,
    tokens: &[TokenSpan],
    max_tokens: usize,
) -> Result<Vec<TopicSegment>> {
    let Some((trimmed_start, trimmed_end)) = trimmed_range(doc, 0, doc.len())? else {
        return Ok(Vec::new());
    };
    if tokens.is_empty() || tokens.len() <= max_tokens {
        return Ok(vec![topic_segment(
            doc_index,
            doc,
            trimmed_start,
            trimmed_end,
        )?]);
    }

    let mut paragraph_boundaries = BoundaryCursor::new(index_boundaries(
        tokens,
        paragraph_end_offsets(doc).into_iter(),
    ));
    let mut sentence_boundaries = BoundaryCursor::new(index_boundaries(
        tokens,
        doc.split_sentence_bound_indices()
            .map(|(start, sentence)| start + sentence.len()),
    ));
    let mut word_boundaries = BoundaryCursor::new(index_boundaries(
        tokens,
        doc.split_word_bound_indices()
            .map(|(start, word)| start + word.len()),
    ));

    let mut segments = Vec::new();
    let mut token_start = 0usize;
    let mut byte_start = trimmed_start;
    while token_start < tokens.len() {
        let token_limit = (token_start + max_tokens).min(tokens.len());
        let mut boundary = paragraph_boundaries
            .latest(token_start, token_limit)
            .or_else(|| sentence_boundaries.latest(token_start, token_limit))
            .or_else(|| word_boundaries.latest(token_start, token_limit))
            .unwrap_or(Boundary {
                token_end: token_limit,
                byte_end: tokens[token_limit - 1].end,
            });
        if boundary.token_end == tokens.len() {
            boundary.byte_end = trimmed_end;
        }
        if boundary.token_end <= token_start
            || boundary.byte_end <= byte_start
            || boundary.byte_end > doc.len()
            || !doc.is_char_boundary(boundary.byte_end)
        {
            bail!("automatic segmentation could not make progress at token {token_start}");
        }

        if let Some((start, end)) = trimmed_range(doc, byte_start, boundary.byte_end)? {
            segments.push(topic_segment(doc_index, doc, start, end)?);
        }
        if boundary.token_end == tokens.len() {
            break;
        }

        byte_start = boundary.byte_end;
        token_start = boundary.token_end;
    }

    Ok(segments)
}

fn line_ranges(text: &str) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut start = 0usize;
    for line in text.split_inclusive('\n') {
        let end = start + line.strip_suffix('\n').map_or(line.len(), str::len);
        ranges.push((start, end));
        start += line.len();
    }
    if start < text.len() {
        ranges.push((start, text.len()));
    }
    ranges
}

fn segment_line(
    doc_index: usize,
    doc: &str,
    tokens: &[TokenSpan],
    start: usize,
    end: usize,
    max_tokens: usize,
    segments: &mut Vec<TopicSegment>,
) -> Result<()> {
    let Some((start, end)) = trimmed_range(doc, start, end)? else {
        return Ok(());
    };
    if tokens_in_range(tokens, start, end).len() <= max_tokens {
        segments.push(topic_segment(doc_index, doc, start, end)?);
        return Ok(());
    }

    let line = doc
        .get(start..end)
        .context("line segmentation received an invalid source range")?;
    for (relative_start, sentence) in line.split_sentence_bound_indices() {
        split_range_by_tokens(
            doc_index,
            doc,
            tokens,
            start + relative_start,
            start + relative_start + sentence.len(),
            max_tokens,
            segments,
        )?;
    }
    Ok(())
}

fn split_range_by_tokens(
    doc_index: usize,
    doc: &str,
    tokens: &[TokenSpan],
    start: usize,
    end: usize,
    max_tokens: usize,
    segments: &mut Vec<TopicSegment>,
) -> Result<()> {
    let Some((start, end)) = trimmed_range(doc, start, end)? else {
        return Ok(());
    };
    let unit_tokens = tokens_in_range(tokens, start, end);
    if unit_tokens.len() <= max_tokens || unit_tokens.is_empty() {
        segments.push(topic_segment(doc_index, doc, start, end)?);
        return Ok(());
    }

    for token_start in (0..unit_tokens.len()).step_by(max_tokens) {
        let token_end = (token_start + max_tokens).min(unit_tokens.len());
        let span_start = if token_start == 0 {
            start
        } else {
            unit_tokens[token_start].start
        };
        let span_end = unit_tokens.get(token_end).map_or(end, |token| token.start);
        if let Some((span_start, span_end)) = trimmed_range(doc, span_start, span_end)? {
            segments.push(topic_segment(doc_index, doc, span_start, span_end)?);
        }
    }
    Ok(())
}

fn tokens_in_range(tokens: &[TokenSpan], start: usize, end: usize) -> &[TokenSpan] {
    let first = tokens.partition_point(|token| token.end <= start);
    let last = tokens.partition_point(|token| token.start < end);
    &tokens[first.min(last)..last]
}

fn trimmed_range(text: &str, start: usize, end: usize) -> Result<Option<(usize, usize)>> {
    let value = text
        .get(start..end)
        .with_context(|| format!("invalid source byte range {start}..{end}"))?;
    let leading = value.len() - value.trim_start().len();
    let trailing = value.len() - value.trim_end().len();
    let start = start + leading;
    let end = end.saturating_sub(trailing);
    Ok((start < end).then_some((start, end)))
}

fn topic_segment(
    doc_index: usize,
    doc: &str,
    start_byte: usize,
    end_byte: usize,
) -> Result<TopicSegment> {
    let text = doc
        .get(start_byte..end_byte)
        .context("Topic Segment received an invalid source range")?;
    Ok(TopicSegment {
        doc_index,
        start_byte,
        end_byte,
        owned_character_count: text.chars().count(),
    })
}

fn index_boundaries(tokens: &[TokenSpan], byte_ends: impl Iterator<Item = usize>) -> Vec<Boundary> {
    let mut boundaries = Vec::<Boundary>::new();
    let mut token_end = 0usize;
    for byte_end in byte_ends {
        while tokens
            .get(token_end)
            .is_some_and(|token| token.end <= byte_end)
        {
            token_end += 1;
        }
        if token_end == 0 {
            continue;
        }
        if let Some(previous) = boundaries
            .last_mut()
            .filter(|boundary| boundary.token_end == token_end)
        {
            previous.byte_end = byte_end;
        } else {
            boundaries.push(Boundary {
                token_end,
                byte_end,
            });
        }
    }
    boundaries
}

fn paragraph_end_offsets(text: &str) -> Vec<usize> {
    let mut ends = Vec::new();
    let mut byte_offset = 0usize;
    let mut paragraph_open = false;
    let mut paragraph_end = 0usize;
    for line in text.split_inclusive('\n') {
        let line_start = byte_offset;
        byte_offset += line.len();
        let content = line.strip_suffix('\n').unwrap_or(line);
        let content = content.strip_suffix('\r').unwrap_or(content);
        if content.trim().is_empty() {
            if paragraph_open {
                ends.push(paragraph_end);
                paragraph_open = false;
            }
        } else {
            paragraph_open = true;
            paragraph_end = line_start + content.trim_end().len();
        }
    }
    if paragraph_open {
        ends.push(paragraph_end);
    }
    ends
}

#[cfg(test)]
mod tests {
    use tokenizers::models::bpe::BPE;
    use tokenizers::models::wordlevel::WordLevel;
    use tokenizers::pre_tokenizers::whitespace::WhitespaceSplit;
    use tokenizers::processors::bert::BertProcessing;

    use super::*;

    fn whitespace_tokenizer(words: &[&str]) -> Tokenizer {
        let model = WordLevel::builder()
            .vocab(
                std::iter::once((String::from("[UNK]"), 0))
                    .chain(
                        words
                            .iter()
                            .enumerate()
                            .map(|(index, word)| ((*word).to_string(), (index + 1) as u32)),
                    )
                    .collect(),
            )
            .unk_token(String::from("[UNK]"))
            .build()
            .unwrap();
        let mut tokenizer = Tokenizer::new(model);
        tokenizer.with_pre_tokenizer(Some(WhitespaceSplit));
        tokenizer
    }

    fn word_segments(doc: &str, cfg: SegmentationConfig) -> Vec<String> {
        let words = doc.split_whitespace().collect::<Vec<_>>();
        let tokenizer = whitespace_tokenizer(&words);
        segment_documents(&[doc], &tokenizer, &cfg)
            .unwrap()
            .into_iter()
            .map(|segment| segment.text(doc).unwrap().to_string())
            .collect()
    }

    fn character_tokenizer(text: &str) -> Tokenizer {
        let vocab: ahash::AHashMap<String, u32> = std::iter::once((String::from("[UNK]"), 0))
            .chain(
                text.chars()
                    .collect::<std::collections::BTreeSet<_>>()
                    .into_iter()
                    .enumerate()
                    .map(|(index, character)| (character.to_string(), (index + 1) as u32)),
            )
            .collect();
        let model = BPE::builder()
            .vocab_and_merges(vocab, Vec::new())
            .unk_token(String::from("[UNK]"))
            .build()
            .unwrap();
        Tokenizer::new(model)
    }

    fn bert_whitespace_tokenizer(words: &[&str]) -> Tokenizer {
        let mut tokenizer = whitespace_tokenizer(
            &["[CLS]", "[SEP]"]
                .into_iter()
                .chain(words.iter().copied())
                .collect::<Vec<_>>(),
        );
        let cls = tokenizer.token_to_id("[CLS]").unwrap();
        let sep = tokenizer.token_to_id("[SEP]").unwrap();
        tokenizer.with_post_processor(Some(BertProcessing::new(
            ("[SEP]".into(), sep),
            ("[CLS]".into(), cls),
        )));
        tokenizer
    }

    #[test]
    fn short_document_yields_single_segment() {
        let cfg = SegmentationConfig {
            method: SegmentationMethod::Automatic,
            max_tokens: 64,
        };
        let segments = word_segments("A short sentence about cats.", cfg);
        assert_eq!(segments.len(), 1);
        assert!(segments[0].contains("cats"));
    }

    #[test]
    fn empty_documents_produce_no_segments() {
        let cfg = SegmentationConfig::default();
        let segments = word_segments("   ", cfg);
        assert!(segments.is_empty());
    }

    #[test]
    fn paragraph_boundaries_are_first_split() {
        let cfg = SegmentationConfig {
            method: SegmentationMethod::Automatic,
            max_tokens: 3,
        };
        let segments = word_segments("alpha beta.\n\ngamma delta.", cfg);
        assert_eq!(segments, vec!["alpha beta.", "gamma delta."]);
    }

    #[test]
    fn sentence_boundaries_split_oversized_paragraphs() {
        let cfg = SegmentationConfig {
            method: SegmentationMethod::Automatic,
            max_tokens: 3,
        };
        let segments = word_segments("alpha beta. Gamma delta.", cfg);
        assert_eq!(segments, vec!["alpha beta.", "Gamma delta."]);
    }

    #[test]
    fn long_sentence_falls_back_to_token_length_segments() {
        let cfg = SegmentationConfig {
            method: SegmentationMethod::Automatic,
            max_tokens: 2,
        };
        let segments = word_segments("one two three four five", cfg);
        assert_eq!(segments, vec!["one two", "three four", "five"]);
    }

    #[test]
    fn segment_budget_includes_model_special_tokens() {
        let tokenizer = bert_whitespace_tokenizer(&["one", "two", "three", "four", "five"]);
        let cfg = SegmentationConfig {
            method: SegmentationMethod::Automatic,
            max_tokens: 4,
        };
        let doc = "one two three four five";
        let result = segment_documents(&[doc], &tokenizer, &cfg).unwrap();
        let texts = result
            .iter()
            .map(|segment| segment.text(doc).unwrap())
            .collect::<Vec<_>>();

        assert_eq!(texts, vec!["one two", "three four", "five"]);
        assert!(texts.iter().all(|text| {
            tokenizer.encode(*text, true).unwrap().get_ids().len() <= cfg.max_tokens
        }));
    }

    #[test]
    fn automatic_segments_preserve_interior_source_spacing() {
        let cfg = SegmentationConfig {
            method: SegmentationMethod::Automatic,
            max_tokens: 2,
        };
        let segments = word_segments("one \t two   three four", cfg);
        assert_eq!(segments, vec!["one \t two", "three four"]);
    }

    #[test]
    fn automatic_segments_do_not_repeat_boundary_text() {
        let cfg = SegmentationConfig {
            method: SegmentationMethod::Automatic,
            max_tokens: 4,
        };
        let segments = word_segments("a b. C d. E f.", cfg);
        assert_eq!(segments, vec!["a b. C d.", "E f."]);
    }

    #[test]
    fn cjk_sentence_punctuation_is_respected() {
        let cfg = SegmentationConfig {
            method: SegmentationMethod::Automatic,
            max_tokens: 5,
        };
        let doc = "你好世界。再见世界！";
        let tokenizer = character_tokenizer(doc);
        let segments = segment_documents(&[doc], &tokenizer, &cfg)
            .unwrap()
            .into_iter()
            .map(|segment| segment.text(doc).unwrap().to_string())
            .collect::<Vec<_>>();
        assert_eq!(segments, vec!["你好世界。", "再见世界！"]);
    }

    #[test]
    fn line_mode_recursively_splits_oversized_lines_without_losing_the_tail() {
        let tokenizer = whitespace_tokenizer(&["one", "two", "three", "four", "five"]);
        let cfg = SegmentationConfig {
            method: SegmentationMethod::Line,
            max_tokens: 2,
        };

        let doc = "one two three\n\n four five";
        let result = segment_documents(&[doc], &tokenizer, &cfg).unwrap();
        let texts = result
            .into_iter()
            .map(|segment| segment.text(doc).unwrap().to_string())
            .collect::<Vec<_>>();

        assert_eq!(texts, vec!["one two", "three", "four five"]);
    }

    #[test]
    fn sentence_mode_uses_unicode_sentence_boundaries() {
        let tokenizer = whitespace_tokenizer(&["Value", "is", "3", "14", "Next", "item"]);
        let cfg = SegmentationConfig {
            method: SegmentationMethod::Sentence,
            max_tokens: 20,
        };

        let doc = "Value is 3.14. Next item.";
        let result = segment_documents(&[doc], &tokenizer, &cfg).unwrap();
        let texts = result
            .into_iter()
            .map(|segment| segment.text(doc).unwrap().to_string())
            .collect::<Vec<_>>();

        assert_eq!(texts, vec!["Value is 3.14.", "Next item."]);
    }

    #[test]
    fn sentence_mode_uses_uax_abbreviation_boundaries_without_heuristics() {
        let tokenizer = whitespace_tokenizer(&["Mr", "Fox", "jumped"]);
        let cfg = SegmentationConfig {
            method: SegmentationMethod::Sentence,
            max_tokens: 20,
        };

        let doc = "Mr. Fox jumped.";
        let result = segment_documents(&[doc], &tokenizer, &cfg).unwrap();
        let texts = result
            .into_iter()
            .map(|segment| segment.text(doc).unwrap().to_string())
            .collect::<Vec<_>>();

        assert_eq!(texts, vec!["Mr.", "Fox jumped."]);
    }

    #[test]
    fn line_mode_preserves_utf8_and_all_oversized_content() {
        let tokenizer = whitespace_tokenizer(&["猫", "狗", "鳥"]);
        let cfg = SegmentationConfig {
            method: SegmentationMethod::Line,
            max_tokens: 2,
        };

        let doc = "猫 狗 鳥";
        let result = segment_documents(&[doc], &tokenizer, &cfg).unwrap();
        let texts = result
            .iter()
            .map(|segment| segment.text(doc).unwrap())
            .collect::<Vec<_>>();

        assert_eq!(texts, vec!["猫 狗", "鳥"]);
    }
}
