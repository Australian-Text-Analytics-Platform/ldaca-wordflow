import { ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';
import { listTokenizerModels } from '@/api';
import type { TokenizerModelInfo } from '@/api/frontendModels';
import { queryKeys } from '@/lib/queryKeys';
import { partitionTokenizerModelsForLanguage } from '@/lib/languages';
import { cn } from '@/lib/utils';
import { useDetectedColumnLanguage } from '../hooks/useDetectedColumnLanguage';

const TOKENIZER_MODELS_LOADING_VALUE = '__ldaca__tokenizer_models_loading__';
const TOKENIZER_MODELS_ERROR_VALUE = '__ldaca__tokenizer_models_error__';
const TOKENIZER_MODELS_EMPTY_VALUE = '__ldaca__tokenizer_models_empty__';
const TOKENIZER_MODEL_CLEAR_VALUE = '__ldaca__select_tokenizer_model__';

interface TokenizerModelSelectorProps {
  workspaceId: string | null;
  nodeId: string;
  column: string;
  value?: string;
  onChange: (value: string, detectedLanguage: string | null) => void;
  autoSelectRecommended?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  className?: string;
}

const languageDisplayNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' });
  } catch {
    return null;
  }
})();

/** "Japanese", or "English, Chinese": the languages a tokenizer is for (issue 167). */
function languageNames(codes: readonly string[]): string {
  return codes
    .map((code) => {
      try {
        return languageDisplayNames?.of(code) ?? code;
      } catch {
        return code;
      }
    })
    .join(', ');
}

/** One tokenizer option: its name and language, then its id. */
function TokenizerOptionText({ option }: { option: TokenizerModelInfo }) {
  const languages = languageNames(option.languages);
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate">{option.label}</span>
        {languages ? (
          <span className="shrink-0 rounded-sm border border-surface-border px-1 text-label-secondary text-description">
            {languages}
          </span>
        ) : null}
      </span>
      <span className="truncate font-mono text-label-secondary text-description">
        {option.model}
      </span>
    </span>
  );
}

/**
 * Lets token-based analysis panels choose a tokenizer model for the selected
 * source column, using sampled text to group backend models by detected language.
 * Used by: concordance and token-frequency parameter panels.
 */
function TokenizerModelSelector({
  workspaceId,
  nodeId,
  column,
  value,
  onChange,
  autoSelectRecommended = false,
  disabled = false,
  disabledReason,
  className,
}: TokenizerModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const autoSelectionKeyRef = useRef<string | null>(null);
  const canFetchSample = Boolean(workspaceId && nodeId && column);
  const isDisabled = disabled || !column;
  const reason = disabled ? disabledReason : !column ? 'Select a text column first' : undefined;
  const { detectedLanguage } = useDetectedColumnLanguage({
    workspaceId,
    nodeId,
    column,
    enabled: canFetchSample,
  });

  const modelQuery = useQuery({
    queryKey: queryKeys.tokenizerModels,
    enabled: (open || autoSelectRecommended) && !isDisabled,
    staleTime: 10 * 60_000,
    /** Called by: TanStack Query for automatic selection or an opened selector. */
    queryFn: async (): Promise<TokenizerModelInfo[]> => {
      const { data } = await listTokenizerModels({
        throwOnError: true,
      });
      return data.map((model) => ({
        model: model.id,
        label: model.label,
        languages: model.languages ?? [],
        docsUrl: model.docs_url ?? null,
      }));
    },
  });
  const { recommended, other } = partitionTokenizerModelsForLanguage(
    modelQuery.data ?? [],
    detectedLanguage,
  );
  const firstRecommendedModel = recommended[0]?.model ?? null;
  const modelCatalogueLoaded = modelQuery.data !== undefined;

  useEffect(() => {
    if (
      !autoSelectRecommended ||
      !workspaceId ||
      isDisabled ||
      !detectedLanguage ||
      !modelCatalogueLoaded
    ) {
      return;
    }

    const autoSelectionKey = `${workspaceId}:${nodeId}:${column}`;
    if (autoSelectionKeyRef.current === autoSelectionKey) return;
    autoSelectionKeyRef.current = autoSelectionKey;

    if (!value?.trim() && firstRecommendedModel) {
      onChange(firstRecommendedModel, detectedLanguage);
    }
  }, [
    autoSelectRecommended,
    column,
    detectedLanguage,
    firstRecommendedModel,
    isDisabled,
    modelCatalogueLoaded,
    nodeId,
    onChange,
    value,
    workspaceId,
  ]);

  const selectedModel = modelQuery.data?.find((option) => option.model === value);
  const selectedLanguages = selectedModel ? languageNames(selectedModel.languages) : '';
  const triggerText = selectedModel
    ? `${selectedModel.label}${selectedLanguages ? ` · ${selectedLanguages}` : ''}`
    : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- an empty value shows "None", not ''
      value || 'None';
  const selectValue = value && value.length > 0 ? value : TOKENIZER_MODEL_CLEAR_VALUE;

  return (
    <div className={cn('space-y-1', className)}>
      <span className="block text-label-secondary font-medium text-description">
        Tokenizer Model
      </span>
      <div className="flex items-center gap-1.5">
        <DisabledReasonTooltip reason={isDisabled ? reason : undefined} className="min-w-0 flex-1">
          <Select
            open={open}
            value={selectValue}
            onOpenChange={(nextOpen) => {
              if (!isDisabled) setOpen(nextOpen);
            }}
            onValueChange={(nextValue) => {
              onChange(
                nextValue === TOKENIZER_MODEL_CLEAR_VALUE ? '' : nextValue,
                detectedLanguage,
              );
            }}
            disabled={isDisabled}
          >
            <SelectTrigger className="w-full text-body" aria-label="Tokenizer model">
              <SelectValue placeholder="None">{triggerText}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TOKENIZER_MODEL_CLEAR_VALUE}>None</SelectItem>
              {modelQuery.isFetching && !modelQuery.data ? (
                <SelectItem value={TOKENIZER_MODELS_LOADING_VALUE} disabled>
                  Loading models...
                </SelectItem>
              ) : null}
              {modelQuery.isError ? (
                <SelectItem value={TOKENIZER_MODELS_ERROR_VALUE} disabled>
                  Could not load models
                </SelectItem>
              ) : null}
              {!modelQuery.isFetching && !modelQuery.isError && modelQuery.data?.length === 0 ? (
                <SelectItem value={TOKENIZER_MODELS_EMPTY_VALUE} disabled>
                  No models available
                </SelectItem>
              ) : null}
              {recommended.length > 0 ? (
                <SelectGroup
                  data-testid="tokenizer-model-recommendations"
                  className="my-1 rounded-lg border border-button/40 bg-transparent p-1"
                >
                  <SelectLabel className="px-2 py-1 text-label-secondary font-medium text-link">
                    Recommended
                  </SelectLabel>
                  {recommended.map((option) => (
                    <SelectItem
                      key={option.model}
                      value={option.model}
                      className="!h-auto min-h-control-sm py-1"
                    >
                      <TokenizerOptionText option={option} />
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
              {other.map((option) => (
                <SelectItem
                  key={option.model}
                  value={option.model}
                  className="!h-auto min-h-control-sm py-1"
                >
                  <TokenizerOptionText option={option} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DisabledReasonTooltip>
        {selectedModel?.docsUrl ? (
          <a
            href={selectedModel.docsUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`About ${selectedModel.label} (opens in a new tab)`}
            title={`About ${selectedModel.label}`}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-description hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default TokenizerModelSelector;
