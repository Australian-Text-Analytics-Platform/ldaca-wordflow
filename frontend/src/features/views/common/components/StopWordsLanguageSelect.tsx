import { useState } from 'react';
import { toast } from 'sonner';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDetectedColumnLanguage } from '@/features/views/common/hooks/useDetectedColumnLanguage';
import type { StopWordListSource } from '@/features/views/common/utils/stopWordListSources';
import { formatStopWords, mergeStopWordsText } from '@/features/views/common/utils/stopWords';
import { listSupportedStopwordLanguages, loadMergedStopwords } from '@/lib/loadMergedStopwords';

const SAVED_LIST_VALUE = '__saved__';
const CLEAR_LIST_VALUE = '__clear__';
const EMPTY_PROMPT_VALUE = '__prompt__';
const TAB_SOURCE_PREFIX = 'tab:';

interface StopWordsLanguageSelectProps {
  /** The tab's current normalized stop-word list. */
  words: string[];
  /** Persists the next list. Rejections are reported by the caller's mutation. */
  onWordsChange: (words: string[]) => Promise<void> | void;
  /** Workspace, node, and column sampled to recommend a language. */
  workspaceId: string | null;
  nodeId: string | null;
  column: string | null;
  /** Other tabs' saved lists offered under "From other tabs". */
  sources?: StopWordListSource[];
  disabled?: boolean;
}

/**
 * Shared stop-words list dropdown for analysis tabs that filter stop words.
 * Picking a language appends its default stop words to the current list
 * (duplicates skipped), so custom words and several languages can be combined;
 * "Clear stop words" starts again from an empty list. The detected column
 * language is listed first and marked "(Recommended)". Picking another tab's
 * list under "From other tabs" appends a copy of its words in the same way;
 * the tabs stay independent afterwards.
 *
 * Rendered by: TokenFrequencyResultsPanel and TopicModelingStopWordsControl
 * beside their stop-words switches.
 */
export function StopWordsLanguageSelect({
  words,
  onWordsChange,
  workspaceId,
  nodeId,
  column,
  sources = [],
  disabled = false,
}: StopWordsLanguageSelectProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const languages = listSupportedStopwordLanguages();
  const { detectedLanguage } = useDetectedColumnLanguage({
    workspaceId,
    nodeId,
    column,
    enabled: menuOpen,
  });
  const recommendedLanguage = languages.find((language) => language.iso6391 === detectedLanguage);
  const remainingLanguages = languages
    .filter((language) => language.iso6391 !== recommendedLanguage?.iso6391)
    .sort((left, right) => left.name.localeCompare(right.name));
  const hasWords = words.length > 0;

  const commit = async (next: string[]) => {
    try {
      await onWordsChange(next);
    } catch {
      // The caller's persistence owns rollback, error messaging, and retry.
    }
  };

  const appendLanguage = async (language: string) => {
    setIsPending(true);
    try {
      let merged: string[];
      try {
        ({ merged } = await loadMergedStopwords({ languages: [language] }));
      } catch (cause) {
        toast.error('Failed to load stop words.', {
          description: cause instanceof Error ? cause.message : String(cause),
        });
        return;
      }
      await commit(mergeStopWordsText(formatStopWords(words), merged));
    } finally {
      setIsPending(false);
    }
  };

  const appendTabList = async (sourceWords: string[]) => {
    setIsPending(true);
    try {
      await commit(mergeStopWordsText(formatStopWords(words), sourceWords));
    } finally {
      setIsPending(false);
    }
  };

  const clearWords = async () => {
    setIsPending(true);
    try {
      await commit([]);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Select
      value={hasWords ? SAVED_LIST_VALUE : EMPTY_PROMPT_VALUE}
      disabled={disabled || isPending}
      onOpenChange={setMenuOpen}
      onValueChange={(value) => {
        if (value === SAVED_LIST_VALUE || value === EMPTY_PROMPT_VALUE) return;
        if (value === CLEAR_LIST_VALUE) {
          void clearWords();
          return;
        }
        if (value.startsWith(TAB_SOURCE_PREFIX)) {
          const source = sources.find(
            (candidate) => `${TAB_SOURCE_PREFIX}${candidate.tabId}` === value,
          );
          if (source) void appendTabList(source.words);
          return;
        }
        void appendLanguage(value);
      }}
    >
      <SelectTrigger
        className="h-9 w-56 max-w-full text-label-secondary"
        aria-label="Stop words language"
      >
        <SelectValue placeholder="Select language" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {hasWords ? (
            <SelectItem value={CLEAR_LIST_VALUE}>Clear stop words</SelectItem>
          ) : (
            <SelectItem value={EMPTY_PROMPT_VALUE} disabled>
              Select language
            </SelectItem>
          )}
          {hasWords ? (
            <SelectItem value={SAVED_LIST_VALUE}>
              {`Saved list (${String(words.length)} words)`}
            </SelectItem>
          ) : null}
        </SelectGroup>
        <SelectGroup>
          {recommendedLanguage ? (
            <SelectItem value={recommendedLanguage.iso6391}>
              {recommendedLanguage.name} (Recommended)
            </SelectItem>
          ) : null}
          {remainingLanguages.map((language) => (
            <SelectItem key={language.iso6391} value={language.iso6391}>
              {language.name}
            </SelectItem>
          ))}
        </SelectGroup>
        {sources.length > 0 ? (
          <SelectGroup>
            <SelectLabel>From other tabs</SelectLabel>
            {sources.map((source) => (
              <SelectItem key={source.tabId} value={`${TAB_SOURCE_PREFIX}${source.tabId}`}>
                {`${source.label} (${String(source.words.length)} words)`}
              </SelectItem>
            ))}
          </SelectGroup>
        ) : null}
      </SelectContent>
    </Select>
  );
}
