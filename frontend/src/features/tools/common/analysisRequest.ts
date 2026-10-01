import type { components } from '@/api/generated/native';
import type { AnnotationRequest } from '@/features/tools/annotation/api';
import type { ConcordanceRequest } from '@/features/tools/concordance/api';
import type { PlotRequests } from '@/features/tools/plots/api';
import type { QuotationRequest } from '@/features/tools/quotation/api';
import type { FrequencyRequest } from '@/features/tools/token-frequency/api';
import type { TopicRequest } from '@/features/tools/topic-modeling/api';
import { hashKey } from '@tanstack/react-query';
import { useId } from 'react';
import { create } from 'zustand';

interface Requests extends PlotRequests {
  annotation: AnnotationRequest;
  'topic-modeling': TopicRequest;
  frequency: FrequencyRequest;
  concordance: ConcordanceRequest;
  quotation: QuotationRequest;
}

export interface RequestIssue {
  path: string;
  value: unknown;
  explanation: string;
}
export type RequestRestoration = components['schemas']['RequestRestoration'];
const defaults: Requests = {
  annotation: {
    setup: {
      source: {
        schema: '',
        name: '',
      },
      document: '',
      annotation: '',
      correction: null,
      codebook: null,
    },
    inference: {
      provider: '',
      model: '',
      prompt: '',
      temperature: null,
      reasoning: 'default',
      batch_size: 20,
      retries: 2,
      concurrency: 10,
    },
    examples: null,
    processing: 'all',
  },
  'topic-modeling': {
    inputs: [],
    embedding_model: 'sentence-transformers/all-MiniLM-L6-v2',
    tokenizer: 'native:plain_words_en',
    segmentation: 'automatic',
    max_segment_tokens: 256,
    minimum_topic_size: 10,
    seed: 0,
  },
  frequency: {
    inputs: [],
  },
  concordance: {
    inputs: [],
    search: {
      mode: 'text',
      query: '',
      whole_word: true,
      regex: false,
      case_sensitive: false,
      ignore_punctuation: true,
      left_context: 10,
      right_context: 10,
    },
  },
  quotation: {
    input: {
      source: {
        schema: '',
        name: '',
      },
      column: '',
    },
  },
  trends: {
    source: {
      schema: '',
      name: '',
    },
    axis: '',
    groups: [],
    measure: 'count',
    value: null,
    interval: {
      type: 'time',
      unit: 'day',
      step: 1,
    },
    timezone: 'UTC',
  },
  compare: {
    source: {
      schema: '',
      name: '',
    },
    category: '',
    stack: null,
    measure: 'count',
    value: null,
  },
  scatter: {
    source: {
      schema: '',
      name: '',
    },
    x: '',
    y: '',
    color: null,
    size: null,
    label: null,
  },
  heatmap: {
    source: {
      schema: '',
      name: '',
    },
    row: '',
    column: '',
    measure: 'count',
    value: null,
  },
  sankey: {
    source: {
      schema: '',
      name: '',
    },
    stages: [],
    measure: 'count',
    value: null,
  },
};
export const defaultAnalysisRequest = <K extends keyof Requests>(kind: K): Requests[K] =>
  structuredClone(defaults[kind]);
export function decodeAnalysisRequest<K extends keyof Requests>(
  kind: K,
  state?: RequestRestoration,
  original?: unknown,
) {
  if (state?.status === 'supported' && state.request.kind === kind)
    return { request: state.request.request as Requests[K], issues: [] as RequestIssue[] };
  return {
    request: defaultAnalysisRequest(kind),
    issues: state
      ? [
          {
            path: '(request)',
            value: original ?? state,
            explanation:
              state.status === 'unsupported' ? state.reason : 'Analysis kind does not match.',
          },
        ]
      : [],
  };
}
const useRequestResets = create<{ acknowledged: Record<string, boolean> }>()(() => ({
  acknowledged: {},
}));
export function useRequestReset(scope: [string, string] | undefined, original: unknown) {
  const localId = useId();
  const identity = hashKey([scope ?? localId, original]);
  const resetDone = useRequestResets((state) => state.acknowledged[identity] === true);
  return {
    resetDone,
    acknowledge: () => {
      useRequestResets.setState((state) => ({
        acknowledged: { ...state.acknowledged, [identity]: true },
      }));
    },
  };
}
export function useRequestRestoration<K extends keyof Requests>(
  kind: K,
  analysis:
    | { id?: string; request: unknown; request_status: RequestRestoration }
    | null
    | undefined,
  scope?: [string, string],
) {
  const restored = decodeAnalysisRequest(kind, analysis?.request_status, analysis?.request);
  const { resetDone, acknowledge } = useRequestReset(scope, [analysis?.id, analysis?.request]);
  return {
    ...restored,
    blocked: restored.issues.length > 0 && !resetDone,
    reset: (change: (request: Requests[K]) => void) => {
      change(defaultAnalysisRequest(kind));
      acknowledge();
    },
  };
}
export function matchesAnalysisRequest<K extends keyof Requests>(
  kind: K,
  current: Requests[K],
  saved: RequestRestoration | Requests[K] | null | undefined,
) {
  if (!saved) return false;
  if ('status' in saved && (saved.status !== 'supported' || saved.request.kind !== kind))
    return false;
  const execution = (value: Requests[K]) => {
    if (kind === 'concordance') {
      const request = value as ConcordanceRequest;
      return {
        ...request,
        inputs: request.inputs.map((input) => ({
          ...input,
          tokenizer: request.search.mode === 'text' ? null : input.tokenizer,
        })),
      };
    }
    if (kind === 'annotation') {
      const request = value as AnnotationRequest;
      return { ...request, setup: { ...request.setup, correction: null } };
    }
    return value;
  };
  return (
    hashKey([execution(current)]) ===
    hashKey([execution(('status' in saved ? saved.request.request : saved) as Requests[K])])
  );
}
export function decodeAnnotationSetup(
  state?: components['schemas']['SetupRestoration'] | null,
  original?: unknown,
) {
  return state?.status === 'supported'
    ? { request: state.request, issues: [] as RequestIssue[] }
    : {
        request: defaultAnalysisRequest('annotation').setup,
        issues: state
          ? [{ path: '(setup)', value: original ?? state, explanation: state.reason }]
          : [],
      };
}
export const emptyConcordance = defaultAnalysisRequest('concordance');
export const emptyQuotation = defaultAnalysisRequest('quotation');
