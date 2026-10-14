import { request } from '@/api/client';
import type { components } from '@/api/generated/native';
import { type CellEditSession } from '@/features/table-editing/api';
import { type Analysis } from '@/features/tools/common/analysisApi';
import { decodeArrowData } from '@/lib/arrow/decodeArrowTable';
import { tableFromIPC, type Table, type TypeMap } from 'apache-arrow';

export type AnnotationCodebook = components['schemas']['Codebook'];

export type AnnotationSetup = components['schemas']['ManualSetup'];

export type MutationStamp = components['schemas']['MutationStamp'];

export type AnnotationEdit = components['schemas']['EditRequest'];

export type AnnotationFilter = components['schemas']['RowFilter'];

export type AnnotationReview = Required<components['schemas']['Review']>;

export type AnnotationComparison = components['schemas']['Comparison'];

export type AnnotationReviewSummary = components['schemas']['ReviewSummary'];

export async function beginAnnotationEdit(
  base: string,
  tab: string,
  input: AnnotationEdit,
): Promise<CellEditSession> {
  return (
    await request(base, '/api/project/tabs/{id}/annotation/edit', 'post', {
      path: { id: tab },
      body: input,
    })
  ).json();
}

export async function createAnnotationCodebook(
  base: string,
  name: string,
): Promise<AnnotationCodebook> {
  return (
    await request(base, '/api/project/annotation/codebooks', 'post', { body: { name } })
  ).json();
}

export async function annotationCodebook(
  base: string,
  book: AnnotationCodebook,
  signal?: AbortSignal,
): Promise<components['schemas']['Code'][]> {
  return (
    await request(base, '/api/project/annotation/codebook', 'post', { body: book, signal })
  ).json();
}

export type AnnotationInference = Required<components['schemas']['Inference']>;

export type AnnotationExamples = components['schemas']['AnnotationExamples'];

export type AnnotationRequest = components['schemas']['AnnotationRequest'];

type AnnotationReport = components['schemas']['AnnotationReport'];

export interface AnnotationResult {
  id: string;
  request: unknown;
  request_status: components['schemas']['RequestRestoration'];
  report: AnnotationReport;
}

export type AnnotationPrediction = components['schemas']['Prediction'] | null;

export type AnnotationPreview = components['schemas']['AnnotationPreviewMetadata'] & {
  table: Table<TypeMap>;
};

export async function runAnnotation(base: string, tab: string, input: AnnotationRequest) {
  await request(base, '/api/project/tabs/{id}/annotation', 'post', {
    path: { id: tab },
    body: input,
  });
}

export async function previewAnnotation(
  base: string,
  tab: string,
  input: AnnotationRequest,
  page: number,
  page_size: number,
  signal: AbortSignal,
): Promise<AnnotationPreview> {
  const response = await request(base, '/api/project/tabs/{id}/annotation/preview', 'post', {
    path: { id: tab },
    body: { request: input, page, page_size },
    signal,
  });
  const table = tableFromIPC<TypeMap>(new Uint8Array(await response.arrayBuffer()));
  const value = JSON.parse(
    table.schema.metadata.get('wordflow:annotation-preview') ?? '{}',
  ) as Omit<AnnotationPreview, 'table'>;
  if (!Array.isArray(value.predictions))
    throw new Error('Annotation Preview metadata is unavailable');
  return { ...value, table };
}

export async function getAnnotationResult(
  base: string,
  id: string,
  signal?: AbortSignal,
): Promise<AnnotationResult | null> {
  const analysis = (await (
    await request(base, '/api/project/analyses/{id}', 'get', { path: { id }, signal })
  ).json()) as Analysis<AnnotationReport>;
  if (analysis.kind === 'annotation' && analysis.result === null) return null;
  if (analysis.kind !== 'annotation' || analysis.result?.version !== 1)
    throw new Error('Unsupported Annotation result');
  return {
    id: analysis.id,
    request: analysis.request,
    request_status: analysis.request_status,
    report: analysis.result.payload,
  };
}

export async function annotationRows(
  base: string,
  id: string,
  page: number,
  page_size: number,
  review: AnnotationReview,
  signal?: AbortSignal,
  correction: string | null = null,
  sorting: components['schemas']['CellEditSort'][] = [],
) {
  const response = await request(base, '/api/project/analyses/{id}/annotation/query', 'post', {
    path: { id },
    body: { view: 'rows', page, page_size, sorting, review, correction },
    signal,
  });
  const table = tableFromIPC<TypeMap>(new Uint8Array(await response.arrayBuffer()));
  return {
    table,
    summary: JSON.parse(
      table.schema.metadata.get('wordflow:annotation-review') ?? '{}',
    ) as AnnotationReviewSummary,
    live: JSON.parse(
      table.schema.metadata.get('wordflow:annotation-live') ?? '{}',
    ) as components['schemas']['AnnotationLiveMetadata'],
  };
}

export async function annotationContext(
  base: string,
  id: string,
  signal?: AbortSignal,
): Promise<components['schemas']['Context']> {
  return (
    await request(base, '/api/project/analyses/{id}/annotation/query', 'post', {
      path: { id },
      body: { view: 'context' },
      signal,
    })
  ).json();
}

export async function annotationDiagnostics(
  base: string,
  id: string,
  page: number,
  signal?: AbortSignal,
) {
  const response = await request(base, '/api/project/analyses/{id}/annotation/query', 'post', {
    path: { id },
    body: { view: 'diagnostics', page, page_size: 20 },
    signal,
  });
  return decodeArrowData(tableFromIPC<TypeMap>(new Uint8Array(await response.arrayBuffer())));
}
