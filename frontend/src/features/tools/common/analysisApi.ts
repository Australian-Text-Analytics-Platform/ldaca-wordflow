import { request } from '@/api/client';
import type { components } from '@/api/generated/native';
import { type PlotMode } from '@/features/tools/plots/api';
import { tableFromIPC, type TypeMap } from 'apache-arrow';

export type AnalysisKind =
  | 'annotation'
  | 'frequency'
  | 'concordance'
  | 'quotation'
  | 'topic-modeling'
  | PlotMode;

export type Tab = Omit<components['schemas']['Tab'], 'kind' | 'settings'> & {
  kind: AnalysisKind;
  settings: Record<string, unknown>;
};

export type Analysis<Result = unknown> = Omit<components['schemas']['Analysis'], 'result'> & {
  result: (Omit<components['schemas']['AnalysisOutput'], 'payload'> & { payload: Result }) | null;
};

/** Completed output returned by Run or a validated saved-output read. */
export type AnalysisResult<Result = unknown> = Omit<Analysis<Result>, 'result'> & {
  result: NonNullable<Analysis<Result>['result']>;
};

export async function listTabs(base: string, signal?: AbortSignal, kind?: string): Promise<Tab[]> {
  return (
    await (await request(base, '/api/project/tabs', 'get', { query: { kind }, signal })).json()
  ).map(tabView);
}

export async function createTab(base: string, kind: AnalysisKind, name?: string): Promise<Tab> {
  return tabView(
    await (await request(base, '/api/project/tabs', 'post', { body: { kind, name } })).json(),
  );
}

export async function updateTab(
  base: string,
  id: string,
  changes: components['schemas']['UpdateTab'],
): Promise<Tab> {
  return tabView(
    await (
      await request(base, '/api/project/tabs/{id}', 'post', { path: { id }, body: changes })
    ).json(),
  );
}

export async function reorderTabs(base: string, kind: string, ids: string[]): Promise<Tab[]> {
  return (
    await (await request(base, '/api/project/tabs/reorder', 'post', { body: { kind, ids } })).json()
  ).map(tabView);
}

export async function deleteTab(base: string, id: string): Promise<void> {
  await request(base, '/api/project/tabs/{id}', 'delete', { path: { id } });
}

export async function clearTab(base: string, id: string): Promise<void> {
  await request(base, '/api/project/tabs/{id}/result', 'delete', { path: { id } });
}

export async function documentMatchPage(response: Response) {
  return {
    table: tableFromIPC<TypeMap>(new Uint8Array(await response.arrayBuffer())),
    totalRows: Number(response.headers.get('x-wordflow-total-rows')),
    documentCount: Number(response.headers.get('x-wordflow-document-count')),
    matchCount: Number(response.headers.get('x-wordflow-match-count')),
    hasNext: response.headers.get('x-wordflow-has-next') === 'true',
  };
}

// Saved payloads remain unknown until the existing kind/version boundary.
type Payloads = {
  frequency: components['schemas']['FrequencyResultV1'];
  concordance: components['schemas']['ConcordanceResultV1'];
  quotation: components['schemas']['QuotationResultV1'];
  'topic-modeling': components['schemas']['TopicResultV1'];
} & Record<PlotMode, components['schemas']['PlotResultV1']>;

export function completedAnalysis<K extends keyof Payloads>(
  value: components['schemas']['Analysis'],
  kind: K,
): AnalysisResult<Payloads[K]> {
  if (
    value.kind !== kind ||
    !(
      value.result?.version === 1 ||
      (value.result?.version === 2 && ['concordance', 'quotation', 'topic-modeling'].includes(kind))
    )
  )
    throw new Error('Unsupported analysis result version');
  return value as AnalysisResult<Payloads[K]>;
}

function tabView(value: components['schemas']['Tab']): Tab {
  const kind = value.kind;
  if (
    ![
      'frequency',
      'concordance',
      'quotation',
      'topic-modeling',
      'annotation',
      'trends',
      'compare',
      'scatter',
      'heatmap',
      'sankey',
    ].includes(kind)
  )
    throw new Error('Unsupported analysis kind');
  const settings = value.settings;
  return {
    ...value,
    kind: kind as AnalysisKind,
    settings:
      settings !== null && typeof settings === 'object' && !Array.isArray(settings)
        ? (settings as Record<string, unknown>)
        : {},
  };
}
