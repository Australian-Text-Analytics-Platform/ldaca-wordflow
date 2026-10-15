import { externalLink } from '@/lib/externalLink';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type * as objectsApi from '@/features/project/objects';
import type * as frequencyApi from '@/features/tools/token-frequency/api';
import { useEffect, useRef } from 'react';
import { NodeInputField } from '../components/NodeInputField';
import { useNodePreferences } from '../useNodePreferences';
import { partitionTokenizerModelsForLanguage } from './languages';
import { useDetectedColumnLanguage } from './useDetectedColumnLanguage';
export function TokenizerChoice({
  active,
  base,
  source,
  column,
  models,
  value,
  onChange,
  preferredModel,
  preferenceTargets,
}: {
  preferredModel?: string;
  preferenceTargets?: { name: string; column: string }[];
  active: boolean;
  base: string;
  source: objectsApi.ObjectRef;
  column: string;
  models: frequencyApi.TokenizerInfo[];
  value: string;
  onChange: (value: string) => void;
}) {
  const savePreference = useNodePreferences(base);
  const language = useDetectedColumnLanguage({
    base,
    target: source,
    column,
    enabled: active && Boolean(column),
  });
  const { recommended, other } = partitionTokenizerModelsForLanguage(models, language.data);
  const attempted = useRef<string | null>(null);
  const key = JSON.stringify([source, column]);
  const first = preferredModel ?? recommended[0]?.model_id;
  useEffect(() => {
    if (!active || !first || !column || attempted.current === key) return;
    attempted.current = key;
    if (!value) onChange(first);
  }, [active, first, column, key, value, onChange]);
  const selectedModel = models.find((model) => model.model_id === value);
  const languageNames = new Intl.DisplayNames(['en-AU'], { type: 'language' });
  const modelLabel = (model: frequencyApi.TokenizerInfo) => (
    <>
      {model.label}
      {model.model_id !== 'native:plain_words_en' && (
        <span className="ml-2 text-label-secondary">
          {model.languages.map((code) => languageNames.of(code) ?? code).join(', ')}
        </span>
      )}
    </>
  );
  return (
    <>
      <NodeInputField
        label="Tokeniser"
        value={models.find((model) => model.model_id === value)?.label ?? value}
      >
        <Select
          value={value || '__none'}
          disabled={!column}
          onValueChange={(next) => {
            attempted.current = key;
            const selected = next === '__none' ? '' : next;
            onChange(selected);
            for (const target of preferenceTargets ?? [{ name: source.name, column }]) {
              if (target.column)
                savePreference(target.name, {
                  preference: 'tokenizer',
                  column: target.column,
                  value: selected || null,
                });
            }
          }}
        >
          <SelectTrigger aria-label={`${source.name} tokenizer`}>
            <SelectValue placeholder="Select a tokenizer">{selectedModel?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Select a tokenizer</SelectItem>
            {recommended.length > 0 && (
              <SelectGroup>
                <div className="px-2 py-1 text-description">Recommended</div>
                {recommended.map((model) => (
                  <SelectItem
                    key={model.model_id}
                    value={model.model_id}
                    aria-label={model.label}
                    textValue={model.label}
                  >
                    {modelLabel(model)}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {other.map((model) => (
              <SelectItem
                key={model.model_id}
                value={model.model_id}
                aria-label={model.label}
                textValue={model.label}
              >
                {modelLabel(model)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </NodeInputField>
      {selectedModel?.about_url && (
        <a
          className="text-description underline"
          href={selectedModel.about_url}
          onClick={externalLink}
          target="_blank"
          rel="noreferrer"
        >
          About {selectedModel.label}
        </a>
      )}
      {language.isFetching && (
        <p className="order-last basis-full text-label-secondary text-description">
          Detecting language…
        </p>
      )}
      {language.isError && (
        <p className="order-last basis-full text-label-secondary text-description">
          Language detection is unavailable. Choose a tokenizer manually.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              void language.refetch();
            }}
          >
            Retry
          </button>
        </p>
      )}
    </>
  );
}
