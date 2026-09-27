export const CONCORDANCE_CORE_COLUMNS = [
  'CONC_left_context',
  'CONC_matched_text',
  'CONC_right_context',
  'CONC_start_idx',
  'CONC_end_idx',
  'CONC_l1',
  'CONC_r1',
] as const;

export const CONCORDANCE_FREQ_COLUMNS = ['CONC_l1_freq', 'CONC_r1_freq'] as const;

export const CONCORDANCE_DISPERSION_COLUMN = 'CONC_dispersion' as const;

export const CONCORDANCE_COLUMN_KEYS = {
  leftContext: 'CONC_left_context',
  matchedText: 'CONC_matched_text',
  rightContext: 'CONC_right_context',
  startIdx: 'CONC_start_idx',
  endIdx: 'CONC_end_idx',
  leftToken: 'CONC_l1',
  rightToken: 'CONC_r1',
  leftTokenFreq: 'CONC_l1_freq',
  rightTokenFreq: 'CONC_r1_freq',
  dispersion: CONCORDANCE_DISPERSION_COLUMN,
  extraction: 'CONC_extraction',
} as const;

export const CONCORDANCE_RUN_ALL_GENERATED_COLUMNS = [
  ...CONCORDANCE_CORE_COLUMNS,
  ...CONCORDANCE_FREQ_COLUMNS,
  CONCORDANCE_COLUMN_KEYS.extraction,
] as const;

export const CONCORDANCE_PRESENTATION_COLUMNS = [
  ...CONCORDANCE_RUN_ALL_GENERATED_COLUMNS,
  CONCORDANCE_DISPERSION_COLUMN,
] as const;

export const QUOTATION_COLUMN_KEYS = {
  // Canonical name for the per-quote-row raw source-document text.
  // A created Data Block may include `QUOTE_extraction`; the live Result table
  // renders it as a virtual column backed by the selected source text column.
  document: 'QUOTE_extraction',
  speaker: 'QUOTE_speaker',
  speakerStartIdx: 'QUOTE_speaker_start_idx',
  speakerEndIdx: 'QUOTE_speaker_end_idx',
  quote: 'QUOTE_quote',
  quoteStartIdx: 'QUOTE_quote_start_idx',
  quoteEndIdx: 'QUOTE_quote_end_idx',
  verb: 'QUOTE_verb',
  verbStartIdx: 'QUOTE_verb_start_idx',
  verbEndIdx: 'QUOTE_verb_end_idx',
  quoteType: 'QUOTE_quote_type',
  quoteTokenCount: 'QUOTE_quote_token_count',
  isFloatingQuote: 'QUOTE_is_floating_quote',
  quoteRowIdx: 'QUOTE_quote_row_idx',
} as const;

export const QUOTATION_DOCUMENT_COLUMN = QUOTATION_COLUMN_KEYS.document;

/**
 * Plain explanations shown small and grey under the stored names of generated
 * columns (issue 205). The stored names stay as they are, because they are the
 * column names in created Data Blocks and exports.
 */
export const GENERATED_COLUMN_EXPLANATIONS: Readonly<Record<string, string>> = {
  CONC_left_context: 'Text before the match',
  CONC_matched_text: 'The match',
  CONC_right_context: 'Text after the match',
  CONC_start_idx: 'Where the match starts (character)',
  CONC_end_idx: 'Where the match ends (character)',
  CONC_l1: 'Word just before (L1)',
  CONC_r1: 'Word just after (R1)',
  CONC_l1_freq: 'How often that L1 word occurs',
  CONC_r1_freq: 'How often that R1 word occurs',
  CONC_dispersion: 'Where the matches occur in the document',
  CONC_extraction: 'The matches found in this document',
  QUOTE_extraction: 'Document, with quotes highlighted',
  QUOTE_speaker: 'Who is quoted',
  QUOTE_speaker_start_idx: 'Where the speaker starts (character)',
  QUOTE_speaker_end_idx: 'Where the speaker ends (character)',
  QUOTE_quote: 'The quote',
  QUOTE_quote_start_idx: 'Where the quote starts (character)',
  QUOTE_quote_end_idx: 'Where the quote ends (character)',
  QUOTE_verb: 'Reporting verb, such as said',
  QUOTE_verb_start_idx: 'Where the verb starts (character)',
  QUOTE_verb_end_idx: 'Where the verb ends (character)',
  QUOTE_quote_type: 'How the quote was found',
  QUOTE_quote_token_count: 'Words in the quote',
  QUOTE_is_floating_quote: 'Continues the previous quote',
  QUOTE_quote_row_idx: 'Quote number in the document',
};
