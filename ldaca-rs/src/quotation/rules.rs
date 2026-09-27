//! Quotation-only adaptation of the Gender Gap Tracker rules (see LICENSE).
use super::{document::Document, normalize::Normalized};
use std::ops::Range;

pub type SourceSpan = (String, i64, i64);
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Quote {
    pub speaker: Option<SourceSpan>,
    pub quote: SourceSpan,
    pub verb: Option<SourceSpan>,
    pub kind: String,
    pub tokens: i64,
    pub floating: bool,
    pub index: i64,
}

#[derive(Clone)]
struct Candidate {
    words: Range<usize>,
    speaker: Option<Range<usize>>,
    verb: Option<Range<usize>>,
    kind: String,
    floating: bool,
}

fn is_reporting(form: &str) -> bool {
    let lower = form.to_lowercase();
    include_str!("quote_verbs.txt")
        .split_whitespace()
        .any(|verb| verb == lower)
}

fn pairs(doc: &Document) -> Vec<Range<usize>> {
    let mut open = None;
    let mut result = Vec::new();
    for (i, word) in doc.words.iter().enumerate() {
        if word.form == "\"" {
            if let Some(start) = open.take() {
                result.push(start..i + 1);
            } else {
                open = Some(i);
            }
        }
    }
    result
}

fn trim(doc: &Document, mut words: Range<usize>) -> Range<usize> {
    while words.start < words.end
        && matches!(doc.words[words.start].form.as_str(), "\"" | "," | ":")
    {
        words.start += 1;
    }
    while words.start < words.end
        && matches!(
            doc.words[words.end - 1].form.as_str(),
            "\"" | "," | "." | ";" | ":" | "!" | "?"
        )
    {
        words.end -= 1;
    }
    words
}

fn kind(
    doc: &Document,
    words: &Range<usize>,
    speaker: &Range<usize>,
    verb: &Range<usize>,
    pair: Option<&Range<usize>>,
) -> String {
    let midpoint = |range: &Range<usize>| {
        let span = doc.word_span(range);
        span.start + span.end
    };
    let mut parts = vec![
        (midpoint(words), 'C'),
        (midpoint(speaker), 'S'),
        (midpoint(verb), 'V'),
    ];
    if let Some(pair) = pair {
        parts.push((doc.words[pair.start].span.start * 2, 'Q'));
        parts.push((doc.words[pair.end - 1].span.start * 2, 'Q'));
    }
    parts.sort_by_key(|part| part.0);
    parts.into_iter().map(|part| part.1).collect()
}

fn valid_speaker(doc: &Document, words: &Range<usize>) -> bool {
    !matches!(
        doc.text(&doc.word_span(words))
            .trim()
            .to_lowercase()
            .as_str(),
        "i" | "we"
    )
}

fn closest_verb(doc: &Document, words: &Range<usize>) -> Option<usize> {
    let preceding = (words.start.saturating_sub(4)..words.start).rev();
    let following = words.end..(words.end + 5).min(doc.words.len());
    fn search(doc: &Document, indices: impl Iterator<Item = usize>) -> Option<usize> {
        for i in indices {
            let word = &doc.words[i];
            if word.pos == "VERB" && !matches!(word.form.as_str(), "is" | "was" | "be") {
                return Some(i);
            }
            if matches!(word.form.as_str(), "." | "\"") {
                break;
            }
        }
        None
    }
    search(doc, preceding).or_else(|| search(doc, following))
}

fn syntactic(doc: &Document, quoted: &[Range<usize>]) -> Vec<Candidate> {
    let mut result = Vec::new();
    for (i, word) in doc.words.iter().enumerate() {
        if word.relation == "ccomp" {
            if let Some(verb) = word.head.filter(|&v| is_reporting(&doc.words[v].form)) {
                let subject = doc
                    .subject(verb)
                    .or_else(|| doc.words[verb].head.and_then(|head| doc.subject(head)));
                if let Some(subject) = subject {
                    let speaker = doc.subtree(subject);
                    let words = trim(doc, doc.subtree(i));
                    if !words.is_empty() && valid_speaker(doc, &speaker) {
                        let pair = quoted
                            .iter()
                            .find(|pair| pair.start <= words.start && words.end <= pair.end);
                        result.push(Candidate {
                            kind: kind(doc, &words, &speaker, &(verb..verb + 1), pair),
                            words,
                            speaker: Some(speaker),
                            verb: Some(verb..verb + 1),
                            floating: false,
                        });
                    }
                }
            }
        }
        // UD often makes the reporting clause a parataxis dependent of the quote.
        if word.relation == "parataxis" && is_reporting(&word.form) {
            if let Some(subject) = doc.subject(i) {
                let speaker = doc.subtree(subject);
                if valid_speaker(doc, &speaker) {
                    for pair in quoted
                        .iter()
                        .filter(|pair| closest_verb(doc, pair) == Some(i))
                    {
                        let words = trim(doc, pair.clone());
                        if !words.is_empty() {
                            result.push(Candidate {
                                kind: kind(doc, &words, &speaker, &(i..i + 1), Some(pair)),
                                words,
                                speaker: Some(speaker.clone()),
                                verb: Some(i..i + 1),
                                floating: false,
                            });
                        }
                    }
                }
            }
        }
        if !word.form.eq_ignore_ascii_case("according")
            || i + 1 >= doc.words.len()
            || doc.words[i + 1].form != "to"
        {
            continue;
        }
        // `according`/`to` form a case/fixed phrase modifying a nominal speaker.
        let speaker_head = [word.head, doc.words[i + 1].head]
            .into_iter()
            .flatten()
            .find(|&head| {
                head != i
                    && head != i + 1
                    && matches!(doc.words[head].pos.as_str(), "NOUN" | "PROPN" | "PRON")
            });
        if let Some(head) = speaker_head {
            let sentence = doc.sentences.iter().find(|s| s.contains(&i));
            if let Some(sentence) = sentence {
                let subtree = doc.subtree(head);
                let speaker = trim(doc, (i + 2).max(subtree.start)..subtree.end);
                if speaker.is_empty() {
                    continue;
                }
                let words = if i <= sentence.start + 1 {
                    trim(doc, speaker.end..sentence.end)
                } else {
                    trim(doc, sentence.start..i)
                };
                if !words.is_empty() {
                    result.push(Candidate {
                        words,
                        speaker: Some(speaker),
                        verb: Some(i..i + 2),
                        kind: "AccordingTo".into(),
                        floating: false,
                    });
                }
            }
        }
    }
    result
}

pub(super) fn extract(doc: &Document, normalized: &Normalized, source: &str) -> Vec<Quote> {
    let quoted = pairs(doc);
    let syntactic = syntactic(doc, &quoted);
    let mut candidates = syntactic.clone();
    for (index, sentence) in doc.sentences.iter().enumerate().skip(1) {
        let previous = &doc.sentences[index - 1];
        let previous_span = doc.word_span(previous);
        let prior = syntactic.iter().find(|candidate| {
            let span = doc.word_span(&candidate.words);
            let overlap = span
                .end
                .min(previous_span.end)
                .saturating_sub(span.start.max(previous_span.start));
            matches!(candidate.kind.as_str(), "QCQSV" | "QCQVS" | "CSV")
                && overlap * 2 >= span.len().min(previous_span.len())
        });
        if let Some(prior) = prior {
            for pair in quoted.iter().filter(|pair| pair.start == sentence.start) {
                let final_sentence = doc
                    .sentences
                    .iter()
                    .position(|s| s.contains(&(pair.end - 1)));
                if final_sentence.is_some_and(|end| end < index + 5) {
                    candidates.push(Candidate {
                        words: pair.clone(),
                        speaker: prior.speaker.clone(),
                        verb: None,
                        kind: "QCQ".into(),
                        floating: true,
                    });
                }
            }
        }
    }
    for pair in quoted {
        if pair.len() <= 6 || pair.len() >= 100 {
            continue;
        }
        let verb = closest_verb(doc, &pair);
        let speaker = verb.and_then(|v| doc.subject(v)).map(|s| s..s + 1);
        candidates.push(Candidate {
            words: pair,
            speaker,
            verb: verb.map(|v| v..v + 1),
            kind: "Heuristic".into(),
            floating: false,
        });
    }
    let mut result: Vec<Quote> = Vec::new();
    for candidate in candidates {
        let span = doc.word_span(&candidate.words);
        if doc.text(&span).split(' ').count() < 4 {
            continue;
        }
        let Some(quote) = normalized.project(source, &span) else {
            continue;
        };
        if result
            .iter()
            .any(|previous| previous.quote.1 < quote.2 && quote.1 < previous.quote.2)
        {
            continue;
        }
        let project = |words: &Range<usize>| normalized.project(source, &doc.word_span(words));
        result.push(Quote {
            quote,
            speaker: candidate.speaker.as_ref().and_then(project),
            verb: candidate.verb.as_ref().and_then(project),
            kind: candidate.kind,
            tokens: candidate.words.len() as i64,
            floating: candidate.floating,
            index: result.len() as i64,
        });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quotation::bridge::ffi;

    fn fixture(parts: &[(&str, &str, &str, u32)]) -> (String, Document) {
        let source = parts.iter().map(|p| p.0).collect::<Vec<_>>().join(" ");
        let mut cursor = 0;
        let mut words = Vec::new();
        let mut tokens = Vec::new();
        for (i, &(form, pos, relation, head)) in parts.iter().enumerate() {
            words.push(ffi::Word {
                id: i as u32 + 1,
                head,
                form: form.into(),
                pos: pos.into(),
                relation: relation.into(),
            });
            tokens.push(ffi::Token {
                first: i as u32 + 1,
                last: i as u32 + 1,
                start: cursor,
                end: cursor + form.len() as u64,
            });
            cursor += form.len() as u64 + 1;
        }
        let doc = Document::new(&source, vec![ffi::Sentence { words, tokens }]).unwrap();
        (source, doc)
    }

    #[test]
    fn dependency_complement_attributes_indirect_quote() {
        let (source, doc) = fixture(&[
            ("Alice", "PROPN", "nsubj", 2),
            ("said", "VERB", "root", 0),
            ("the", "DET", "det", 4),
            ("project", "NOUN", "nsubj", 6),
            ("would", "AUX", "aux", 6),
            ("finish", "VERB", "ccomp", 2),
            ("tomorrow", "NOUN", "obl", 6),
            (".", "PUNCT", "punct", 2),
        ]);
        let quotes = extract(&doc, &Normalized::new(&source), &source);
        assert_eq!(quotes.len(), 1);
        assert_eq!(quotes[0].quote.0, "the project would finish tomorrow");
        assert_eq!(quotes[0].speaker.as_ref().unwrap().0, "Alice");
        assert_eq!(quotes[0].kind, "SVC");
    }

    #[test]
    fn syntactic_quote_wins_over_overlapping_heuristic() {
        let (source, doc) = fixture(&[
            ("Alice", "PROPN", "nsubj", 2),
            ("said", "VERB", "root", 0),
            ("\"", "PUNCT", "punct", 7),
            ("the", "DET", "det", 5),
            ("project", "NOUN", "nsubj", 7),
            ("will", "AUX", "aux", 7),
            ("finish", "VERB", "ccomp", 2),
            ("tomorrow", "NOUN", "obl", 7),
            ("\"", "PUNCT", "punct", 7),
            (".", "PUNCT", "punct", 2),
        ]);
        let quotes = extract(&doc, &Normalized::new(&source), &source);
        assert_eq!(quotes.len(), 1);
        assert_eq!(quotes[0].kind, "SVQCQ");
        assert_eq!(quotes[0].index, 0);
    }

    #[test]
    fn heuristic_length_limits_are_exclusive() {
        for (length, expected) in [(6, 0), (7, 1), (99, 1), (100, 0)] {
            let mut parts = vec![("word", "NOUN", "root", 0); length];
            parts[0] = ("\"", "PUNCT", "root", 0);
            parts[length - 1] = ("\"", "PUNCT", "root", 0);
            let (source, doc) = fixture(&parts);
            assert_eq!(
                extract(&doc, &Normalized::new(&source), &source).len(),
                expected
            );
        }
    }
    #[test]
    fn floating_search_stops_after_five_sentences() {
        for sentence_count in [5, 6] {
            let mut parts = vec![
                ("\"", "PUNCT", "punct", 4),
                ("the", "DET", "det", 3),
                ("project", "NOUN", "nsubj", 4),
                ("finishes", "VERB", "ccomp", 8),
                ("tomorrow", "NOUN", "obl", 4),
                ("morning", "NOUN", "obl", 4),
                ("\"", "PUNCT", "punct", 4),
                ("said", "VERB", "root", 0),
                ("Alice", "PROPN", "nsubj", 8),
                (".", "PUNCT", "punct", 8),
            ];
            let mut sentences = Vec::with_capacity(sentence_count + 1);
            sentences.push(0..parts.len());
            for sentence in 0..sentence_count {
                let start = parts.len();
                if sentence == 0 {
                    parts.push(("\"", "PUNCT", "root", 0));
                }
                parts.extend([
                    ("More", "ADJ", "root", 0),
                    ("work", "NOUN", "root", 0),
                    ("is", "AUX", "root", 0),
                    ("needed", "VERB", "root", 0),
                    (".", "PUNCT", "root", 0),
                ]);
                if sentence + 1 == sentence_count {
                    parts.push(("\"", "PUNCT", "root", 0));
                }
                sentences.push(start..parts.len());
            }
            let (source, mut doc) = fixture(&parts);
            doc.sentences = sentences;
            let quotes = extract(&doc, &Normalized::new(&source), &source);
            assert_eq!(
                quotes.iter().filter(|q| q.floating).count(),
                usize::from(sentence_count == 5)
            );
        }
    }

    #[test]
    fn according_to_uses_ud_case_and_fixed_nominal_structure() {
        let (source, doc) = fixture(&[
            ("According", "ADP", "case", 3),
            ("to", "ADP", "fixed", 1),
            ("Alice", "PROPN", "obl", 7),
            (",", "PUNCT", "punct", 7),
            ("the", "DET", "det", 6),
            ("project", "NOUN", "nsubj", 7),
            ("finishes", "VERB", "root", 0),
            ("tomorrow", "NOUN", "obl", 7),
            ("morning", "NOUN", "obl", 7),
            (".", "PUNCT", "punct", 7),
        ]);
        let quotes = extract(&doc, &Normalized::new(&source), &source);
        assert_eq!(quotes[0].kind, "AccordingTo");
        assert_eq!(quotes[0].speaker.as_ref().unwrap().0, "Alice");
        assert_eq!(quotes[0].quote.0, "the project finishes tomorrow morning");
    }
}
