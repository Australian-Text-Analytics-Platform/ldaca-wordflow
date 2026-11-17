import { Loader2, Sparkles, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { AnnotationProviderConfigurationView } from '@/features/provider-credentials/providerCredentialsStore';
import { canListModels } from '../aiProviders';
import {
  type CodeDesignerSettings,
  DEFAULT_CODEBOOK_DESIGNER_PROMPT,
  DEFAULT_SCALE_DESIGNER_PROMPT,
  DESIGNER_EFFORTS,
  DESIGNER_SAMPLE_SIZE,
  type DesignedCode,
  type DesignerEffort,
  type DesignerStage,
  runCodebookDesigner,
} from '../codebookDesigner';
import { AnnotationProviderModelPicker } from './AnnotationProviderModelPicker';

/** After this long, say that slow is normal for thinking and local models. */
const STILL_WORKING_AFTER_SECONDS = 30;

interface CodebookDesignerSource {
  workspaceId: string;
  nodeId: string;
  name: string;
  textColumn: string;
}

interface CodebookDesignerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: CodeDesignerSettings;
  onSettingsChange: (patch: Partial<CodeDesignerSettings>) => void;
  configurations: AnnotationProviderConfigurationView[];
  providerModels: Record<string, string>;
  /** The Annotation tab's provider and model, the starting choice. */
  fallbackProviderId: string | null;
  fallbackModel: string;
  source: CodebookDesignerSource;
  brief: string;
  taskContext: string;
  /** Design an ordered scale (levels, lowest first, then Not applicable) instead of categories. */
  scale: boolean;
  onDraft: (codes: DesignedCode[]) => void;
}

const formatElapsed = (seconds: number): string =>
  `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * The AI Code Designer window (Chao, 15 Nov 2026): a disclaimer, where the
 * texts go, how many, and how hard the model thinks; under Advanced, the
 * system prompt. While the request runs, the window is locked (Stop is the
 * only way out) and shows the stage, a running clock, and after a while a
 * note that slow is normal.
 */
export function CodebookDesignerDialog({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
  configurations,
  providerModels,
  fallbackProviderId,
  fallbackModel,
  source,
  brief,
  taskContext,
  scale,
  onDraft,
}: CodebookDesignerDialogProps) {
  const [advanced, setAdvanced] = useState(false);
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<DesignerStage>('sampling');
  const [sampled, setSampled] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const [stopped, setStopped] = useState(false);
  const [sampleSizeDraft, setSampleSizeDraft] = useState<string | null>(null);
  const [seedDraft, setSeedDraft] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const usable = configurations.filter((configuration) => canListModels(configuration));
  const providerId =
    [settings.providerConfigurationId, fallbackProviderId].find(
      (id) => id !== null && usable.some((configuration) => configuration.id === id),
    ) ??
    usable[0]?.id ??
    null;
  const provider = configurations.find((configuration) => configuration.id === providerId) ?? null;
  const model =
    providerId === null
      ? ''
      : settings.providerConfigurationId === providerId && settings.model
        ? settings.model
        : (providerModels[providerId] ?? (providerId === fallbackProviderId ? fallbackModel : ''));
  // Categories and scales keep their own prompt, each with its own default.
  const promptSetting = scale ? 'scaleSystemPrompt' : 'systemPrompt';
  const defaultPrompt = scale ? DEFAULT_SCALE_DESIGNER_PROMPT : DEFAULT_CODEBOOK_DESIGNER_PROMPT;
  const systemPrompt = settings[promptSetting] || defaultPrompt;
  const canStart = Boolean(provider && model.trim() && !running);

  // A running clock, so a slow model never looks stuck.
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [running]);

  // Closing the tab or Wordflow's view mid-request stops the request.
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const start = async () => {
    if (!provider) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setFailure(null);
    setStopped(false);
    setStage('sampling');
    setSampled(null);
    setElapsed(0);
    const outcome = await runCodebookDesigner({
      workspaceId: source.workspaceId,
      nodeId: source.nodeId,
      request: {
        provider_configuration_id: provider.id,
        provider: provider.provider,
        provider_base_url: provider.base_url ?? null,
        model: model.trim(),
        text_column: source.textColumn,
        brief,
        task_context: taskContext,
        max_classes: settings.maxClasses,
        scale,
        sample_size: settings.sampleSize,
        sample_seed: settings.sampleSeed,
        reasoning_effort: settings.effort,
        system_prompt: systemPrompt,
      },
      signal: controller.signal,
      onStage: (next, count) => {
        setStage(next);
        if (count !== undefined) setSampled(count);
      },
    });
    abortRef.current = null;
    setRunning(false);
    if (outcome.kind === 'draft') {
      onDraft(outcome.codes);
      onOpenChange(false);
    } else if (outcome.kind === 'error') {
      setFailure({ message: outcome.message, detail: outcome.detail });
    } else {
      setStopped(true);
    }
  };

  const stageLine =
    stage === 'sampling'
      ? `Sampling up to ${String(settings.sampleSize)} texts from ${source.name}…`
      : stage === 'waiting'
        ? `Waiting for ${model}${sampled === null ? '' : ` (sent ${String(sampled)} texts)`}…`
        : 'Reading the answer…';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Locked while it works: Stop is the only way out.
        if (!next && running) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-xl"
        hideCloseButton={running}
        onEscapeKeyDown={(event) => {
          if (running) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (running) event.preventDefault();
        }}
        data-testid="codebook-designer-dialog"
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle>AI Code Designer</DialogTitle>
            {running ? null : (
              <label className="flex items-center gap-2 text-label-secondary font-normal text-description">
                Advanced
                <Switch
                  checked={advanced}
                  onCheckedChange={setAdvanced}
                  aria-label="Show the designer's system prompt"
                />
              </label>
            )}
          </div>
          <DialogDescription>
            {scale
              ? `Drafts an ordered scale of up to ${String(settings.maxClasses)} levels, from the lowest to the highest, and a “Not applicable” code outside the scale, from your brief and a sample of your texts.`
              : `Drafts up to ${String(settings.maxClasses)} codes and an “Other” code from your brief and a sample of your texts.`}
          </DialogDescription>
        </DialogHeader>

        {running ? (
          <div className="space-y-3" role="status" aria-live="polite">
            <div className="flex items-center gap-2 text-body font-medium">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span data-testid="codebook-designer-stage">{stageLine}</span>
            </div>
            <p className="text-body tabular-nums text-description">
              Elapsed {formatElapsed(elapsed)}
            </p>
            {elapsed >= STILL_WORKING_AFTER_SECONDS ? (
              <p
                className="text-body text-description"
                data-testid="codebook-designer-still-working"
              >
                Still working. Thinking models can take several minutes, and local models longer.
              </p>
            ) : null}
            <p className="text-label-secondary text-description">
              Keep this window open until the draft arrives. Stop cancels the request.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className="rounded-md border border-warning bg-warning-background px-3 py-2 text-label-secondary text-warning"
              data-testid="codebook-designer-disclaimer"
            >
              <p>
                Sends up to {String(settings.sampleSize)} texts from <strong>{source.name}</strong>,
                with your brief and Task context, to{' '}
                <strong>{provider?.name ?? 'the AI provider'}</strong>.
              </p>
              <p className="mt-1">
                The draft is only a starting point. Review every code before saving, and check that
                no definition contains real text or names from your data. A stronger reasoning model
                usually gives a better draft.
              </p>
            </div>

            <AnnotationProviderModelPicker
              configurations={configurations}
              selectedConfigurationId={providerId}
              onProviderChange={(configuration, nextModel) => {
                onSettingsChange({
                  providerConfigurationId: configuration.id,
                  model: nextModel,
                });
              }}
              onModelChange={(nextModel) => {
                onSettingsChange({ providerConfigurationId: providerId, model: nextModel });
              }}
              onModelCommit={(configurationId, nextModel) => {
                onSettingsChange({ providerConfigurationId: configurationId, model: nextModel });
              }}
              providerModels={providerModels}
              model={model}
              idPrefix="codebook-designer"
            />

            <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="codebook-designer-sample-size">Sample size</Label>
                <Input
                  id="codebook-designer-sample-size"
                  type="number"
                  min={DESIGNER_SAMPLE_SIZE.min}
                  max={DESIGNER_SAMPLE_SIZE.max}
                  value={sampleSizeDraft ?? String(settings.sampleSize)}
                  onChange={(event) => {
                    setSampleSizeDraft(event.target.value);
                  }}
                  onBlur={() => {
                    if (sampleSizeDraft === null) return;
                    const value = Number(sampleSizeDraft);
                    if (Number.isFinite(value) && sampleSizeDraft.trim() !== '') {
                      onSettingsChange({
                        sampleSize: Math.min(
                          DESIGNER_SAMPLE_SIZE.max,
                          Math.max(DESIGNER_SAMPLE_SIZE.min, Math.round(value)),
                        ),
                      });
                    }
                    setSampleSizeDraft(null);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="codebook-designer-seed">Sample seed</Label>
                <Input
                  id="codebook-designer-seed"
                  type="number"
                  min={0}
                  value={seedDraft ?? String(settings.sampleSeed)}
                  onChange={(event) => {
                    setSeedDraft(event.target.value);
                  }}
                  onBlur={() => {
                    if (seedDraft === null) return;
                    const value = Number(seedDraft);
                    if (Number.isFinite(value) && seedDraft.trim() !== '') {
                      onSettingsChange({ sampleSeed: Math.max(0, Math.round(value)) });
                    }
                    setSeedDraft(null);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="codebook-designer-effort">Thinking effort</Label>
                <Select
                  value={settings.effort}
                  onValueChange={(value) => {
                    onSettingsChange({ effort: value as DesignerEffort });
                  }}
                >
                  <SelectTrigger id="codebook-designer-effort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DESIGNER_EFFORTS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-label-secondary text-description">
              Texts are picked at random from the distinct, non-empty texts in{' '}
              <strong>{source.textColumn}</strong>, each cut to its first 150 words (about 300
              characters in Chinese or Japanese). The same seed picks the same texts.
            </p>

            {advanced ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="codebook-designer-prompt">System prompt</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!settings[promptSetting]}
                    onClick={() => {
                      onSettingsChange({ [promptSetting]: '' });
                    }}
                  >
                    Restore default
                  </Button>
                </div>
                <Textarea
                  id="codebook-designer-prompt"
                  rows={10}
                  value={systemPrompt}
                  className="max-h-[40vh] resize-y font-mono text-label-secondary"
                  onChange={(event) => {
                    const value = event.target.value;
                    onSettingsChange({
                      [promptSetting]: value === defaultPrompt ? '' : value,
                    });
                  }}
                />
                <p className="text-label-secondary text-description">
                  {scale
                    ? 'Wordflow adds the answer format after this prompt: a JSON list of levels from the lowest to the highest, at most the maximum, then a code for texts the scale doesn’t fit (“Not applicable” in English), all named in the language of the brief.'
                    : 'Wordflow adds the answer format after this prompt: a JSON list of codes, at most the maximum, then a code for texts that fit none of them (“Other” in English), all named in the language of the brief.'}
                </p>
              </div>
            ) : null}

            {failure ? (
              <div
                role="alert"
                className="rounded-md border border-error/40 bg-error/5 px-3 py-2 text-body text-error"
              >
                <p>{failure.message}</p>
                {failure.detail ? (
                  <details className="mt-1 text-label-secondary text-description">
                    <summary className="cursor-pointer">Details</summary>
                    <p className="mt-1 break-words">{failure.detail}</p>
                  </details>
                ) : null}
              </div>
            ) : null}
            {stopped ? (
              <p role="status" className="text-body text-description">
                Stopped. Nothing was changed.
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {running ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                abortRef.current?.abort();
              }}
            >
              <Square className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!canStart}
                onClick={() => {
                  void start();
                }}
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Design codebook
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
