//! Preserve an original-character boundary for every normalized character.
use std::ops::Range;

pub(super) struct Normalized {
    pub text: String,
    pub mapping: Vec<usize>,
    original_bytes: Vec<usize>,
}

impl Normalized {
    pub fn new(source: &str) -> Self {
        let mut chars: Vec<char> = source.chars().map(normalize_char).collect();
        let mut mapping: Vec<usize> = (0..=chars.len()).collect();
        for (old, new) in [
            ("\n", ".\n "),
            ("..\n ", ".\n "),
            (". .\n ", ".\n "),
            ("  ", " "),
            ("\\n", " "),
            ("\\n\\n", " "),
        ] {
            let old: Vec<char> = old.chars().collect();
            let mut output = Vec::with_capacity(chars.len());
            let mut output_map = Vec::with_capacity(mapping.len());
            let mut i = 0;
            while i < chars.len() {
                if chars[i..].starts_with(&old) {
                    for c in new.chars() {
                        output.push(c);
                        output_map.push(mapping[i]);
                    }
                    i += old.len();
                } else {
                    output.push(chars[i]);
                    output_map.push(mapping[i]);
                    i += 1;
                }
            }
            output_map.push(mapping[chars.len()]);
            chars = output;
            mapping = output_map;
        }
        let mut original_bytes: Vec<usize> = source.char_indices().map(|(i, _)| i).collect();
        original_bytes.push(source.len());
        Self {
            text: chars.into_iter().collect(),
            mapping,
            original_bytes,
        }
    }

    pub fn project(&self, source: &str, span: &Range<usize>) -> Option<(String, i64, i64)> {
        let start = *self.mapping.get(span.start)?;
        let end = *self.mapping.get(span.end)?;
        if start >= end {
            return None;
        }
        Some((
            source[self.original_bytes[start]..self.original_bytes[end]].to_owned(),
            i64::try_from(start).ok()?,
            i64::try_from(end).ok()?,
        ))
    }
}

fn normalize_char(c: char) -> char {
    for (group, replacement) in [
        ("àáâãäåā", 'a'),
        ("èéêëē", 'e'),
        ("ìíîïıī", 'i'),
        ("òóôõöō", 'o'),
        ("ùúûüū", 'u'),
        ("ýÿȳ", 'y'),
        ("ç", 'c'),
        ("ğḡ", 'g'),
        ("ñ", 'n'),
        ("ş", 's'),
        ("ÀÁÂÃÄÅĀ", 'A'),
        ("ÈÉÊËĒ", 'E'),
        ("ÌÍÎÏİĪ", 'I'),
        ("ÒÓÔÕÖŌ", 'O'),
        ("ÙÚÛÜŪ", 'U'),
        ("ÝŸȲ", 'Y'),
        ("Ç", 'C'),
        ("ĞḠ", 'G'),
        ("Ñ", 'N'),
        ("Ş", 'S'),
    ] {
        if group.contains(c) {
            return replacement;
        }
    }
    match c {
        '\u{a0}' => ' ',
        '”' | '“' | '〝' | '〞' => '"',
        _ => c,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn projected_spans_slice_original_unicode(
            chars in prop::collection::vec(prop_oneof![any::<char>(), Just('\n'), Just(' '), Just('é'), Just('“')], 0..80),
            first in any::<usize>(),
            second in any::<usize>(),
        ) {
            let source: String = chars.iter().collect();
            let normalized = Normalized::new(&source);
            let length = normalized.text.chars().count();
            let a = first % (length + 1);
            let b = second % (length + 1);
            if let Some((text, start, end)) = normalized.project(&source, &(a.min(b)..a.max(b))) {
                prop_assert!(start >= 0 && start < end && end as usize <= chars.len());
                prop_assert_eq!(text, chars[start as usize..end as usize].iter().collect::<String>());
            }
            if !source.is_empty() {
                prop_assert_eq!(normalized.project(&source, &(0..length)), Some((source, 0, chars.len() as i64)));
            }
        }
    }

    #[test]
    fn normalization_projects_to_original_unicode_source() {
        let source = "🙂 José  said\n“ğḡ café”";
        let n = Normalized::new(source);
        assert_eq!(n.text, "🙂 Jose said.\n \"gg cafe\"");
        let start = n.text.chars().position(|c| c == 'g').unwrap();
        assert_eq!(n.project(source, &(start..start + 7)).unwrap().0, "ğḡ café");
        assert_eq!(n.mapping.len(), n.text.chars().count() + 1);
    }

    #[test]
    fn inserted_punctuation_maps_to_empty_source() {
        let n = Normalized::new("a\nb");
        assert!(n.project("a\nb", &(1..2)).is_none());
        assert_eq!(
            n.project("a\nb", &(0..n.text.chars().count())).unwrap().0,
            "a\nb"
        );
    }
}
