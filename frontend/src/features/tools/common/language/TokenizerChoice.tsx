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
}: {
  active: boolean;
  base: string;
  source: api.ObjectRef;
  column: string;
  models: api.TokenizerInfo[];
  value: string;
  onChange: (value: string) => void;
}) {
  const language = useDetectedColumnLanguage({
    base,
    target: source,
    column,
    enabled: active && Boolean(column),
  });
  const { recommended, other } = partitionTokenizerModelsForLanguage(models, language.data);
  const attempted = useRef<string | null>(null);
  const key = JSON.stringify([source, column]);
  const first = recommended[0]?.model_id;
  useEffect(() => {
    if (!active || !first || !column || attempted.current === key) return;
    attempted.current = key;
    if (!value) onChange(first);
  }, [active, first, column, key, value, onChange]);
  return (
    <div className="space-y-1">
      <span className="text-label-secondary text-description">Tokenizer</span>
      <Select
        value={value || '__none'}
        disabled={!column}
        onValueChange={(next) => {
          attempted.current = key;
          onChange(next === '__none' ? '' : next);
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
      {language.isFetching && (
        <p className="text-label-secondary text-description">Detecting language…</p>
      )}
      {language.isError && (
        <p className="text-label-secondary text-description">
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
    </div>
  );
}
