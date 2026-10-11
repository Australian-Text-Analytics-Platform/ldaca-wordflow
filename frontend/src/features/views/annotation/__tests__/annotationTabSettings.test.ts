import { describe, expect, it } from 'vitest';
import { defaultAnnotationConcurrency, parseAnnotationTabSettings } from '../annotationTabSettings';

describe('Annotation tab settings', () => {
  it('runs only rows without an annotation unless the tab chose all rows', () => {
    expect(parseAnnotationTabSettings(undefined, {}).aiProcessingMode).toBe('fill_missing');
    expect(
      parseAnnotationTabSettings(JSON.stringify({ aiProcessingMode: 'reprocess_all' }), {})
        .aiProcessingMode,
    ).toBe('reprocess_all');
  });

  it('keeps valid Requests at once per provider and defaults by provider type', () => {
    const settings = parseAnnotationTabSettings(
      JSON.stringify({ aiProviderConcurrency: { a: 4, b: 0, c: 40, d: 'x', e: 32 } }),
      {},
    );
    expect(settings.aiProviderConcurrency).toEqual({ a: 4, e: 32 });
    expect(defaultAnnotationConcurrency('custom')).toBe(2);
    expect(defaultAnnotationConcurrency('openai')).toBe(10);
    expect(defaultAnnotationConcurrency(null)).toBe(10);
  });
});
