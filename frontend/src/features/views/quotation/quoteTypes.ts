/**
 * Plain-language descriptions of the extractor's Quote Type codes (issue 174).
 *
 * Letter codes list the parts of a quote in the order they appear in the
 * sentence: Q a quotation mark, C the quoted content, V the speech verb, and
 * S the speaker. For example QCQVS is `"We will act," said the minister.`
 */
const SPECIAL_QUOTE_TYPES: Record<string, string> = {
  QCQ: 'a quote in quotation marks that continues the previous quote, whose speaker it takes',
  AccordingTo: 'attributed with "according to"',
  Heuristic:
    'text between quotation marks found by a fallback rule; the speaker and verb are the nearest ones and may be missing',
};

const LETTER_CODE = /^[QCVS]+$/;

/** Describes one Quote Type code, or returns null for an unknown one. */
export const describeQuoteType = (code: string): string | null => {
  const special = SPECIAL_QUOTE_TYPES[code];
  if (special) return special;
  if (!LETTER_CODE.test(code) || !code.includes('C')) return null;
  const quoted = code.includes('Q');
  return Array.from(code.replaceAll('Q', ''))
    .map((letter) => {
      if (letter === 'V') return 'the verb';
      if (letter === 'S') return 'the speaker';
      return quoted ? 'the quote in quotation marks' : 'the quote (reported speech)';
    })
    .join(', then ');
};

/** The explanation shown under a Quote Type code, as a sentence, or null. */
export const explainQuoteType = (code: string): string | null => {
  const description = describeQuoteType(code);
  return description ? `${description.charAt(0).toUpperCase()}${description.slice(1)}.` : null;
};
