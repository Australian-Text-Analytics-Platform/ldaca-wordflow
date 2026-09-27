import { clearSavedAnalysis, savedAnalysisQuery } from '@/features/project/savedAnalysis';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import { ProviderSelector } from '@/features/ai/ProviderSelector';
import * as api from '@/features/project/api';
import { schemaQuery } from '@/features/project/projectQueries';
import { isArrowStringField } from '@/lib/arrow/decodeArrowTable';
import { decodeAnalysisRequest, matchesAnalysisRequest } from '../common/analysisRequest';
import { AnalysisAction } from '../common/components/AnalysisAction';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { AnalysisResultBoundary } from '../common/components/AnalysisResultBoundary';
import { NodeColumnSelector } from '../common/components/NodeColumnSelector';
import { RequestCompatibilityWarning } from '../common/components/RequestCompatibilityWarning';
import { useAnalysisRecovery } from '../common/useAnalysisRecovery';
import type { CorrectionSession } from './CorrectionDraft';
import { AnnotationOutput } from './AnnotationOutput';
import { useAnnotationPreview } from './useAnnotationPreview';

const PROMPT =
  'Read each document and assign the single most appropriate code from the Codebook. Use null if none applies.';
export function AnnotationAi({
  base,
  tab,
  request,
  onChange,
  nodes,
  tasks,
  onCancel,
  active,
  onEditingChange,
}: {
  base: string;
  tab: api.Tab;
  request: api.AnnotationRequest;
  onChange: (request: api.AnnotationRequest) => void;
  nodes: api.ProjectNode[];
  tasks: api.NativeTask[];
  onCancel: (id: string) => void;
  active: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const cache = useQueryClient();
  const connections = useQuery({
    queryKey: ['host', base, 'ai-providers'],
    queryFn: ({ signal }) => api.aiConnections(base, signal),
  });
  const provider = connections.data?.find((c) => c.id === request.inference.provider)?.provider;
  const [editor, setEditor] = useState<CorrectionSession | null>(null);
  const finishEditor = () => {
    setEditor(null);
    onEditingChange?.(false);
  };
  const preview = useAnnotationPreview(base, tab.id, active);
  const id = tab.analysis?.has_result ? tab.analysis.id : null;
  const result = useQuery({
    ...savedAnalysisQuery(cache, base, tab, (id, signal) =>
      api.getAnnotationResult(base, id, signal),
    ),
    enabled: active && Boolean(id),
  });
  const recovery = useAnalysisRecovery(base, id);
  const restored = decodeAnalysisRequest('annotation', tab.analysis?.request);
  const running = tasks.find((t) => t.tab_id === tab.id && t.finished_at === null);
  const run = useMutation({
    mutationFn: (value: api.AnnotationRequest) => api.runAnnotation(base, tab.id, value),
    onSettled: () => cache.invalidateQueries({ queryKey: ['native', base, 'tabs', 'annotation'] }),
  });
  const clear = useMutation({
    mutationFn: () => clearSavedAnalysis(cache, base, tab),
  });
  const [advanced, setAdvanced] = useState(false);
  const examples = useQuery({
    ...schemaQuery(base, request.examples?.source ?? { schema: 'data', name: '' }),
    enabled: active && Boolean(request.examples?.source.name),
  });
  const exampleColumns = (examples.data ?? [])
    .filter((c) => isArrowStringField(c.field))
    .map((c) => c.name);
  const update = (patch: Partial<api.AnnotationInference>) => {
    onChange({ ...request, inference: { ...request.inference, ...patch } });
  };
  const busy = run.isPending || Boolean(running);
  const ready = Boolean(
    request.setup.source.name &&
      request.setup.document &&
      request.setup.codebook?.code &&
      request.setup.codebook.description &&
      request.inference.provider &&
      request.inference.model.trim(),
  );
  const partial = (result.data?.report.failed ?? 0) > 0;
  const unchanged =
    Boolean(id) &&
    matchesAnalysisRequest('annotation', request, result.data?.request ?? tab.analysis?.request);
  const reason = editor
    ? 'Save or cancel correction edits first.'
    : busy
      ? 'This analysis is already running.'
      : !ready
        ? 'Choose a source, document column, Codebook and provider/model first.'
        : unchanged && !recovery.failed && !partial
          ? 'These settings already have saved results. Change the parameters or clear results to run again.'
          : undefined;
  const displayedSetup =
    editor?.setup ??
    (preview.state
      ? preview.state.request.setup
      : result.data
        ? decodeAnalysisRequest('annotation', result.data.request).request.setup
        : request.setup);
  const outputSetup = {
    ...displayedSetup,
    correction: api.sameTarget(displayedSetup.source, request.setup.source)
      ? request.setup.correction
      : displayedSetup.correction,
  };
  const openEditor = (session: api.CellEditSession, setup: api.AnnotationSetup) => {
    setEditor({ session, setup, preview: Boolean(preview.state), analysisId: id });
    onEditingChange?.(true);
  };
  const useExamples = () => {
    if (outputSetup.correction)
      onChange({
        ...request,
        examples: {
          source: outputSetup.source,
          text: outputSetup.document,
          label: outputSetup.correction,
          selection: 'random',
          per_code: 10,
          seed: 0,
        },
      });
  };
  const writable = nodes.some(
    (n) => n.table_name === request.setup.source.name && n.kind === 'table',
  );
  return (
    <>
      <section
        aria-label="AI Annotation parameters"
        className="space-y-3 rounded-lg border border-surface-border p-3"
      >
        <h2 className="font-semibold">AI Annotation</h2>
        <ProviderSelector
          base={base}
          provider={request.inference.provider}
          model={request.inference.model}
          onChange={(provider, model) => {
            update({ provider, model });
          }}
        />
        <label className="block space-y-1">
          Instruction
          <Textarea
            aria-label="Annotation instruction"
            value={request.inference.prompt}
            placeholder={PROMPT}
            onChange={(e) => {
              update({ prompt: e.target.value });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Tab' && !e.shiftKey && !request.inference.prompt) {
                e.preventDefault();
                update({ prompt: PROMPT });
              }
            }}
          />
        </label>
        <label className="block space-y-1">
          Processing
          <SearchableSelect
            ariaLabel="Annotation processing"
            value={request.processing}
            options={[
              { value: 'all', label: 'Reprocess all' },
              { value: 'missing', label: 'Fill missing only' },
            ]}
            onChange={(value) => {
              onChange({ ...request, processing: value as api.AnnotationRequest['processing'] });
            }}
          />
        </label>
        <details
          open={advanced}
          onToggle={(e) => {
            setAdvanced(e.currentTarget.open);
          }}
        >
          <summary className="cursor-pointer">Advanced settings and examples</summary>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-3">
              <label className="min-w-40 flex-1">
                Temperature
                <Input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={request.inference.temperature ?? ''}
                  placeholder="Provider default"
                  onChange={(e) => {
                    update({ temperature: e.target.value === '' ? null : Number(e.target.value) });
                  }}
                />
              </label>
              <label className="min-w-40 flex-1">
                Reasoning
                <SearchableSelect
                  ariaLabel="Reasoning"
                  value={request.inference.reasoning}
                  options={[
                    'default',
                    ...(provider === 'apple' ? [] : ['low', 'medium', 'high']),
                    ...(provider === 'openrouter' ||
                    request.inference.model.startsWith('gemini-2.5-flash') ||
                    request.inference.model.startsWith('gpt-5.1') ||
                    (request.inference.model.startsWith('gpt-5.2') &&
                      !request.inference.model.includes('pro')) ||
                    /^claude-(sonnet|haiku|opus)-4-5/.test(request.inference.model)
                      ? ['off']
                      : []),
                  ].map((value) => ({
                    value,
                    label: value === 'default' ? 'Provider default' : value,
                  }))}
                  onChange={(value) => {
                    update({ reasoning: value as api.AnnotationInference['reasoning'] });
                  }}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              {(['batch_size', 'retries', 'concurrency'] as const).map((key) => (
                <label className="min-w-32 flex-1" key={key}>
                  {key === 'batch_size'
                    ? 'Batch size'
                    : key === 'retries'
                      ? 'Retries'
                      : 'Concurrent requests'}
                  <Input
                    type="number"
                    min={key === 'retries' ? 0 : 1}
                    max={key === 'batch_size' ? 100 : 10}
                    value={request.inference[key]}
                    onChange={(e) => {
                      update({ [key]: Number(e.target.value) });
                    }}
                  />
                </label>
              ))}
            </div>
            <label className="block space-y-1">
              Examples
              <SearchableSelect
                ariaLabel="Example source"
                value={request.examples?.source.name ?? ''}
                pinnedOptions={[{ value: '', label: 'None — zero-shot' }]}
                options={nodes.map((n) => ({ value: n.table_name }))}
                onChange={(name) => {
                  onChange({
                    ...request,
                    examples: name
                      ? {
                          source: { schema: 'data', name },
                          text: '',
                          label: '',
                          selection: 'random',
                          per_code: 10,
                          seed: 0,
                        }
                      : null,
                  });
                }}
              />
            </label>
            {request.examples && (
              <>
                <div className="flex flex-wrap gap-2">
                  {(['text', 'label'] as const).map((key) => (
                    <NodeColumnSelector
                      key={key}
                      label={`Example ${key} column`}
                      value={request.examples?.[key] ?? ''}
                      columns={exampleColumns}
                      onChange={(value) => {
                        if (request.examples)
                          onChange({ ...request, examples: { ...request.examples, [key]: value } });
                      }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <SearchableSelect
                    ariaLabel="Example selection"
                    value={request.examples.selection}
                    options={[
                      { value: 'random', label: 'Random' },
                      { value: 'first', label: 'First N' },
                      { value: 'last', label: 'Last N' },
                    ]}
                    onChange={(value) => {
                      if (request.examples)
                        onChange({
                          ...request,
                          examples: {
                            ...request.examples,
                            selection: value as api.AnnotationExamples['selection'],
                          },
                        });
                    }}
                  />
                  <label>
                    Per code
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={request.examples.per_code}
                      onChange={(e) => {
                        if (request.examples)
                          onChange({
                            ...request,
                            examples: { ...request.examples, per_code: Number(e.target.value) },
                          });
                      }}
                    />
                  </label>
                  <label>
                    Seed
                    <Input
                      type="number"
                      min={0}
                      value={request.examples.seed}
                      onChange={(e) => {
                        if (request.examples)
                          onChange({
                            ...request,
                            examples: { ...request.examples, seed: Number(e.target.value) },
                          });
                      }}
                    />
                  </label>
                </div>
              </>
            )}
          </div>
        </details>
        <RequestCompatibilityWarning issues={restored.issues} />
        <div className="flex flex-wrap gap-2">
          <AnalysisAction
            reason={
              reason ??
              (!writable
                ? 'Materialize the source in place before Run.'
                : !request.setup.annotation
                  ? 'Choose an annotation destination before Run.'
                  : undefined)
            }
            onClick={() => {
              preview.clear();
              onChange(request);
              run.mutate(structuredClone(request));
            }}
          >
            {recovery.failed || partial || (id && restored.issues.length > 0) ? 'Rerun' : 'Run'}
          </AnalysisAction>
          <Button
            variant="ghost"
            disabled={busy || clear.isPending || (!id && !preview.state)}
            onClick={() => {
              preview.clear();
              if (id) clear.mutate();
            }}
          >
            Clear results
          </Button>
          <AnalysisAction
            variant="outline"
            reason={editor ? undefined : reason}
            onClick={() => {
              preview.submit(request);
            }}
          >
            Preview
          </AnalysisAction>
        </div>
      </section>
      {busy ? (
        <AnalysisProgress
          name={tab.name}
          task={running}
          onCancel={
            running
              ? () => {
                  onCancel(running.id);
                }
              : undefined
          }
        />
      ) : preview.state || editor || (id && result.data) ? (
        <AnalysisResultBoundary
          base={base}
          analysisId={id ?? ''}
          name={tab.name}
          onError={recovery.onRenderError}
          onReset={recovery.reset}
        >
          <AnnotationOutput
            key={editor?.preview || preview.state ? 'preview' : (editor?.analysisId ?? id)}
            base={base}
            tab={tab.id}
            setup={outputSetup}
            result={!preview.state && !editor?.preview ? (result.data ?? undefined) : undefined}
            previewMode={Boolean(preview.state) || Boolean(editor?.preview)}
            preview={preview.state?.data}
            pending={preview.state && !preview.state.data ? preview.state : undefined}
            onCancelPreview={preview.clear}
            onRetryPreview={() => {
              preview.submit(request, preview.state?.page, preview.state?.size);
            }}
            outdated={
              Boolean(preview.state?.outdated) ||
              Boolean(
                preview.state &&
                  !matchesAnalysisRequest('annotation', request, preview.state.request),
              )
            }
            page={preview.state?.page}
            size={preview.state?.size}
            onPage={(page, size) => {
              preview.submit(request, page, size);
            }}
            onEdit={openEditor}
            editorSession={editor}
            onEditorFinished={finishEditor}
            onUseExamples={useExamples}
          />
        </AnalysisResultBoundary>
      ) : id ? (
        <AnalysisProgress
          name={tab.name}
          message={result.isError ? 'Could not load results. Retry or Rerun.' : 'Loading results…'}
          error={result.isError}
          onRetry={
            result.isError
              ? () => {
                  void result.refetch();
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}
