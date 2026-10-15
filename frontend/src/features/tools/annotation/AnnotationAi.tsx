import { useTabSettings } from '../common/useTabSettings';
import { RunError } from '../common/components/RunError';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Textarea } from '@/components/ui/textarea';
import * as aiApi from '@/features/ai/api';
import { useHostServices } from '@/features/settings/HostSettings';
import { ProviderSelector } from '@/features/ai/ProviderSelector';
import * as projectApi from '@/features/project/api';
import * as objectsApi from '@/features/project/objects';
import { schemaQuery } from '@/features/project/projectQueries';
import { clearSavedAnalysis, savedAnalysisQuery } from '@/features/project/savedAnalysis';
import * as tasksApi from '@/features/project/tasksApi';
import * as editingApi from '@/features/table-editing/api';
import * as annotationApi from '@/features/tools/annotation/api';
import * as analysesApi from '@/features/tools/common/analysisApi';
import { isArrowStringField } from '@/lib/arrow/decodeArrowTable';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  decodeAnalysisRequest,
  matchesAnalysisRequest,
  useRequestRestoration,
} from '../common/analysisRequest';
import { AnalysisAction } from '../common/components/AnalysisAction';
import { AnalysisProgress } from '../common/components/AnalysisProgress';
import { AnalysisResultBoundary } from '../common/components/AnalysisResultBoundary';
import { NodeColumnSelector } from '../common/components/NodeColumnSelector';
import { RequestCompatibilityWarning } from '../common/components/RequestCompatibilityWarning';
import { useAnalysisRecovery } from '../common/useAnalysisRecovery';
import { ThinkingControls } from './ThinkingControls';
import { AnnotationOutput } from './AnnotationOutput';
import type { CorrectionSession } from './CorrectionDraft';
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
  tab: analysesApi.Tab;
  request: annotationApi.AnnotationRequest;
  onChange: (request: annotationApi.AnnotationRequest) => void;
  nodes: projectApi.ProjectNode[];
  tasks: tasksApi.NativeTask[];
  onCancel: (id: string) => void;
  active: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const { settings, change: changeSettings } = useTabSettings(base, tab);
  const cache = useQueryClient();
  const host = useHostServices();
  const hostBase = host?.base ?? base;
  const hostCache = host?.client ?? cache;
  const providers = useQuery(
    {
      queryKey: ['host', hostBase, 'ai-providers'],
      queryFn: ({ signal }) => aiApi.aiConnections(hostBase, signal),
    },
    hostCache,
  );
  const rememberConcurrency = useMutation({
    meta: { reportError: false },
    mutationFn: ({ provider, concurrency }: { provider: string; concurrency: number }) =>
      aiApi.rememberAnnotationConcurrency(hostBase, provider, concurrency),
    onSuccess: () => hostCache.invalidateQueries({ queryKey: ['host', hostBase, 'ai-providers'] }),
  });
  const capabilities = useQuery(
    {
      queryKey: [
        'host',
        hostBase,
        'ai-capabilities',
        request.inference.provider,
        request.inference.model,
      ],
      queryFn: ({ signal }) =>
        aiApi.aiCapabilities(hostBase, request.inference.provider, request.inference.model, signal),
      enabled: active && Boolean(request.inference.provider && request.inference.model.trim()),
    },
    host?.client ?? cache,
  );
  const [editor, setEditor] = useState<CorrectionSession | null>(null);
  const finishEditor = () => {
    setEditor(null);
    onEditingChange?.(false);
  };
  const preview = useAnnotationPreview(base, tab.id, active);
  const id = tab.analysis?.has_result ? tab.analysis.id : null;
  const result = useQuery({
    ...savedAnalysisQuery(cache, base, tab, (id, signal) =>
      annotationApi.getAnnotationResult(base, id, signal),
    ),
    enabled: active && Boolean(id),
  });
  const recovery = useAnalysisRecovery(base, id);
  const restored = useRequestRestoration('annotation', tab.analysis, [base, tab.id]);
  const running = tasks.find((t) => t.tab_id === tab.id && t.finished_at === null);
  const run = useMutation({
    meta: { reportError: false },
    mutationFn: (value: annotationApi.AnnotationRequest) =>
      annotationApi.runAnnotation(base, tab.id, value),
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
  const update = (patch: Partial<annotationApi.AnnotationInference>) => {
    onChange({ ...request, inference: { ...request.inference, ...patch } });
  };
  const busy = run.isPending || Boolean(running);
  const ready =
    !restored.blocked &&
    Boolean(
      request.setup.source.name &&
      request.setup.document &&
      request.setup.codebook?.code &&
      request.setup.codebook.description &&
      request.inference.provider &&
      request.inference.model.trim(),
    );
  const partial = (result.data?.report.failed ?? 0) > 0;
  const reason = restored.blocked
    ? 'Start with current defaults before running this analysis.'
    : editor
      ? 'Save or cancel correction edits first.'
      : busy
        ? 'This analysis is already running.'
        : !ready
          ? 'Choose a source, document column, Codebook and provider/model first.'
          : undefined;
  const displayedSetup =
    editor?.setup ??
    (preview.state
      ? preview.state.request.setup
      : result.data
        ? decodeAnalysisRequest('annotation', result.data.request_status).request.setup
        : request.setup);
  const outputSetup = {
    ...displayedSetup,
    correction: objectsApi.sameTarget(displayedSetup.source, request.setup.source)
      ? request.setup.correction
      : displayedSetup.correction,
  };
  const openEditor = (
    session: editingApi.CellEditSession,
    setup: annotationApi.AnnotationSetup,
  ) => {
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
            const chosen = providers.data?.find((connection) => connection.id === provider);
            update({
              provider,
              model,
              ...(provider !== request.inference.provider
                ? {
                    reasoning: 'default',
                    thinking: null,
                    concurrency: chosen?.annotation_concurrency ?? request.inference.concurrency,
                  }
                : {}),
            });
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
              { value: 'all', label: 'All rows' },
              { value: 'missing', label: 'Only rows without annotation' },
            ]}
            onChange={(value) => {
              onChange({
                ...request,
                processing: value as annotationApi.AnnotationRequest['processing'],
              });
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
            {capabilities.isError && (
              <p role="status">
                Model controls could not be loaded.
                <Button
                  variant="link"
                  onClick={() => {
                    void capabilities.refetch();
                  }}
                >
                  Retry model controls
                </Button>
              </p>
            )}
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
                  disabled={
                    !capabilities.data ||
                    (!capabilities.data.temperature_with_thinking &&
                      Boolean(
                        request.inference.thinking &&
                        request.inference.thinking.control !== 'disabled' &&
                        !(
                          request.inference.thinking.control === 'reasoning_effort' &&
                          request.inference.thinking.value === 'none'
                        ),
                      ) &&
                      request.inference.temperature === null)
                  }
                  onChange={(e) => {
                    update({ temperature: e.target.value === '' ? null : Number(e.target.value) });
                  }}
                />
              </label>
              <ThinkingControls
                value={request.inference.thinking}
                legacy={Boolean(
                  request.inference.reasoning && request.inference.reasoning !== 'default',
                )}
                capabilities={capabilities.data}
                onChange={(thinking) => update({ thinking, reasoning: 'default' })}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              {(['batch_size', 'retries', 'concurrency'] as const).map((key) => (
                <label className="min-w-32 flex-1" key={key}>
                  {key === 'batch_size'
                    ? 'Rows per request'
                    : key === 'retries'
                      ? 'Retries per request'
                      : 'Concurrent requests'}
                  <Input
                    type="number"
                    min={key === 'retries' ? 0 : 1}
                    max={
                      key === 'batch_size'
                        ? 100
                        : key === 'concurrency'
                          ? (capabilities.data?.max_concurrency ?? 32)
                          : 10
                    }
                    value={request.inference[key]}
                    onBlur={() => {
                      const value = request.inference.concurrency;
                      if (
                        key === 'concurrency' &&
                        Number.isInteger(value) &&
                        value >= 1 &&
                        value <= 32 &&
                        providers.data?.some(
                          (provider) =>
                            provider.id === request.inference.provider && !provider.built_in,
                        )
                      ) {
                        rememberConcurrency.mutate({
                          provider: request.inference.provider,
                          concurrency: value,
                        });
                      }
                    }}
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
                            selection: value as annotationApi.AnnotationExamples['selection'],
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
        <RequestCompatibilityWarning
          issues={restored.issues}
          onReset={() => restored.reset(onChange)}
          resetDone={!restored.blocked}
        />
        <div className="flex flex-wrap gap-2">
          <AnalysisAction
            data-guidance-stage={undefined}
            reason={
              reason ??
              (!writable
                ? 'Materialise the source in place before Run.'
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
      <RunError
        tabId={tab.id}
        name="AI Annotation"
        tasks={tasks}
        error={run.error ?? rememberConcurrency.error}
        active={active}
        busy={busy}
      />
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
            settings={settings}
            onSettings={changeSettings}
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
