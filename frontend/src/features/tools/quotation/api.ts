import { request } from '@/api/client';
import type { components } from '@/api/generated/native';
import {
  type AnalysisResult,
  completedAnalysis,
  documentMatchPage,
} from '@/features/tools/common/analysisApi';

export type QuotationRequest = components['schemas']['QuotationRequest'];

export type QuotationPreviewRequest = Required<components['schemas']['QuotationPreview']>;

export type QuotationAnalysisResult = AnalysisResult<components['schemas']['QuotationResultV1']>;

export type QuotationQuery = components['schemas']['QuotationQuery'];

export type QuotationPublish = components['schemas']['QuotationPublish'];

export async function getQuotationResult(
  base: string,
  id: string,
  signal?: AbortSignal,
): Promise<QuotationAnalysisResult | null> {
  const result = await (
    await request(base, '/api/project/analyses/{id}', 'get', { path: { id }, signal })
  ).json();
  if (result.kind === 'quotation' && result.result === null) return null;
  if (result.kind !== 'quotation' || ![1, 2].includes(result.result?.version ?? 0))
    throw new Error('Unsupported Quotation result version');
  return result as QuotationAnalysisResult;
}

export async function runQuotation(
  base: string,
  id: string,
  input: QuotationRequest,
): Promise<QuotationAnalysisResult> {
  return completedAnalysis(
    await (
      await request(base, '/api/project/tabs/{id}/quotation', 'post', {
        path: { id },
        body: input,
      })
    ).json(),
    'quotation',
  );
}

export async function previewQuotation(
  base: string,
  id: string,
  input: QuotationPreviewRequest,
  signal?: AbortSignal,
) {
  return documentMatchPage(
    await request(base, '/api/project/tabs/{id}/quotation/preview', 'post', {
      path: { id },
      body: input,
      signal,
    }),
  );
}

export async function queryQuotation(
  base: string,
  id: string,
  input: QuotationQuery,
  signal?: AbortSignal,
) {
  return documentMatchPage(
    await request(base, '/api/project/analyses/{id}/quotation/query', 'post', {
      path: { id },
      body: input,
      signal,
    }),
  );
}

export async function publishQuotation(base: string, id: string, input: QuotationPublish) {
  return (
    await request(base, '/api/project/analyses/{id}/quotation/publish', 'post', {
      path: { id },
      body: input,
    })
  ).json();
}
