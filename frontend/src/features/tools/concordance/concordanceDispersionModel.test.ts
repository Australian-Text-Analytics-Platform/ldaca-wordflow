import { expect, it } from 'vitest';
import {
  dispersionSeries,
  dispersionOption,
  previewDensity,
  selectBin,
  selectBinRange,
  DISPLAY_BINS,
} from './concordanceDispersionModel';
import type { Match } from './concordanceRows';

it('rebins exact-case density without losing counts, zero bins or original spellings', () => {
  const raw = [
    { term: 'Jobs', bin: 99, count: 3 },
    { term: 'jobs', bin: 0, count: 2 },
    { term: 'else', bin: 42, count: 1 },
  ];
  for (const count of DISPLAY_BINS) {
    const exact = dispersionSeries(raw, ['Jobs', 'jobs', 'else'], count, false);
    expect(exact).toHaveLength(3);
    expect(exact.flatMap((term) => term.counts).reduce((sum, n) => sum + n, 0)).toBe(6);
    const folded = dispersionSeries(raw, ['Jobs', 'jobs', 'else'], count, true);
    const jobs = folded.find((term) => term.key === 'jobs');
    expect(jobs).toMatchObject({ label: 'jobs/Jobs', total: 5 });
    expect(jobs?.counts[0]).toBe(2);
    expect(jobs?.counts[count - 1]).toBe(3);
  }
  const single = dispersionSeries(raw.slice(0, 1), ['Jobs', 'jobs', 'else'], 20, false);
  expect(single[0]?.color).toBe(
    dispersionSeries(raw, ['Jobs', 'jobs', 'else'], 20, false).find((term) => term.key === 'Jobs')
      ?.color,
  );
});
it('uses Unicode character positions for preview density and preserves the captured page', () => {
  const rows = [
    {
      documentId: '1',
      sourceIndex: 0,
      source: { text: '😀猫cat' },
      matches: [{ matched_text: 'cat', start_idx: 2 } as Match],
    },
  ];
  expect(
    previewDensity(rows, [
      { source: { schema: 'data', name: 'source' }, column: 'text', tokenizer: null },
    ]),
  ).toEqual([{ term: 'cat', bin: 40, count: 1 }]);
  expect(rows[0]?.matches).toHaveLength(1);
});
it('extends point selection and shift-drag but replaces a plain drag', () => {
  expect(selectBin([0, 8], 4, 2, true)).toEqual([0, 2, 3, 4, 8]);
  expect(selectBin([0, 8], 8, null, false)).toEqual([0]);
  expect(selectBinRange([0, 8], 4, 2, false)).toEqual([2, 3, 4]);
  expect(selectBinRange([0, 8], 4, 2, true)).toEqual([0, 2, 3, 4, 8]);
});
it('restores smooth lines, filled selected points, stacks and cumulative middle steps', () => {
  const series = dispersionSeries([{ term: 'cat', bin: 0, count: 2 }], ['cat'], 20, false);
  const line = dispersionOption(series, 'line', [0], 20, 'fg', 'grid');
  expect(line).toMatchObject({
    yAxis: { minInterval: 1 },
    xAxis: { min: 0, max: 100 },
    series: [
      {
        smooth: true,
        symbolSize: 6,
        emphasis: { scale: false },
        data: [
          { symbol: 'circle' },
          ...Array.from({ length: 19 }, () => ({ symbol: 'emptyCircle' })),
        ],
      },
    ],
  });
  expect(dispersionOption(series, 'area', [], 20, 'fg', 'grid')).toMatchObject({
    series: [{ smooth: true, stack: 'matches' }],
  });
  expect(dispersionOption(series, 'bar', [], 20, 'fg', 'grid')).toMatchObject({
    series: [{ stack: 'matches' }],
  });
  expect(dispersionOption(series, 'cumulative', [], 20, 'fg', 'grid')).toMatchObject({
    series: [{ step: 'middle', smooth: false }],
  });
});
