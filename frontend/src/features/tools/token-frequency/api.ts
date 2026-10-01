import { ProjectError, request } from '@/api/client';
import type { components } from '@/api/generated/native';
import { type ObjectRef } from '@/features/project/objects';
import { type AnalysisResult, completedAnalysis } from '@/features/tools/common/analysisApi';
import { saveGeneratedExport } from '@/lib/download';
import { tableFromIPC, type TypeMap } from 'apache-arrow';

export type FrequencyRequest = components['schemas']['FrequencyRequest'];

export type FrequencyAnalysisResult = AnalysisResult<components['schemas']['FrequencyResultV1']>;

export type FrequencyQuery = components['schemas']['FrequencyQuery'];

export type TokenizerInfo = components['schemas']['TokenizerInfo'];

export async function runFrequency(
  base: string,
  tabId: string,
  input: FrequencyRequest,
): Promise<FrequencyAnalysisResult> {
  return completedAnalysis(
    await (
      await request(base, '/api/project/tabs/{id}/frequency', 'post', {
        path: { id: tabId },
        body: input,
      })
    ).json(),
    'frequency',
  );
}

export async function getFrequencyResult(
  base: string,
  id: string,
  signal?: AbortSignal,
): Promise<FrequencyAnalysisResult | null> {
  const result = await (
    await request(base, '/api/project/analyses/{id}', 'get', { path: { id }, signal })
  ).json();
  if (result.kind === 'frequency' && result.result === null) return null;
  if (result.kind !== 'frequency' || result.result?.version !== 1)
    throw new Error('This Frequency result version is not supported.');
  // Source descriptors also initialize the request panel's legacy colours.
  const corpora = (
    result.result.payload as { corpora?: ({ source?: Partial<ObjectRef> | null } | null)[] } | null
  )?.corpora;
  if (
    !Array.isArray(corpora) ||
    corpora.some(
      (corpus) =>
        typeof corpus?.source?.schema !== 'string' || typeof corpus.source.name !== 'string',
    )
  )
    throw new Error('Saved Frequency source descriptors are invalid. Rerun to rebuild results.');
  return result as FrequencyAnalysisResult;
}

export async function queryFrequency(
  base: string,
  id: string,
  query: FrequencyQuery,
  signal?: AbortSignal,
) {
  const response = await request(base, '/api/project/analyses/{id}/frequency/query', 'post', {
    path: { id },
    body: query,
    signal,
  });
  return {
    table: tableFromIPC<TypeMap>(new Uint8Array(await response.arrayBuffer())),
    totalRows: Number(response.headers.get('x-wordflow-total-rows')),
  };
}

export async function getTokenizers(base: string, signal?: AbortSignal): Promise<TokenizerInfo[]> {
  return (await request(base, '/api/project/tokenizers', 'get', { signal })).json();
}

export async function downloadFrequency(
  base: string,
  id: string,
  query: FrequencyQuery,
  format: 'csv' | 'markdown',
): Promise<Blob> {
  return (
    await request(base, '/api/project/analyses/{id}/frequency/export', 'post', {
      path: { id },
      body: {
        query,
        format,
      },
    })
  ).blob();
}

export async function downloadFrequencyParts(
  base: string,
  id: string,
  query: FrequencyQuery,
  format: 'csv' | 'markdown',
) {
  const response = await request(base, '/api/project/analyses/{id}/frequency/export', 'post', {
    path: { id },
    body: {
      query,
      format,
      include_stopwords: true,
    },
  });
  const parts = await response.formData();
  const table = parts.get('table');
  const words = parts.get('stopwords');
  if (!(table instanceof Blob) || !(words instanceof Blob))
    throw new Error('Incomplete Frequency export');
  return { table, stopwords: (await words.text()).split('\n').filter(Boolean) };
}

export async function exportFrequency(
  base: string,
  id: string,
  query: FrequencyQuery,
  format: 'csv' | 'markdown',
  suggestedName?: string,
): Promise<string | null> {
  const { isTauri } = await import('@/lib/isTauri');
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      return await invoke<string | null>('save_frequency_export', {
        analysisId: id,
        query,
        format,
      });
    } catch (error) {
      throw ProjectError.fromNative(error);
    }
  }
  const name = suggestedName ?? `frequency.${format === 'markdown' ? 'md' : 'csv'}`;
  return saveGeneratedExport(await downloadFrequency(base, id, query, format), name);
}
