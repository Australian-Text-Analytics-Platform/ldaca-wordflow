import type { EChartsCoreOption } from 'echarts/core';
import type { ConcordanceInput } from '@/features/project/api';
import { VIZ_PALETTE, GREY } from '../common/vizPalette';
import { showValue, type DocumentRow } from './concordanceRows';

export type DispersionChartMode = 'line' | 'bar' | 'area' | 'cumulative';
export interface Density {
  term: string;
  bin: number;
  count: number;
}
export interface TermSeries {
  key: string;
  label: string;
  variants: string[];
  color: string;
  counts: number[];
  total: number;
}
export const DISPLAY_BINS = [4, 5, 10, 20, 25, 50, 100];
export const termKey = (term: string, uncased: boolean) => (uncased ? term.toLowerCase() : term);

/** Preview reuses the captured page; offsets and lengths are Unicode code points. */
export function previewDensity(rows: DocumentRow[], inputs: ConcordanceInput[]): Density[] {
  const counts = new Map<string, Density>();
  for (const row of rows) {
    const length = Math.max(
      1,
      Array.from(showValue(row.source[inputs[row.sourceIndex]?.column ?? ''] ?? '')).length,
    );
    for (const hit of row.matches) {
      const bin = Math.min(99, Math.floor((hit.start_idx * 100) / length));
      const key = JSON.stringify([hit.matched_text, bin]);
      const item = counts.get(key) ?? { term: hit.matched_text, bin, count: 0 };
      item.count++;
      counts.set(key, item);
    }
  }
  return [...counts.values()];
}

/** Every supported display count divides the fixed 100-bin native projection. */
export function dispersionSeries(
  density: Density[],
  allTerms: string[],
  binCount: number,
  uncased: boolean,
): TermSeries[] {
  const keys = [...new Set(allTerms.map((term) => termKey(term, uncased)))].sort();
  const series = new Map<string, TermSeries>();
  for (const item of density) {
    const key = termKey(item.term, uncased);
    let entry = series.get(key);
    if (!entry) {
      entry = {
        key,
        label: '',
        variants: [],
        color: VIZ_PALETTE[keys.indexOf(key) % VIZ_PALETTE.length] ?? GREY,
        counts: Array<number>(binCount).fill(0),
        total: 0,
      };
      series.set(key, entry);
    }
    if (!entry.variants.includes(item.term)) entry.variants.push(item.term);
    const bin = Math.min(binCount - 1, Math.floor((item.bin * binCount) / 100));
    entry.counts[bin] = (entry.counts[bin] ?? 0) + item.count;
    entry.total += item.count;
  }
  return [...series.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => {
      entry.variants.sort((a, b) =>
        a === entry.key ? -1 : b === entry.key ? 1 : a.localeCompare(b),
      );
      return { ...entry, label: entry.variants.join('/') };
    });
}

export function selectBin(
  bins: number[],
  bin: number,
  anchor: number | null,
  extend: boolean,
): number[] {
  if (extend && anchor !== null) return selectBinRange(bins, anchor, bin, true);
  return bins.includes(bin)
    ? bins.filter((value) => value !== bin)
    : [...bins, bin].sort((a, b) => a - b);
}
export function selectBinRange(bins: number[], start: number, end: number, add: boolean): number[] {
  return [
    ...new Set([
      ...(add ? bins : []),
      ...Array.from({ length: Math.abs(end - start) + 1 }, (_, i) => Math.min(start, end) + i),
    ]),
  ].sort((a, b) => a - b);
}
export function binLabel(bin: number, count: number): string {
  return `${String((bin * 100) / count)}–${String(((bin + 1) * 100) / count)}%`;
}

export function dispersionOption(
  series: TermSeries[],
  type: DispersionChartMode,
  bins: number[],
  binCount: number,
  foreground: string,
  gridColor: string,
): EChartsCoreOption {
  return {
    animation: false,
    textStyle: { color: foreground },
    grid: { left: 42, right: 16, top: 12, bottom: 62 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', snap: true },
      valueFormatter: (value: unknown) => String(value),
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 100,
      interval: 20,
      axisLabel: { color: foreground, formatter: '{value}%' },
      axisPointer: {
        label: {
          formatter: (params: { value: number }) =>
            binLabel(Math.min(binCount - 1, Math.floor((params.value * binCount) / 100)), binCount),
        },
      },
      splitLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      minInterval: 1,
      axisLabel: { color: foreground },
      splitLine: { lineStyle: { color: gridColor } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: series.map((term) => {
      let cumulative = 0;
      return {
        name: term.label,
        type: type === 'bar' ? 'bar' : 'line',
        smooth: type === 'line' || type === 'area',
        step: type === 'cumulative' ? 'middle' : undefined,
        stack: type === 'area' || (type === 'bar' && binCount > 10) ? 'matches' : undefined,
        areaStyle: type === 'area' ? { opacity: bins.length ? 0.2 : 0.35 } : undefined,
        showSymbol: type !== 'cumulative' || bins.length > 0,
        symbolSize: 6,
        itemStyle: { color: term.color },
        lineStyle: { color: term.color },
        emphasis: { focus: 'series', scale: false },
        blur: { lineStyle: { opacity: 0.45 }, itemStyle: { opacity: 0.45 } },
        data: term.counts.map((count, bin) => {
          cumulative += count;
          return {
            value: [((bin + 0.5) * 100) / binCount, type === 'cumulative' ? cumulative : count],
            symbol: bins.includes(bin) ? 'circle' : 'emptyCircle',
            itemStyle: { opacity: type === 'bar' && bins.length && !bins.includes(bin) ? 0.35 : 1 },
          };
        }),
      };
    }),
  };
}
