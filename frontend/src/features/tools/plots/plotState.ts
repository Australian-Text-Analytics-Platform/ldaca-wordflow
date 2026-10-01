import type { PlotMode, PlotRequest } from '@/features/tools/plots/api';
import { create } from 'zustand';
import { createAnalysisDraftStore } from '../common/analysisDraftStore';
import { renameInput, type Rename } from '../common/renameReferences';
export const plotModes = ['trends', 'compare', 'scatter', 'heatmap', 'sankey'] as const;
export const plotLabels = {
  trends: 'Trends',
  compare: 'Compare',
  scatter: 'Scatter',
  heatmap: 'Heatmap',
  sankey: 'Sankey',
};
export const usePlotState = createAnalysisDraftStore<PlotRequest>(renamePlotRequest);
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

function renamePlotRequest(request: PlotRequest, rename: Rename): PlotRequest {
  if ('axis' in request) return renameInput(request, rename, ['axis', 'groups', 'value']);
  if ('category' in request) return renameInput(request, rename, ['category', 'stack', 'value']);
  if ('x' in request) return renameInput(request, rename, ['x', 'y', 'color', 'size', 'label']);
  if ('row' in request) return renameInput(request, rename, ['row', 'column', 'value']);
  return renameInput(request, rename, ['stages', 'value']);
}
