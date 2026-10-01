import { request } from '@/api/client';
import type { components } from '@/api/generated/native';
import { type AnalysisResult, completedAnalysis } from '@/features/tools/common/analysisApi';
import { tableFromIPC, type TypeMap } from 'apache-arrow';

export type PlotMode = components['schemas']['PlotMode'];

export type PlotMeasure = components['schemas']['Measure'];

export type PlotTimeUnit = components['schemas']['TimeUnit'];

export type TrendsRequest = Required<components['schemas']['TrendsRequest']>;

export type CompareRequest = Required<components['schemas']['CompareRequest']>;

type ScatterRequest = Required<components['schemas']['ScatterRequest']>;

type HeatmapRequest = Required<components['schemas']['HeatmapRequest']>;

type SankeyRequest = Required<components['schemas']['SankeyRequest']>;

export interface PlotRequests {
  trends: TrendsRequest;
  compare: CompareRequest;
  scatter: ScatterRequest;
  heatmap: HeatmapRequest;
  sankey: SankeyRequest;
}

export type PlotRequest = PlotRequests[PlotMode];

export type PlotAnalysis = AnalysisResult<components['schemas']['PlotResultV1']>;

export type PlotQuery = Required<components['schemas']['PlotQuery']>;

export type PlotSelection = Required<components['schemas']['PlotSelection']>;

export async function getPlotResult(
  base: string,
  id: string,
  mode: PlotMode,
  signal?: AbortSignal,
): Promise<PlotAnalysis | null> {
  const analysis = await (
    await request(base, '/api/project/analyses/{id}', 'get', { path: { id }, signal })
  ).json();
  if (analysis.kind === mode && analysis.result === null) return null;
  if (analysis.kind !== mode || analysis.result?.version !== 1)
    throw new Error('Unsupported plot result version');
  return analysis as PlotAnalysis;
}

export async function runPlot<M extends PlotMode>(
  base: string,
  id: string,
  mode: M,
  input: PlotRequests[NoInfer<M>],
): Promise<PlotAnalysis> {
  return completedAnalysis(
    await (
      await request(base, '/api/project/tabs/{id}/{mode}', 'post', {
        path: { id, mode },
        body: input,
      })
    ).json(),
    mode,
  );
}

export async function queryPlot(
  base: string,
  id: string,
  mode: PlotMode,
  input: PlotQuery,
  signal?: AbortSignal,
) {
  const response = await request(base, '/api/project/analyses/{id}/{mode}/query', 'post', {
    path: { id, mode },
    body: input,
    signal,
  });
  return tableFromIPC<TypeMap>(await response.arrayBuffer());
}

export async function publishPlot(
  base: string,
  id: string,
  mode: PlotMode,
  input: components['schemas']['PlotPublish'],
) {
  return (
    await request(base, '/api/project/analyses/{id}/{mode}/publish', 'post', {
      path: { id, mode },
      body: input,
    })
  ).json();
}

export async function plotTimezones(base: string, signal?: AbortSignal): Promise<string[]> {
  return (await request(base, '/api/project/timezones', 'get', { signal })).json();
}
