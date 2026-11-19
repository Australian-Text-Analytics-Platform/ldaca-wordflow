import { describe, expect, it } from 'vitest';
import { buildAgreementMatrixSvg } from '@/features/views/common/agreementMatrixImage';

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');
const texts = (svg: string) =>
  Array.from(parse(svg).querySelectorAll('text')).map((node) => node.textContent);

describe('buildAgreementMatrixSvg', () => {
  it('draws the score, description, axes, codes, counts and key of the popup', () => {
    const svg = buildAgreementMatrixSvg({
      title: 'Cohen’s Kappa, annotation versus model: κ 0.500',
      subtitle: 'Data Block: ACE-Text',
      paragraphs: ['Cohen’s Kappa on categories: only exact matches agree.'],
      rows: [
        { reference: 'covid', comparison: 'covid', count: 3 },
        { reference: 'covid', comparison: 'job', count: 1 },
        { reference: 'job', comparison: '', count: 2.5 },
      ],
      scale: null,
      rowAxis: 'annotation',
      columnAxis: 'model',
      agreementKey: 'Green: both columns agree.',
    });

    expect(parse(svg).querySelector('parsererror')).toBeNull();
    const drawn = texts(svg);
    expect(drawn).toEqual(
      expect.arrayContaining([
        'Cohen’s Kappa, annotation versus model: κ 0.500',
        'Data Block: ACE-Text',
        'Cohen’s Kappa on categories: only exact matches agree.',
        'model →',
        '← annotation',
        '(blank)',
        'covid',
        'job',
        '3',
        '2.5',
        'Green: both columns agree.',
      ]),
    );
    // Three codes make a 3 × 3 grid; empty pairs count 0.
    expect(drawn.filter((text) => text === '0')).toHaveLength(6);
    // No scale: only the agreeing cells are shaded, and the key has no orange line.
    expect(svg).not.toContain('far-apart');
  });

  it('wraps a long description and escapes codes, and adds the orange key on a scale', () => {
    const long = Array.from({ length: 40 }, (_, index) => `word${String(index)}`).join(' ');
    const svg = buildAgreementMatrixSvg({
      title: 'Ordinal Krippendorff’s Alpha across 3 coders: αo 0.800 (Preview)',
      paragraphs: [long],
      caption:
        'Coincidence matrix: each cell counts the pairs of codes two coders gave the same text.',
      rows: [
        { reference: 'low', comparison: 'high', count: 1 },
        { reference: '<b>&', comparison: 'low', count: 1 },
      ],
      scale: { levels: ['low', 'high'], outside: ['<b>&'] },
      rowAxis: 'code',
      columnAxis: 'code',
      agreementKey: 'Green: two coders gave the same code.',
    });

    expect(parse(svg).querySelector('parsererror')).toBeNull();
    const drawn = texts(svg);
    const descriptionLines = drawn.filter((text) => text?.startsWith('word'));
    expect(descriptionLines.length).toBeGreaterThan(1);
    expect(descriptionLines.join(' ')).toBe(long);
    expect(drawn).toContain('<b>&');
    expect(svg).toContain('&lt;b&gt;&amp;');
    expect(svg).toContain('url(#far-apart)');
    expect(drawn.join(' ')).toContain('Orange: how far apart the two codes are on the scale.');
  });
});
