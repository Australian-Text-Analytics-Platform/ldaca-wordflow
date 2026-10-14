import { ProjectError, request } from '@/api/client';
import type { components } from '@/api/generated/native';
import { type ObjectRef } from '@/features/project/objects';
import {
  type Analysis,
  type AnalysisResult,
  completedAnalysis,
  documentMatchPage,
} from '@/features/tools/common/analysisApi';

export type TopicRequest = components['schemas']['TopicRequest'];
export type TopicAdjustmentSettings = components['schemas']['TopicAdjustmentSettings'];

export type TopicSampling = components['schemas']['Sampling'];

export type TopicSummary = components['schemas']['PreviewSummary'];

export async function adjustTopicModel(
  base: string,
  owner: { analysis: string } | { tab: string; preview: string },
  input: components['schemas']['TopicAdjustment'],
  signal: AbortSignal,
): Promise<{ summary: TopicSummary; analysis?: TopicAnalysisResult }> {
  if ('analysis' in owner) {
    const analysis = completedAnalysis(
      await (
        await request(base, '/api/project/analyses/{id}/topic-modeling/adjust', 'post', {
          path: { id: owner.analysis },
          body: input,
          signal,
        })
      ).json(),
      'topic-modeling',
    ) as TopicAnalysisResult;
    return { summary: analysis.result.payload, analysis };
  }
  const summary = await (
    await request(base, '/api/project/tabs/{tab}/topic-modeling/preview/{id}/adjust', 'post', {
      path: { tab: owner.tab, id: owner.preview },
      body: input,
      signal,
    })
  ).json();
  return { summary };
}

export type TopicAnalysisResult = AnalysisResult<components['schemas']['TopicResultV1']>;

export type TopicWord = components['schemas']['RepresentativeWord'];

export type TopicBasis = Extract<components['schemas']['TopicProjection'], { projection: 'map' }>;

export type TopicWords = Extract<components['schemas']['TopicProjection'], { projection: 'words' }>;

export type TopicQuery = Exclude<components['schemas']['TopicQuery'], { projection: 'documents' }>;

export type TopicDocumentQuery = Extract<
  components['schemas']['TopicQuery'],
  { projection: 'documents' }
>;

export async function queryTopicDocuments(
  base: string,
  owner: { analysis: string } | { tab: string; preview: string },
  input: TopicDocumentQuery,
  signal?: AbortSignal,
) {
  return documentMatchPage(
    await ('analysis' in owner
      ? request(base, '/api/project/analyses/{id}/topic-modeling/query', 'post', {
          path: { id: owner.analysis },
          body: input,
          signal,
        })
      : request(base, '/api/project/tabs/{tab}/topic-modeling/preview/{id}/query', 'post', {
          path: { tab: owner.tab, id: owner.preview },
          body: input,
          signal,
        })),
  );
}

export type TopicPreviewUpdate = components['schemas']['TopicPreviewUpdate'];

export type TopicPublish = components['schemas']['TopicPublish'];

export function embeddingModels(base: string, signal?: AbortSignal) {
  return request(base, '/api/project/embedding-models', 'get', { signal }).then((r) => r.json());
}

export async function runTopicModel(
  base: string,
  id: string,
  input: TopicRequest,
): Promise<TopicAnalysisResult> {
  return completedAnalysis(
    await (
      await request(base, '/api/project/tabs/{id}/topic-modeling', 'post', {
        path: { id },
        body: input,
      })
    ).json(),
    'topic-modeling',
  );
}

export async function getTopicResult(
  base: string,
  id: string,
  signal?: AbortSignal,
): Promise<TopicAnalysisResult | null> {
  const value = (await (
    await request(base, '/api/project/analyses/{id}', 'get', { path: { id }, signal })
  ).json()) as Analysis<Partial<TopicSummary>>;
  if (value.kind === 'topic-modeling' && value.result === null) return null;
  if (
    value.kind !== 'topic-modeling' ||
    !value.result ||
    ![1, 2].includes(value.result?.version ?? 0) ||
    !Array.isArray(value.result.payload.sources) ||
    !Number.isInteger(value.result.payload.natural_topic_count)
  )
    throw new Error(
      'This Topic Modelling result is unavailable or unsupported. Rerun to rebuild it.',
    );
  return value as TopicAnalysisResult;
}

export async function queryTopicModel(
  base: string,
  owner: { analysis: string } | { tab: string; preview: string },
  input: TopicQuery,
  signal?: AbortSignal,
  expectedProjection?: string,
): Promise<TopicBasis | TopicWords> {
  const result = await (
    await ('analysis' in owner
      ? request(base, '/api/project/analyses/{id}/topic-modeling/query', 'post', {
          path: { id: owner.analysis },
          body: input,
          signal,
        })
      : request(base, '/api/project/tabs/{tab}/topic-modeling/preview/{id}/query', 'post', {
          path: { tab: owner.tab, id: owner.preview },
          body: input,
          signal,
        }))
  ).json();
  if (expectedProjection && result.natural_projection !== expectedProjection)
    throw new ProjectError('Topic results changed. Refresh to load the current result.', '');
  return result;
}

export async function publishTopicModel(
  base: string,
  id: string,
  input: TopicPublish,
): Promise<ObjectRef[]> {
  return (
    await request(base, '/api/project/analyses/{id}/topic-modeling/publish', 'post', {
      path: { id },
      body: input,
    })
  ).json();
}

export async function deleteTopicPreview(base: string, tab: string, id: string) {
  await request(base, '/api/project/tabs/{tab}/topic-modeling/preview/{id}', 'delete', {
    path: { tab, id },
  });
}

/** A POST stream has no reconnection: reconnecting would silently fit a new model. */
export async function streamTopicPreview(
  base: string,
  tab: string,
  input: components['schemas']['TopicPreviewRequest'],
  signal: AbortSignal,
  onUpdate: (update: TopicPreviewUpdate) => void,
) {
  const response = await request(base, '/api/project/tabs/{id}/topic-modeling/preview', 'post', {
    path: { id: tab },
    body: input,
    signal,
  });
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Preview streaming is unavailable.');
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data || signal.aborted) continue;
        const update = JSON.parse(data) as TopicPreviewUpdate;
        if (update.state === 'failed')
          throw new ProjectError(update.error.message, JSON.stringify({ error: update.error }));
        onUpdate(update);
      }
    }
    if (!signal.aborted)
      throw new Error('The Preview connection closed. Click Preview to sample again.');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
