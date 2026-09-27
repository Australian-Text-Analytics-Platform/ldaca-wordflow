import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { listSupportedStopwordLanguages, loadMergedStopwords } from '../language/stopwords';
import { useDetectedColumnLanguage } from '../language/useDetectedColumnLanguage';
import type { StopwordSource } from './stopwordData';

export function StopwordPresets({
  base,
  sources,
  onClose,
  onAdd,
}: {
  base: string;
  sources: StopwordSource[];
  onClose: () => void;
  onAdd: (words: string[]) => Promise<void>;
}) {
  const first = useDetectedColumnLanguage({
    base,
    target: sources[0]?.source ?? null,
    column: sources[0]?.column ?? null,
  });
  const second = useDetectedColumnLanguage({
    base,
    target: sources[1]?.source ?? null,
    column: sources[1]?.column ?? null,
  });
  const languages = listSupportedStopwordLanguages();
  const recommendations = languages
    .filter((language) => [first.data, second.data].includes(language.iso6391))
    .map((language) => language.iso6391);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [search, setSearch] = useState('');
  const selected = picked ?? recommendations;
  const loading = useMutation({
    mutationFn: async (languages: string[]) => {
      const result = await loadMergedStopwords({ languages });
      await onAdd(result.merged);
    },
    meta: { reportError: false },
  });
  const detecting = first.isFetching || second.isFetching;
  const detectionFailed = first.isError || second.isError;
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add language preset</DialogTitle>
        <DialogDescription>
          Choose one or more languages. Lists are added to the shared Table immediately. Language
          recommendations use a sample of the input text.
        </DialogDescription>
      </DialogHeader>
      {detecting && <p role="status">Detecting input languages…</p>}
      {detectionFailed && (
        <div className="flex flex-wrap items-center gap-2">
          <p>Language recommendation unavailable. You can choose languages manually.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (first.isError) void first.refetch();
              if (second.isError) void second.refetch();
            }}
          >
            Retry detection
          </Button>
        </div>
      )}
      <Input
        aria-label="Search stopword languages"
        placeholder="Search languages…"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
      />
      <fieldset className="max-h-64 overflow-y-auto" disabled={loading.isPending}>
        <legend className="sr-only">Stopword languages</legend>
        {languages
          .filter((language) =>
            `${language.name} ${language.iso6391}`.toLowerCase().includes(search.toLowerCase()),
          )
          .sort(
            (a, b) =>
              Number(recommendations.includes(b.iso6391)) -
              Number(recommendations.includes(a.iso6391)),
          )
          .map((language) => (
            <label key={language.iso6391} className="flex cursor-pointer items-center gap-2 py-1">
              <Checkbox
                checked={selected.includes(language.iso6391)}
                onCheckedChange={(checked) => {
                  setPicked(
                    checked === true
                      ? [...selected, language.iso6391]
                      : selected.filter((code) => code !== language.iso6391),
                  );
                }}
              />
              <span>
                {language.name}
                {recommendations.includes(language.iso6391) ? ' (Recommended)' : ''}
              </span>
            </label>
          ))}
      </fieldset>
      {loading.isError && (
        <p role="alert">The words were not added. Your selection is retained; try again.</p>
      )}
      <DialogFooter>
        <Button variant="outline" disabled={loading.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={selected.length === 0 || loading.isPending}
          onClick={() => {
            loading.mutate(selected);
          }}
        >
          {loading.isPending ? 'Adding…' : loading.isError ? 'Retry' : 'Add to list'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
