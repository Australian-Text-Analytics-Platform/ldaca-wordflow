import { describe, expect, it } from 'vitest';
import {
  concordanceHeaderMode,
  concordanceSortColumn,
  concordanceSortHint,
} from '../concordanceTablePresentation';

const modeFor = (
  columnKey: string,
  overrides: Partial<Parameters<typeof concordanceHeaderMode>[0]> = {},
) =>
  concordanceHeaderMode({
    columnKey,
    documentColumn: 'text',
    metadataColumns: ['speaker'],
    isCombined: false,
    isReview: false,
    ...overrides,
  });

describe('concordanceHeaderMode', () => {
  it('keeps only selected metadata sortable in separated Preview', () => {
    expect(modeFor('speaker')).toBe('sortable');
    expect(modeFor('CONC_matched_text')).toBe('preview-review-hint');
    expect(modeFor('CONC_l1')).toBe('preview-review-hint');
    expect(modeFor('CONC_l1_freq')).toBe('preview-review-hint');
  });

  it('enables materialized scalar analysis fields in separated Review', () => {
    for (const column of [
      'CONC_matched_text',
      'CONC_start_idx',
      'CONC_end_idx',
      'CONC_l1',
      'CONC_r1',
      'CONC_l1_freq',
      'CONC_r1_freq',
    ]) {
      expect(modeFor(column, { isReview: true })).toBe('sortable');
    }
  });

  it('keeps the document column plain in both phases', () => {
    expect(modeFor('text')).toBe('plain');
    expect(modeFor('text', { isReview: true })).toBe('plain');
  });

  it('sorts the contexts in separated Review and hints in Preview (issue 241)', () => {
    for (const column of ['CONC_left_context', 'CONC_right_context']) {
      expect(modeFor(column)).toBe('preview-review-hint');
      expect(modeFor(column, { isReview: true })).toBe('sortable');
    }
  });

  it('keeps every combined header plain', () => {
    expect(modeFor('speaker', { isCombined: true, isReview: true })).toBe('plain');
    expect(modeFor('CONC_l1', { isCombined: true, isReview: true })).toBe('plain');
  });
});

describe('concordanceSortColumn', () => {
  it('sorts the contexts by L1 and R1 only while highlighting for sorting is on', () => {
    expect(concordanceSortColumn('CONC_left_context', true)).toBe('CONC_l1');
    expect(concordanceSortColumn('CONC_right_context', true)).toBe('CONC_r1');
    expect(concordanceSortColumn('CONC_left_context', false)).toBe('CONC_left_context');
    expect(concordanceSortColumn('CONC_right_context', false)).toBe('CONC_right_context');
    expect(concordanceSortColumn('CONC_l1_freq', true)).toBe('CONC_l1_freq');
  });

  it('explains the redirected sorts only', () => {
    expect(concordanceSortHint('CONC_left_context', true)).toMatch(/^Sorts by L1/);
    expect(concordanceSortHint('CONC_right_context', true)).toMatch(/^Sorts by R1/);
    expect(concordanceSortHint('CONC_left_context', false)).toBeUndefined();
    expect(concordanceSortHint('speaker', true)).toBeUndefined();
  });
});
