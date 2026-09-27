use super::{bridge::ffi, Error};
use std::ops::Range;

pub(super) struct Word {
    pub form: String,
    pub pos: String,
    pub relation: String,
    pub head: Option<usize>,
    pub span: Range<usize>,
}

pub(super) struct Document {
    pub words: Vec<Word>,
    pub sentences: Vec<Range<usize>>,
    pub children: Vec<Vec<usize>>,
    pub chars: Vec<char>,
}

impl Document {
    pub fn new(text: &str, parsed: Vec<ffi::Sentence>) -> Result<Self, Error> {
        let chars: Vec<char> = text.chars().collect();
        let mut words = Vec::new();
        let mut sentences = Vec::new();
        let mut previous_end = 0;
        for sentence in parsed {
            if sentence.words.is_empty() {
                continue;
            }
            let base = words.len();
            let count = sentence.words.len();
            let mut spans = vec![None; count];
            for token in sentence.tokens {
                let first = token.first as usize;
                let last = token.last as usize;
                let start = usize::try_from(token.start).map_err(|_| Error::InvalidParse)?;
                let end = usize::try_from(token.end).map_err(|_| Error::InvalidParse)?;
                if first == 0
                    || last < first
                    || last > count
                    || start < previous_end
                    || end <= start
                    || end > chars.len()
                {
                    return Err(Error::InvalidParse);
                }
                previous_end = end;
                let forms: String = sentence.words[first - 1..last]
                    .iter()
                    .map(|w| w.form.as_str())
                    .collect();
                let surface: String = chars[start..end].iter().collect();
                let exact = forms == surface;
                let mut cursor = start;
                for (i, slot) in spans.iter_mut().enumerate().take(last).skip(first - 1) {
                    if slot.is_some() {
                        return Err(Error::InvalidParse);
                    }
                    let span = if exact {
                        let next = cursor + sentence.words[i].form.chars().count();
                        let span = cursor..next;
                        cursor = next;
                        span
                    } else {
                        start..end
                    };
                    *slot = Some(span);
                }
            }
            for (i, (word, span)) in sentence.words.into_iter().zip(spans).enumerate() {
                if word.id as usize != i + 1 || word.head as usize > count || word.head == word.id {
                    return Err(Error::InvalidParse);
                }
                words.push(Word {
                    form: word.form,
                    pos: word.pos,
                    relation: word.relation,
                    head: if word.head == 0 {
                        None
                    } else {
                        Some(base + word.head as usize - 1)
                    },
                    span: span.ok_or(Error::InvalidParse)?,
                });
            }
            sentences.push(base..words.len());
        }
        let mut children = vec![Vec::new(); words.len()];
        for (i, word) in words.iter().enumerate() {
            if let Some(head) = word.head {
                children[head].push(i);
            }
        }
        Ok(Self {
            words,
            sentences,
            children,
            chars,
        })
    }

    pub fn text(&self, span: &Range<usize>) -> String {
        self.chars[span.clone()].iter().collect()
    }

    pub fn word_span(&self, words: &Range<usize>) -> Range<usize> {
        self.words[words.start].span.start..self.words[words.end - 1].span.end
    }

    pub fn subtree(&self, root: usize) -> Range<usize> {
        let mut first = root;
        let mut last = root;
        let mut stack = vec![root];
        let mut seen = vec![false; self.words.len()];
        while let Some(i) = stack.pop() {
            if seen[i] {
                continue;
            }
            seen[i] = true;
            first = first.min(i);
            last = last.max(i);
            stack.extend(&self.children[i]);
        }
        first..last + 1
    }

    pub fn subject(&self, verb: usize) -> Option<usize> {
        self.children[verb]
            .iter()
            .copied()
            .find(|&i| self.words[i].relation == "nsubj")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contraction(form: &str) -> ffi::Sentence {
        ffi::Sentence {
            words: vec![
                ffi::Word {
                    id: 1,
                    head: 0,
                    form: form.into(),
                    pos: "VERB".into(),
                    relation: "root".into(),
                },
                ffi::Word {
                    id: 2,
                    head: 1,
                    form: "n't".into(),
                    pos: "PART".into(),
                    relation: "advmod".into(),
                },
            ],
            tokens: vec![ffi::Token {
                first: 1,
                last: 2,
                start: 0,
                end: 5,
            }],
        }
    }

    #[test]
    fn contraction_components_partition_exact_surface_when_possible() {
        let doc = Document::new("can't", vec![contraction("ca")]).unwrap();
        assert_eq!(doc.words[0].span, 0..2);
        assert_eq!(doc.words[1].span, 2..5);
    }

    #[test]
    fn nonpartitioning_components_use_whole_surface_token() {
        let doc = Document::new("can't", vec![contraction("can")]).unwrap();
        assert_eq!(doc.words[0].span, 0..5);
        assert_eq!(doc.words[1].span, 0..5);
    }

    #[test]
    fn out_of_bounds_token_ranges_are_errors() {
        assert!(matches!(
            Document::new("x", vec![contraction("ca")]),
            Err(Error::InvalidParse)
        ));
    }
}
