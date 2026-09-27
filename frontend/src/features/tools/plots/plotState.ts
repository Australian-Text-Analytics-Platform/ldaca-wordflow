import { create } from 'zustand';
import type { PlotMode, PlotRequest } from '@/features/project/api';
import { createAnalysisDraftStore } from '../common/analysisDraftStore';
export const plotModes = ['trends', 'compare', 'scatter', 'heatmap', 'sankey'] as const;
export const plotLabels = {
  trends: 'Trends',
  compare: 'Compare',
  scatter: 'Scatter',
  heatmap: 'Heatmap',
  sankey: 'Sankey',
};
export const usePlotState = createAnalysisDraftStore<PlotRequest>();
export const plotScope = (base: string, mode: PlotMode) => JSON.stringify([base, mode]);
export const usePlotMode = create<{
  modes: Record<string, PlotMode>;
  setMode: (base: string, mode: PlotMode) => void;
}>((set) => ({
  modes: {},
  setMode: (base, mode) => {
    set((s) => ({ modes: { ...s.modes, [base]: mode } }));
  },
}));

export function plotReady(r: PlotRequest): boolean {
  if (!r.source.name) return false;
  if ('measure' in r && r.measure !== 'count' && !r.value) return false;
  if ('axis' in r) return Boolean(r.axis) && r.groups.every(Boolean);
  if ('category' in r) return Boolean(r.category);
  if ('x' in r) return Boolean(r.x && r.y);
  if ('row' in r) return Boolean(r.row && r.column);
  return r.stages.length >= 2;
}
