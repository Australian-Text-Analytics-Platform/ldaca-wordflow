import { describe, expect, it } from 'vitest';
import { GENERATED_COLUMN_DETAILS, sourceTextColumnName } from '../generatedColumns';

// The same cases as the backend's test_the_source_text_name_skips_names_already_taken.
describe('sourceTextColumnName (issue 244)', () => {
  it('keeps an ordinary text column and renames a generated one', () => {
    expect(sourceTextColumnName(['text'], 'text', 'CONC')).toBe('text');
    expect(sourceTextColumnName(['CONC_extraction'], 'CONC_extraction', 'CONC')).toBe(
      'CONC_source',
    );
    expect(
      sourceTextColumnName(['CONC_source', 'CONC_extraction'], 'CONC_extraction', 'CONC'),
    ).toBe('CONC_source_2');
    expect(
      sourceTextColumnName(
        ['CONC_source', 'CONC_source_2', 'QUOTE_extraction'],
        'QUOTE_extraction',
        'QUOTE',
      ),
    ).toBe('QUOTE_source');
    // The renamed text is an ordinary column: a later run keeps it as it is.
    expect(sourceTextColumnName(['CONC_source'], 'CONC_source', 'CONC')).toBe('CONC_source');
  });

  it('explains the renamed columns', () => {
    expect(GENERATED_COLUMN_DETAILS.CONC_source).toMatch(/searched text/);
    expect(GENERATED_COLUMN_DETAILS.QUOTE_source).toMatch(/quotes/);
  });
});
