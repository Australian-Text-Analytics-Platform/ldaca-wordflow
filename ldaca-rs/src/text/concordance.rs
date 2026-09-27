use crate::offsets::byte_spans_to_char_spans;
use crate::tokenizer::tokenize_plain_text_with_offsets;
use crate::tokenizer::Token;
use anyhow::Result;
use caseless::Caseless;
use regex::RegexBuilder;
use std::collections::HashSet;

/// Matching and context-window options. Offsets refer to original input characters.
#[derive(Debug, Clone)]
pub struct ConcordanceOptions {
    pub left_tokens: usize,
    pub right_tokens: usize,
    pub regex: bool,
    pub case_sensitive: bool,
    pub ignore_punctuation: bool,
}
impl Default for ConcordanceOptions {
    fn default() -> Self {
        Self {
            left_tokens: 5,
            right_tokens: 5,
            regex: false,
            case_sensitive: false,
            ignore_punctuation: false,
        }
    }
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConcordanceMatch {
    pub left_context: String,
    pub matched_text: String,
    pub right_context: String,
    pub start_idx: i64,
    pub end_idx: i64,
    pub l1: String,
    pub r1: String,
}
/// A query compiled once and reused across documents. Empty queries yield no matches.
pub struct Concordance {
    matcher: regex::Regex,
    options: ConcordanceOptions,
    empty: bool,
}
impl Concordance {
    /// Whole-word literals share the same regex engine and Unicode boundaries.
    pub fn literal_whole_word(query: &str, mut options: ConcordanceOptions) -> Result<Self> {
        if query.is_empty() {
            return Self::new(query, options);
        }
        options.regex = true;
        Self::new(&format!(r"\b(?:{})\b", regex::escape(query)), options)
    }
    pub fn new(query: &str, options: ConcordanceOptions) -> Result<Self> {
        let pattern = if options.regex {
            query.to_owned()
        } else {
            regex::escape(query)
        };
        let matcher = RegexBuilder::new(&pattern)
            .case_insensitive(!options.case_sensitive)
            .build()?;
        Ok(Self {
            matcher,
            options,
            empty: query.is_empty(),
        })
    }
    pub fn find(&self, text: &str) -> Result<Vec<ConcordanceMatch>> {
        if self.empty {
            return Ok(Vec::new());
        }
        find_matches(text, &self.matcher, &self.options)
    }
}

/// Exact alternatives over tokenizer output, retaining original-text context.
pub struct TokenConcordance {
    alternatives: HashSet<String>,
    options: ConcordanceOptions,
}
impl TokenConcordance {
    pub fn new(query: &str, options: ConcordanceOptions) -> Self {
        let alternatives = query
            .split(|c: char| c.is_whitespace() || c == ',' || c == '|')
            .filter(|word| !word.is_empty())
            .map(|word| {
                if options.case_sensitive {
                    word.to_owned()
                } else {
                    word.chars().default_case_fold().collect()
                }
            })
            .collect();
        Self {
            alternatives,
            options,
        }
    }
    pub fn find(&self, text: &str, tokens: &[Token]) -> Result<Vec<ConcordanceMatch>> {
        let offsets: Vec<_> = text
            .char_indices()
            .map(|(i, _)| i)
            .chain(std::iter::once(text.len()))
            .collect();
        for token in tokens {
            anyhow::ensure!(
                token.start >= 0
                    && token.end >= token.start
                    && (token.end as usize) < offsets.len(),
                "Invalid tokenizer character offsets"
            );
        }
        anyhow::ensure!(
            tokens
                .windows(2)
                .all(|pair| pair[0].start <= pair[1].start && pair[0].end <= pair[1].end),
            "Tokenizer offsets are not ordered"
        );
        let mut hits = Vec::new();
        for (i, token) in tokens.iter().enumerate() {
            let key = if self.options.case_sensitive {
                token.token.clone()
            } else {
                token.token.chars().default_case_fold().collect()
            };
            if !self.alternatives.contains(&key) {
                continue;
            }
            let left = i.saturating_sub(self.options.left_tokens);
            let right = (i + self.options.right_tokens).min(tokens.len() - 1);
            hits.push(ConcordanceMatch {
                left_context: text
                    [offsets[tokens[left].start as usize]..offsets[token.start as usize]]
                    .to_owned(),
                matched_text: token.token.clone(),
                right_context: text
                    [offsets[token.end as usize]..offsets[tokens[right].end as usize]]
                    .to_owned(),
                start_idx: token.start,
                end_idx: token.end,
                l1: i
                    .checked_sub(1)
                    .map(|n| tokens[n].token.clone())
                    .unwrap_or_default(),
                r1: tokens
                    .get(i + 1)
                    .map(|t| t.token.clone())
                    .unwrap_or_default(),
            });
        }
        Ok(hits)
    }
}

#[derive(Debug)]
struct SourceToken {
    text: String,
    start: usize,
    end: usize,
}

fn source_tokens(text: &str, ignore_punctuation: bool) -> Result<Vec<SourceToken>> {
    let char_count = text.chars().count();
    tokenize_plain_text_with_offsets(text, false, ignore_punctuation)
        .into_iter()
        .map(|(token, start, end)| {
            let start = usize::try_from(start)
                .map_err(|_| anyhow::anyhow!("tokenizer returned a negative start offset"))?;
            let end = usize::try_from(end)
                .map_err(|_| anyhow::anyhow!("tokenizer returned a negative end offset"))?;
            if start > end || end > char_count {
                anyhow::bail!(
                    "tokenizer returned invalid character span {start}..{end} for {char_count} characters"
                );
            }
            Ok(SourceToken {
                text: token,
                start,
                end,
            })
        })
        .collect()
}

fn offset_fragment_tokens(
    fragment: &str,
    start_offset: usize,
    ignore_punctuation: bool,
) -> Result<Vec<SourceToken>> {
    let mut tokens = source_tokens(fragment, ignore_punctuation)?;
    for token in &mut tokens {
        token.start += start_offset;
        token.end += start_offset;
    }
    Ok(tokens)
}

struct ContextWindow {
    context_start: Option<usize>,
    context_end: Option<usize>,
    adjacent_left: String,
    adjacent_right: String,
}

struct ContextRequest<'a> {
    text: &'a str,
    char_to_byte: &'a [usize],
    tokens: &'a [SourceToken],
    match_chars: (usize, usize),
    complete_tokens: (usize, usize),
    take: (usize, usize),
    ignore_punctuation: bool,
}

fn raw_context_window(request: ContextRequest<'_>) -> Result<ContextWindow> {
    let ContextRequest {
        text,
        char_to_byte,
        tokens,
        match_chars: (start_char, end_char),
        complete_tokens: (left_complete_end, right_complete_start),
        take: (left_take, right_take),
        ignore_punctuation,
    } = request;
    let left_fragment = tokens
        .get(left_complete_end)
        .filter(|token| token.start < start_char && start_char < token.end)
        .map_or(Ok(Vec::new()), |token| {
            let fragment = &text[char_to_byte[token.start]..char_to_byte[start_char]];
            offset_fragment_tokens(fragment, token.start, ignore_punctuation)
        })?;
    let left_fragment_take = left_take.min(left_fragment.len());
    let left_full_take = left_take.saturating_sub(left_fragment_take);
    let left_full_start = left_complete_end.saturating_sub(left_full_take);
    let context_start = if left_take == 0 {
        None
    } else if left_full_start < left_complete_end {
        Some(tokens[left_full_start].start)
    } else {
        left_fragment
            .get(left_fragment.len().saturating_sub(left_fragment_take))
            .map(|token| token.start)
    };
    let adjacent_left = if left_fragment_take > 0 {
        left_fragment
            .last()
            .map(|token| token.text.clone())
            .unwrap_or_default()
    } else {
        left_complete_end
            .checked_sub(1)
            .and_then(|index| tokens.get(index))
            .filter(|_| left_full_take > 0)
            .map(|token| token.text.clone())
            .unwrap_or_default()
    };

    let right_intersecting = right_complete_start
        .checked_sub(1)
        .and_then(|index| tokens.get(index))
        .filter(|token| token.start < end_char && end_char < token.end);
    let right_fragment = right_intersecting.map_or(Ok(Vec::new()), |token| {
        let fragment = &text[char_to_byte[end_char]..char_to_byte[token.end]];
        offset_fragment_tokens(fragment, end_char, ignore_punctuation)
    })?;
    let right_fragment_take = right_take.min(right_fragment.len());
    let right_full_take = right_take.saturating_sub(right_fragment_take);
    let right_full_end = (right_complete_start + right_full_take).min(tokens.len());
    let context_end = if right_take == 0 {
        None
    } else if right_full_end > right_complete_start {
        Some(tokens[right_full_end - 1].end)
    } else {
        right_fragment
            .get(right_fragment_take.saturating_sub(1))
            .map(|token| token.end)
    };
    let adjacent_right = if right_fragment_take > 0 {
        right_fragment
            .first()
            .map(|token| token.text.clone())
            .unwrap_or_default()
    } else {
        tokens
            .get(right_complete_start)
            .filter(|_| right_full_take > 0)
            .map(|token| token.text.clone())
            .unwrap_or_default()
    };

    Ok(ContextWindow {
        context_start,
        context_end,
        adjacent_left,
        adjacent_right,
    })
}

fn find_matches(
    text: &str,
    matcher: &regex::Regex,
    kwargs: &ConcordanceOptions,
) -> Result<Vec<ConcordanceMatch>> {
    let mut matches = Vec::new();
    // Collect (start_byte, end_byte, matched_text) for every regex hit, then
    // convert all byte offsets to char offsets in a single forward sweep. The
    // prior per-match `text[..byte_idx].chars().count()` was O(C·M) which
    // dominated CPU on CJK documents with many hits; this is O(C + M).
    let hits: Vec<(usize, usize, String)> = matcher
        .find_iter(text)
        .map(|m| (m.start(), m.end(), m.as_str().to_string()))
        .collect();

    let char_spans = byte_spans_to_char_spans(text, hits.iter().map(|(s, e, _)| (*s, *e)));
    let tokens = source_tokens(text, kwargs.ignore_punctuation)?;
    let char_to_byte = text
        .char_indices()
        .map(|(byte_offset, _)| byte_offset)
        .chain(std::iter::once(text.len()))
        .collect::<Vec<_>>();
    let mut left_complete_end = 0;
    let mut right_complete_start = 0;

    for ((start_byte, end_byte, matched), (start_idx, end_idx)) in hits.iter().zip(char_spans) {
        let start_byte = *start_byte;
        let end_byte = *end_byte;
        let start_char = usize::try_from(start_idx)
            .map_err(|_| anyhow::anyhow!("negative concordance start offset"))?;
        let end_char = usize::try_from(end_idx)
            .map_err(|_| anyhow::anyhow!("negative concordance end offset"))?;

        while tokens
            .get(left_complete_end)
            .is_some_and(|token| token.end <= start_char)
        {
            left_complete_end += 1;
        }
        right_complete_start = right_complete_start.max(left_complete_end);
        while tokens
            .get(right_complete_start)
            .is_some_and(|token| token.start < end_char)
        {
            right_complete_start += 1;
        }

        let left_take = kwargs.left_tokens;
        let right_take = kwargs.right_tokens;

        let window = raw_context_window(ContextRequest {
            text,
            char_to_byte: &char_to_byte,
            tokens: &tokens,
            match_chars: (start_char, end_char),
            complete_tokens: (left_complete_end, right_complete_start),
            take: (left_take, right_take),
            ignore_punctuation: kwargs.ignore_punctuation,
        })?;
        let left_context = window.context_start.map_or_else(String::new, |start| {
            text[char_to_byte[start]..start_byte].to_string()
        });
        let right_context = window.context_end.map_or_else(String::new, |end| {
            text[end_byte..char_to_byte[end]].to_string()
        });

        matches.push(ConcordanceMatch {
            left_context,
            matched_text: matched.clone(),
            right_context,
            start_idx,
            end_idx,
            l1: window.adjacent_left,
            r1: window.adjacent_right,
        });
    }
    Ok(matches)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn token_alternatives_preserve_unicode_context_and_casefold() {
        let text = "😀 Straße, 猫!";
        let tokens = vec![
            Token {
                token: "Straße".into(),
                start: 2,
                end: 8,
            },
            Token {
                token: "猫".into(),
                start: 10,
                end: 11,
            },
        ];
        let search = TokenConcordance::new("STRASSE | 猫, missing", ConcordanceOptions::default());
        let hits = search.find(text, &tokens).unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].right_context, ", 猫");
        assert_eq!(hits[1].left_context, "Straße, ");
        let zero = TokenConcordance::new(
            "猫",
            ConcordanceOptions {
                left_tokens: 0,
                right_tokens: 0,
                ..Default::default()
            },
        );
        let hit = zero.find(text, &tokens).unwrap().remove(0);
        assert_eq!(hit.left_context, "");
        assert_eq!(hit.l1, "Straße");
        assert!(
            Concordance::literal_whole_word("cat", Default::default())
                .unwrap()
                .find("scatter cat")
                .unwrap()
                .len()
                == 1
        );
    }
    #[test]
    fn archived_cjk_token_context_and_exact_alternatives() {
        let text = "今天天气很好今天我们出去玩";
        let tokens = [
            ("今天", 0, 2),
            ("天气", 2, 4),
            ("很", 4, 5),
            ("好", 5, 6),
            ("今天", 6, 8),
            ("我们", 8, 10),
            ("出去", 10, 12),
            ("玩", 12, 13),
        ]
        .into_iter()
        .map(|(token, start, end)| Token {
            token: token.into(),
            start,
            end,
        })
        .collect::<Vec<_>>();
        let matcher = TokenConcordance::new(
            "今天",
            ConcordanceOptions {
                left_tokens: 2,
                right_tokens: 2,
                ..Default::default()
            },
        );
        let hits = matcher.find(text, &tokens).unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].right_context, "天气很");
        assert_eq!(hits[1].left_context, "很好");
        assert_eq!(hits[1].right_context, "我们出去");
        assert!(TokenConcordance::new("今", Default::default())
            .find(text, &tokens)
            .unwrap()
            .is_empty());
        assert!(TokenConcordance::new("cat", Default::default())
            .find(
                "cat",
                &[Token {
                    token: "cat".into(),
                    start: 2,
                    end: 9
                }]
            )
            .is_err());
    }
    #[test]
    fn literal_regex_and_zero_context_parity() {
        let search = Concordance::literal_whole_word("alpha.beta", Default::default()).unwrap();
        assert_eq!(search.find("alphaXbeta alpha.beta").unwrap().len(), 1);
        assert!(Concordance::literal_whole_word("", Default::default())
            .unwrap()
            .find("anything")
            .unwrap()
            .is_empty());
        let search = Concordance::new(
            "cat|猫",
            ConcordanceOptions {
                regex: true,
                case_sensitive: true,
                left_tokens: 0,
                right_tokens: 0,
                ..Default::default()
            },
        )
        .unwrap();
        let hits = search.find("Cat 😀 cat 猫").unwrap();
        assert_eq!(
            hits.iter().map(|hit| hit.start_idx).collect::<Vec<_>>(),
            vec![6, 10]
        );
        assert!(hits
            .iter()
            .all(|hit| hit.left_context.is_empty() && hit.right_context.is_empty()));
        assert!(search.find(" ").unwrap().is_empty());
    }
    #[test]
    fn original_unicode_context_and_repeated_query() {
        let matcher = Concordance::new("猫", ConcordanceOptions::default()).unwrap();
        let found = matcher.find("猫 says 猫.").unwrap();
        assert_eq!(found[0].l1, "");
        assert_eq!(
            found.iter().map(|m| m.start_idx).collect::<Vec<_>>(),
            vec![0, 7]
        );
        assert_eq!(matcher.find("猫 says 猫.").unwrap(), found);
        assert!(Concordance::new(
            "[",
            ConcordanceOptions {
                regex: true,
                ..Default::default()
            }
        )
        .is_err());
        assert!(Concordance::new("", Default::default())
            .unwrap()
            .find("abc")
            .unwrap()
            .is_empty());
    }
}
