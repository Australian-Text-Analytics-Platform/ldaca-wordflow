import { request } from '@/api/client';
import type { components } from '@/api/generated/native';
import {
  type AnalysisResult,
  completedAnalysis,
  documentMatchPage,
} from '@/features/tools/common/analysisApi';
import { tableFromIPC, type TypeMap } from 'apache-arrow';

export type ConcordanceSearch = Required<components['schemas']['ConcordanceSearch']>;

export type ConcordanceInput = components['schemas']['ConcordanceInput'];

export type ConcordanceRequest = Omit<components['schemas']['ConcordanceRequest'], 'search'> & {
  search: ConcordanceSearch;
};

export type ConcordanceAnalysisResult = AnalysisResult<
  components['schemas']['ConcordanceResultV1']
>;

export type ConcordanceFilter = components['schemas']['ConcordanceFilter'];

export type ConcordanceSort = components['schemas']['SavedSort'];

export type ConcordanceQuery = Required<components['schemas']['ConcordanceQuery']>;

export type ConcordancePreviewRequest = Omit<
  Required<components['schemas']['ConcordancePreview']>,
  'search'
> & { search: ConcordanceSearch };

export type ConcordancePublishSource = components['schemas']['PublishSource'];

export async function runConcordance(
  base: string,
  tabId: string,
  input: ConcordanceRequest,
): Promise<ConcordanceAnalysisResult> {
  return completedAnalysis(
    await (
      await request(base, '/api/project/tabs/{id}/concordance', 'post', {
        path: { id: tabId },
        body: input,
      })
    ).json(),
    'concordance',
  );
}

export async function getConcordanceResult(
  base: string,
  id: string,
  signal?: AbortSignal,
): Promise<ConcordanceAnalysisResult | null> {
  const result = await (
    await request(base, '/api/project/analyses/{id}', 'get', { path: { id }, signal })
  ).json();
  if (result.kind === 'concordance' && result.result === null) return null;
  if (result.kind !== 'concordance' || result.result?.version !== 1)
    throw new Error('Unsupported Concordance result version');
  return result as ConcordanceAnalysisResult;
}

export async function previewConcordance(
  base: string,
  id: string,
  input: ConcordancePreviewRequest,
  signal?: AbortSignal,
) {
  return documentMatchPage(
    await request(base, '/api/project/tabs/{id}/concordance/preview', 'post', {
      path: { id },
      body: input,
      signal,
    }),
  );
}

export async function queryConcordance(
  base: string,
  id: string,
  input: ConcordanceQuery,
  signal?: AbortSignal,
) {
  return documentMatchPage(
    await request(base, '/api/project/analyses/{id}/concordance/query', 'post', {
      path: { id },
      body: input,
      signal,
    }),
  );
}

export async function concordanceDensity(
  base: string,
  id: string,
  input: components['schemas']['ConcordanceDensity'],
  signal?: AbortSignal,
) {
  return tableFromIPC<TypeMap>(
    new Uint8Array(
      await (
        await request(base, '/api/project/analyses/{id}/concordance/density', 'post', {
          path: { id },
          body: input,
          signal,
        })
      ).arrayBuffer(),
    ),
  );
}

export async function publishConcordance(
  base: string,
  id: string,
  projection: 'matches' | 'documents',
  sources: ConcordancePublishSource[],
) {
  return (
    await request(base, '/api/project/analyses/{id}/concordance/publish', 'post', {
      path: { id },
      body: {
        projection,
        sources,
      },
    })
  ).json();
}
