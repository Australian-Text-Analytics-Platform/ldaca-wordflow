import { hashKey } from '@tanstack/react-query';
import type {
  AnnotationCodebook,
  AnnotationRequest,
  AnnotationSetup,
  ConcordanceRequest,
  FrequencyRequest,
  PlotInterval,
  PlotRequests,
  QuotationRequest,
  TopicRequest,
} from '@/features/project/api';

export interface RequestIssue {
  path: string;
  value: unknown;
  explanation: string;
}
type Reader<T> = (value: unknown, path: string, issues: RequestIssue[]) => T;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const child = (path: string, key: string) =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
    ? path
      ? `${path}.${key}`
      : key
    : `${path}[${JSON.stringify(key)}]`;

function field<T>(fallback: T, valid: (value: unknown) => value is T): Reader<T> {
  return (value, path, issues) => {
    if (value === undefined) return fallback;
    if (valid(value)) return value;
    issues.push({ path, value, explanation: `Using ${JSON.stringify(fallback)} instead.` });
    return fallback;
  };
}
function object<T>(fields: { [K in keyof T]: Reader<T[K]> }): Reader<T> {
  return (value, path, issues) => {
    const record = isObject(value) ? value : {};
    if (value !== undefined && !isObject(value)) {
      issues.push({
        path: path || '(request)',
        value,
        explanation: 'Using default settings instead.',
      });
    }
    for (const key of Object.keys(record)) {
      if (!Object.hasOwn(fields, key)) {
        issues.push({
          path: child(path, key),
          value: record[key],
          explanation: 'This setting is omitted.',
        });
      }
    }
    return Object.fromEntries(
      Object.entries(fields).map(([key, reader]) => [
        key,
        (reader as Reader<unknown>)(record[key], child(path, key), issues),
      ]),
    ) as T;
  };
}
const text = (fallback = '') => field(fallback, (v): v is string => typeof v === 'string');
const bool = (fallback: boolean) => field(fallback, (v): v is boolean => typeof v === 'boolean');
const context = field(
  10,
  (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 50,
);
const source = object({ schema: text(), name: text() });
const codebook = object<AnnotationCodebook>({ source, code: text(), description: text() });
const annotationSetup = object<AnnotationSetup>({
  source,
  document: text(),
  annotation: text(),
  correction: field<string | null>(
    null,
    (v): v is string | null => v === null || typeof v === 'string',
  ),
  codebook: (value, path, issues) => (value == null ? null : codebook(value, path, issues)),
});
export function decodeAnnotationSetup(value: unknown) {
  const issues: RequestIssue[] = [];
  const request = annotationSetup(value ?? undefined, '', issues);
  return { request, issues };
}
const frequencyInput = object<FrequencyRequest['inputs'][number]>({
  source,
  column: text(),
  tokenizer: text(),
});
const concordanceInput = object<ConcordanceRequest['inputs'][number]>({
  source,
  column: text(),
  tokenizer: field<string | null>(
    null,
    (v): v is string | null => v === null || typeof v === 'string',
  ),
});
function inputs<T extends { source: { schema?: string | null; name: string } }>(
  reader: Reader<T>,
): Reader<T[]> {
  return (value, path, issues) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      issues.push({ path, value, explanation: 'Choose the inputs again.' });
      return [];
    }
    const restored: T[] = [];
    value.forEach((entry, index) => {
      const location = `${path}[${String(index)}]`;
      if (!isObject(entry) || restored.length === 2) {
        issues.push({
          path: location,
          value: entry,
          explanation: !isObject(entry)
            ? 'Malformed input omitted.'
            : 'Only two inputs are supported; this input is omitted.',
        });
      } else {
        const input = reader(entry, location, issues);
        if (input.source.schema && input.source.name) restored.push(input);
        else
          issues.push({
            path: location,
            value: entry,
            explanation:
              'Input without a complete source reference omitted. Choose the input again.',
          });
      }
    });
    return restored;
  };
}
const nullableText = field<string | null>(
  null,
  (v): v is string | null => v === null || typeof v === 'string',
);
const names =
  (maximum?: number): Reader<string[]> =>
  (value, path, issues) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      issues.push({ path, value, explanation: 'Choose columns again.' });
      return [];
    }
    const result: string[] = [];
    value.forEach((entry, i) => {
      if (
        typeof entry === 'string' &&
        (maximum === undefined || result.length < maximum) &&
        !result.includes(entry)
      )
        result.push(entry);
      else
        issues.push({
          path: `${path}[${String(i)}]`,
          value: entry,
          explanation: 'Unsupported or duplicate column omitted.',
        });
    });
    return result;
  };
const measure = field<'count' | 'sum' | 'mean' | 'median'>(
  'count',
  (v): v is 'count' | 'sum' | 'mean' | 'median' =>
    ['count', 'sum', 'mean', 'median'].includes(String(v)),
);
const weight = field<'count' | 'sum'>(
  'count',
  (v): v is 'count' | 'sum' => v === 'count' || v === 'sum',
);
const interval: Reader<PlotInterval> = (value, path, issues) => {
  if (isObject(value) && value.type === 'numeric')
    return object<{ type: 'numeric'; width: string; origin: string | null }>({
      type: field('numeric' as const, (v): v is 'numeric' => v === 'numeric'),
      width: field(
        '1',
        (v): v is string =>
          typeof v === 'string' && /^(?:\d+)(?:\.\d{1,18})?$/.test(v) && Number(v) > 0,
      ),
      origin: field<string | null>(
        null,
        (v): v is string | null =>
          v === null || (typeof v === 'string' && /^-?\d+(?:\.\d{1,18})?$/.test(v)),
      ),
    })(value, path, issues);
  const restored = object<{
    type: 'time';
    unit: Extract<PlotInterval, { type: 'time' }>['unit'];
    step: number;
  }>({
    type: field('time' as const, (v): v is 'time' => v === 'time'),
    unit: field(
      'day',
      (v): v is Extract<PlotInterval, { type: 'time' }>['unit'] =>
        typeof v === 'string' &&
        ['second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'].includes(v),
    ),
    step: field(
      1,
      (v): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 4294967295,
    ),
  })(value, path, issues);
  if (['month', 'quarter', 'year'].includes(restored.unit) && restored.step !== 1) {
    issues.push({
      path: child(path, 'step'),
      value: isObject(value) ? value.step : undefined,
      explanation: 'Month, quarter and year intervals use step 1.',
    });
    restored.step = 1;
  }
  return restored;
};
const count = (fallback: number, min: number, max: number) =>
  field(
    fallback,
    (v): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max,
  );
const annotationExamples = object<NonNullable<AnnotationRequest['examples']>>({
  source,
  text: text(),
  label: text(),
  selection: field(
    'random',
    (v): v is 'random' | 'first' | 'last' => v === 'random' || v === 'first' || v === 'last',
  ),
  per_code: count(10, 1, 10),
  seed: count(0, 0, Number.MAX_SAFE_INTEGER),
});
const definitions = {
  annotation: object<AnnotationRequest>({
    setup: annotationSetup,
    inference: object({
      provider: text(),
      model: text(),
      prompt: text(),
      temperature: field<number | null>(
        null,
        (v): v is number | null =>
          v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 2),
      ),
      reasoning: field('default', (v): v is AnnotationRequest['inference']['reasoning'] =>
        ['default', 'off', 'low', 'medium', 'high'].includes(String(v)),
      ),
      batch_size: count(20, 1, 100),
      retries: count(2, 0, 10),
      concurrency: count(10, 1, 10),
    }),
    examples: (value, path, issues) =>
      value == null ? null : annotationExamples(value, path, issues),
    processing: field('all', (v): v is 'all' | 'missing' => v === 'all' || v === 'missing'),
  }),
  'topic-modeling': ((value, path, issues) => {
    const request = object<TopicRequest>({
      inputs: inputs(object({ source, column: text() })),
      embedding_model: field(
        'sentence-transformers/all-MiniLM-L6-v2',
        (v): v is string =>
          v === 'sentence-transformers/all-MiniLM-L6-v2' ||
          v === 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
      ),
      tokenizer: text('native:plain_words_en'),
      segmentation: field<TopicRequest['segmentation']>(
        'automatic',
        (v): v is TopicRequest['segmentation'] =>
          v === 'automatic' || v === 'line' || v === 'sentence',
      ),
      max_segment_tokens: field(
        256,
        (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 4 && v <= 256,
      ),
      minimum_topic_size: field(
        10,
        (v): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 2,
      ),
      seed: field(
        0,
        (v): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0,
      ),
    })(value, path, issues);
    const limit = request.embedding_model.includes('multilingual') ? 128 : 256;
    if (request.max_segment_tokens > limit) {
      if (isObject(value) && value.max_segment_tokens !== undefined)
        issues.push({
          path: child(path, 'max_segment_tokens'),
          value: isObject(value) ? value.max_segment_tokens : request.max_segment_tokens,
          explanation: `Using this model's maximum of ${String(limit)} tokens.`,
        });
      request.max_segment_tokens = limit;
    }
    return request;
  }) satisfies Reader<TopicRequest>,
  frequency: object<FrequencyRequest>({ inputs: inputs(frequencyInput) }),
  concordance: object<ConcordanceRequest>({
    inputs: inputs(concordanceInput),
    search: object<ConcordanceRequest['search']>({
      mode: field<'text' | 'tokens'>(
        'text',
        (v): v is 'text' | 'tokens' => v === 'text' || v === 'tokens',
      ),
      query: text(),
      whole_word: bool(true),
      regex: bool(false),
      case_sensitive: bool(false),
      ignore_punctuation: bool(true),
      left_context: context,
      right_context: context,
    }),
  }),
  quotation: object<QuotationRequest>({ input: object({ source, column: text() }) }),
  trends: object<PlotRequests['trends']>({
    source,
    axis: text(),
    groups: names(3),
    measure,
    value: nullableText,
    interval,
    timezone: text('UTC'),
  }),
  compare: object<PlotRequests['compare']>({
    source,
    category: text(),
    stack: nullableText,
    measure: weight,
    value: nullableText,
  }),
  scatter: object<PlotRequests['scatter']>({
    source,
    x: text(),
    y: text(),
    color: nullableText,
    size: nullableText,
    label: nullableText,
  }),
  heatmap: object<PlotRequests['heatmap']>({
    source,
    row: text(),
    column: text(),
    measure,
    value: nullableText,
  }),
  sankey: object<PlotRequests['sankey']>({
    source,
    stages: names(),
    measure: weight,
    value: nullableText,
  }),
};
interface Requests extends PlotRequests {
  annotation: AnnotationRequest;
  'topic-modeling': TopicRequest;
  frequency: FrequencyRequest;
  concordance: ConcordanceRequest;
  quotation: QuotationRequest;
}
export function decodeAnalysisRequest<K extends keyof Requests>(kind: K, value: unknown) {
  const issues: RequestIssue[] = [];
  // Null at the tab boundary means no submitted request yet.
  const request = (definitions[kind] as Reader<Requests[K]>)(value ?? undefined, '', issues);
  return { request, issues };
}
export function matchesAnalysisRequest<K extends keyof Requests>(
  kind: K,
  current: Requests[K],
  saved: unknown,
) {
  if (saved == null) return false;
  const decoded = decodeAnalysisRequest(kind, saved);
  const execution = (value: Requests[K]) => {
    if (kind === 'concordance') {
      const concordance = value as ConcordanceRequest;
      return {
        ...concordance,
        inputs: concordance.inputs.map((input) => ({
          ...input,
          tokenizer: concordance.search.mode === 'text' ? null : input.tokenizer,
        })),
      };
    }
    if (kind !== 'annotation') return value;
    const annotation = value as AnnotationRequest;
    return { ...annotation, setup: { ...annotation.setup, correction: null } };
  };
  return (
    decoded.issues.length === 0 &&
    hashKey([execution(current)]) === hashKey([execution(decoded.request)])
  );
}
export const emptyConcordance = decodeAnalysisRequest('concordance', undefined).request;
export const emptyQuotation = decodeAnalysisRequest('quotation', undefined).request;
