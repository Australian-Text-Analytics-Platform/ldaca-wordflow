//! Byte → char offset conversion utilities.
//!
//! Tokenisers in this crate (HuggingFace, Lindera, regex `Match`) emit byte
//! offsets, but the public text APIs use **character** offsets so a Hanzi indexes as
//! one position rather than three bytes.
//!
//! The naive conversion `text.char_indices().take_while(|(b, _)| *b <
//! byte_idx).count()` is O(C) per call, which becomes O(C·N) when a
//! document has N tokens — minutes of CPU on long JA/KO documents where
//! N is large (Lindera emits one morpheme per syllable). The helpers
//! here amortise that cost to O(C + N) by walking `char_indices()` once
//! and zipping it against a monotonic sequence of byte spans.

/// Convert a sequence of monotonic byte (start, end) spans into the matching
/// char (start, end) spans in a single forward pass through `char_indices()`.
///
/// `byte_spans` **must** be ordered by `start` for correctness; this holds
/// for every tokeniser we use (HuggingFace WordPiece/BPE, Lindera) and for
/// `regex::Regex::find_iter`. Total work is O(text.len() + N).
pub fn byte_spans_to_char_spans<I>(text: &str, byte_spans: I) -> Vec<(i64, i64)>
where
    I: IntoIterator<Item = (usize, usize)>,
{
    let spans: Vec<(usize, usize)> = byte_spans.into_iter().collect();
    let mut result: Vec<(i64, i64)> = Vec::with_capacity(spans.len());

    let mut iter = text.char_indices().peekable();
    let mut char_idx: usize = 0;

    for (start, end) in spans {
        while let Some(&(b, _)) = iter.peek() {
            if b >= start {
                break;
            }
            iter.next();
            char_idx += 1;
        }
        let cs = char_idx as i64;
        while let Some(&(b, _)) = iter.peek() {
            if b >= end {
                break;
            }
            iter.next();
            char_idx += 1;
        }
        let ce = char_idx as i64;
        result.push((cs, ce));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn unicode_spans_match_character_slices(chars in prop::collection::vec(any::<char>(), 0..128)) {
            let text: String = chars.iter().collect();
            let mut boundaries: Vec<usize> = text.char_indices().map(|(offset, _)| offset).collect();
            boundaries.push(text.len());
            let spans: Vec<_> = boundaries.windows(2).map(|pair| (pair[0], pair[1])).collect();
            let converted = byte_spans_to_char_spans(&text, spans.clone());
            prop_assert_eq!(converted.len(), chars.len());
            for (index, ((start, end), (byte_start, byte_end))) in converted.into_iter().zip(spans).enumerate() {
                prop_assert_eq!((start, end), (index as i64, index as i64 + 1));
                prop_assert_eq!(&text[byte_start..byte_end], chars[index].to_string());
            }
        }
    }

    /// Reference implementation — the original O(N²) walker. Kept here as
    /// the property-test oracle so any future change to the fast path can
    /// be cross-checked against the obviously-correct slow path.
    fn byte_to_char_idx_naive(text: &str, byte_idx: usize) -> i64 {
        text[..byte_idx.min(text.len())].chars().count() as i64
    }

    #[test]
    fn empty_input_returns_empty() {
        let spans = byte_spans_to_char_spans("anything", std::iter::empty());
        assert!(spans.is_empty());
    }

    #[test]
    fn ascii_offsets_match_naive() {
        let text = "the quick brown fox";
        let byte_spans = vec![(0, 3), (4, 9), (10, 15), (16, 19)];
        let expected: Vec<(i64, i64)> = byte_spans
            .iter()
            .map(|(s, e)| {
                (
                    byte_to_char_idx_naive(text, *s),
                    byte_to_char_idx_naive(text, *e),
                )
            })
            .collect();
        let got = byte_spans_to_char_spans(text, byte_spans);
        assert_eq!(got, expected);
    }

    #[test]
    fn multibyte_offsets_match_naive() {
        let text = "今日は良い天気です";
        // Each Hanzi/Hiragana is 3 bytes in UTF-8.
        let byte_spans = vec![
            (0, 3),
            (3, 6),
            (6, 9),
            (9, 12),
            (12, 15),
            (15, 18),
            (18, 21),
            (21, 24),
            (24, 27),
        ];
        let expected: Vec<(i64, i64)> = byte_spans
            .iter()
            .map(|(s, e)| {
                (
                    byte_to_char_idx_naive(text, *s),
                    byte_to_char_idx_naive(text, *e),
                )
            })
            .collect();
        let got = byte_spans_to_char_spans(text, byte_spans.clone());
        assert_eq!(got, expected);
        // Sanity: each Hiragana / Hanzi span should be exactly 1 char.
        for (cs, ce) in &got {
            assert_eq!(ce - cs, 1);
        }
    }

    #[test]
    fn mixed_ascii_and_emoji_match_naive() {
        let text = "hi 🙂 there 👋 friend";
        // Hand-built byte spans by find()-ing markers.
        let smile_byte = text.find('🙂').unwrap();
        let wave_byte = text.find('👋').unwrap();
        let byte_spans = vec![
            (0, 2), // "hi"
            (smile_byte, smile_byte + '🙂'.len_utf8()),
            (
                smile_byte + '🙂'.len_utf8() + 1,
                smile_byte + '🙂'.len_utf8() + 6,
            ), // "there"
            (wave_byte, wave_byte + '👋'.len_utf8()),
        ];
        let expected: Vec<(i64, i64)> = byte_spans
            .iter()
            .map(|(s, e)| {
                (
                    byte_to_char_idx_naive(text, *s),
                    byte_to_char_idx_naive(text, *e),
                )
            })
            .collect();
        let got = byte_spans_to_char_spans(text, byte_spans);
        assert_eq!(got, expected);
    }

    #[test]
    fn end_of_string_boundary() {
        // A token whose end byte equals text.len() must yield char_count(text).
        let text = "café";
        let total_bytes = text.len();
        let spans = vec![(0, total_bytes)];
        let got = byte_spans_to_char_spans(text, spans);
        assert_eq!(got, vec![(0, 4)]);
    }

    #[test]
    fn adjacent_spans_share_cursor_state() {
        // Two adjacent spans should report contiguous char offsets — this
        // is the property that the single-sweep cursor preserves.
        let text = "abcdef";
        let spans = vec![(0, 2), (2, 4), (4, 6)];
        let got = byte_spans_to_char_spans(text, spans);
        assert_eq!(got, vec![(0, 2), (2, 4), (4, 6)]);
    }
}
