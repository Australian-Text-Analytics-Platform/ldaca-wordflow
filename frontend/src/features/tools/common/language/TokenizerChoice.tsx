import { NodeInputField } from '../components/NodeInputField';
import { useNodePreferences } from '../useNodePreferences';
import { useEffect, useRef } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type * as api from '@/features/project/api';
import { useDetectedColumnLanguage } from './useDetectedColumnLanguage';
import { partitionTokenizerModelsForLanguage } from './languages';
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
  source: api.ObjectRef;
  column: string;
  models: api.TokenizerInfo[];
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
  return (
    <>
      <NodeInputField
        label="Tokenizer"
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
            <SelectValue placeholder="Select a tokenizer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">Select a tokenizer</SelectItem>
            {recommended.length > 0 && (
              <SelectGroup>
                <div className="px-2 py-1 text-description">Recommended</div>
                {recommended.map((model) => (
                  <SelectItem key={model.model_id} value={model.model_id}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {other.map((model) => (
              <SelectItem key={model.model_id} value={model.model_id}>
                {model.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </NodeInputField>
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
