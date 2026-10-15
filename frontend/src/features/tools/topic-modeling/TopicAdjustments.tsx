import { Checkbox } from '@/components/ui/checkbox';
import { OperationError } from '@/features/project/OperationError';
import { useEffect, useEffectEvent, useState } from 'react';
import { AnalysisNumberInput } from '../common/components/AnalysisNumberInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { getTokenizers } from '../token-frequency/api';
import * as topicApi from './api';

export function MaximumTopicSize({
  value,
  minimum,
  onChange,
  disabled = false,
}: {
  value?: number | null;
  minimum: number;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2">
        <Checkbox
          checked={value != null}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked === true ? minimum + 1 : null)}
        />
        Limit maximum topic size
      </label>
      {value == null ? (
        <p className="text-description text-label-secondary">Unlimited</p>
      ) : (
        <AnalysisNumberInput
          aria-label="Maximum topic size"
          min={minimum + 1}
          max={Number.MAX_SAFE_INTEGER}
          value={value}
          disabled={disabled}
          onCommit={onChange}
        />
      )}
    </div>
  );
}

export function RequestedTopicCount({
  value,
  onChange,
}: {
  value?: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2">
        <Checkbox
          checked={value != null}
          onCheckedChange={(checked) => onChange(checked === true ? 1 : null)}
        />
        Request a number of Topics
      </label>
      {value == null ? (
        <p className="text-description text-label-secondary">Natural Topic count</p>
      ) : (
        <AnalysisNumberInput
          aria-label="Requested number of Topics"
          min={1}
          max={Number.MAX_SAFE_INTEGER}
          value={value}
          onCommit={onChange}
        />
      )}
      <p className="text-description text-label-secondary">
        A target for hierarchy merges. The maximum segment size remains a hard limit.
      </p>
    </div>
  );
}

export function TopicAdjustments({
  base,
  owner,
  summary,
  request,
  disabled,
  onAdjusted,
}: {
  base: string;
  owner: { analysis: string } | { tab: string; preview: string };
  summary: topicApi.TopicSummary;
  request: topicApi.TopicRequest;
  disabled: boolean;
  onAdjusted: (result: {
    summary: topicApi.TopicSummary;
    analysis?: topicApi.TopicAnalysisResult;
  }) => void;
}) {
  const initial = {
    ...(summary.parameters ?? {
      minimum_topic_size: request.minimum_topic_size,
      maximum_topic_size: request.maximum_topic_size ?? null,
      tokenizer: request.tokenizer,
    }),
    minimum_topic_size: 10,
  };
  const historical = summary.sources.some((source) => source.processed_column == null);
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const receive = useEffectEvent(onAdjusted);
  const tokenizers = useQuery({
    queryKey: ['native', base, 'tokenizers'],
    queryFn: ({ signal }) => getTokenizers(base, signal),
    staleTime: Infinity,
  });
  const key = JSON.stringify(owner);
  const settings = JSON.stringify(draft);
  const accepted = JSON.stringify(initial);
  useEffect(() => {
    if (disabled || historical || settings === accepted) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setPending(true);
      setError(null);
      void topicApi
        .adjustTopicModel(
          base,
          JSON.parse(key) as typeof owner,
          {
            expected_projection: summary.natural_projection,
            settings: JSON.parse(settings) as topicApi.TopicAdjustmentSettings,
          },
          controller.signal,
        )
        .then((result) => {
          if (!controller.signal.aborted) receive(result);
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setError(error);
        })
        .finally(() => {
          if (!controller.signal.aborted) setPending(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [base, key, settings, accepted, disabled, historical, summary.natural_projection, retry]);
  return (
    <fieldset
      disabled={disabled || historical}
      className="space-y-2 rounded border border-surface-border p-2"
    >
      <legend className="px-1 text-body">Adjust retained stages</legend>
      <p className="text-description text-label-secondary">
        These controls reuse processed texts and reduced vectors. Run processes the current Data
        Blocks through every stage.
      </p>
      {historical && (
        <p className="text-description">
          Rerun this historical analysis to use the current Topic fitting controls.
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-3">
        <MaximumTopicSize
          value={draft.maximum_topic_size}
          minimum={draft.minimum_topic_size}
          onChange={(maximum_topic_size) => setDraft({ ...draft, maximum_topic_size })}
        />
        <div className="space-y-1">
          <span>Representative-word tokenizer</span>
          <Select
            value={draft.tokenizer}
            onValueChange={(tokenizer) => setDraft({ ...draft, tokenizer })}
          >
            <SelectTrigger aria-label="Adjusted representative-word tokenizer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(tokenizers.data ?? []).map((model) => (
                <SelectItem key={model.model_id} value={model.model_id}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {pending && !disabled && settings !== accepted && (
        <p role="status" className="text-description">
          Updating retained stages…
        </p>
      )}
      {error != null && settings !== accepted && (
        <OperationError
          title="Couldn't adjust Topic results"
          error={error}
          onRetry={() => setRetry((value) => value + 1)}
        />
      )}
    </fieldset>
  );
}
