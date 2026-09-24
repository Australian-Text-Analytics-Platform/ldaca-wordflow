import { useRef, useState } from 'react';
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
import {
  loadWordflowClassicStopwords,
  WORDFLOW_CLASSIC_STOPWORD_LISTS,
} from '@/lib/wordflowClassicStopwords';

const SAVED_LIST_VALUE = '__saved__';
const CLEAR_LIST_VALUE = '__clear__';
const EMPTY_PROMPT_VALUE = '__prompt__';
const TAB_SOURCE_PREFIX = 'tab:';
const CLASSIC_LIST_PREFIX = 'classic:';
const SHOW_ALL_LANGUAGES_VALUE = '__show_all_languages__';
const DETECTING_VALUE = '__detecting__';

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
 * Groups, in order: "From other tabs" (other tabs' saved lists), "Wordflow
 * classic lists" (the built-in lists earlier Wordflow versions served), and
 * "Languages (stopword library)" (the `stopword` package: only the language
 * detected from the column, marked "(Detected)", until the user expands
 * "Show all languages"). Every pick appends its
 * words to the current list with duplicates skipped, so custom words and
 * several lists can be combined; copied tab lists stay independent afterwards.
 * "Clear stop words" starts again from an empty list.
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
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  // Radix closes the menu after any item is picked; the expander row sets this
  // so that one close is ignored and the full language list appears in place.
  const keepOpenRef = useRef(false);
  const [isPending, setIsPending] = useState(false);
  const languages = listSupportedStopwordLanguages();
  const { detectedLanguage, isDetecting } = useDetectedColumnLanguage({
    workspaceId,
    nodeId,
    column,
    enabled: menuOpen,
  });
  const detectedStopwordLanguage = languages.find(
    (language) => language.iso6391 === detectedLanguage,
  );
  const otherLanguages = languages
    .filter((language) => language.iso6391 !== detectedStopwordLanguage?.iso6391)
    .sort((left, right) => left.name.localeCompare(right.name));
  const hasWords = words.length > 0;

  const commit = async (next: string[]) => {
    try {
      await onWordsChange(next);
    } catch {
      // The caller's persistence owns rollback, error messaging, and retry.
    }
  };

  // Appends one list, loading it first when it is not already in memory.
  const appendWords = async (load: () => Promise<string[]> | string[]) => {
    setIsPending(true);
    try {
      let loaded: string[];
      try {
        loaded = await load();
      } catch (cause) {
        toast.error('Failed to load stop words.', {
          description: cause instanceof Error ? cause.message : String(cause),
        });
        return;
      }
      await commit(mergeStopWordsText(formatStopWords(words), loaded));
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
      open={menuOpen}
      onOpenChange={(open) => {
        if (!open && keepOpenRef.current) {
          keepOpenRef.current = false;
          return;
        }
        setMenuOpen(open);
        // Start collapsed each time the menu opens.
        if (!open) setShowAllLanguages(false);
      }}
      onValueChange={(value) => {
        if (value === SAVED_LIST_VALUE || value === EMPTY_PROMPT_VALUE || value === DETECTING_VALUE)
          return;
        if (value === SHOW_ALL_LANGUAGES_VALUE) {
          keepOpenRef.current = true;
          setShowAllLanguages(true);
          return;
        }
        if (value === CLEAR_LIST_VALUE) {
          void clearWords();
          return;
        }
        if (value.startsWith(TAB_SOURCE_PREFIX)) {
          const source = sources.find(
            (candidate) => `${TAB_SOURCE_PREFIX}${candidate.tabId}` === value,
          );
          if (source) void appendWords(() => source.words);
          return;
        }
        if (value.startsWith(CLASSIC_LIST_PREFIX)) {
          void appendWords(() =>
            loadWordflowClassicStopwords(value.slice(CLASSIC_LIST_PREFIX.length)),
          );
          return;
        }
        void appendWords(async () => (await loadMergedStopwords({ languages: [value] })).merged);
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
        <SelectGroup>
          <SelectLabel>Wordflow classic lists</SelectLabel>
          {WORDFLOW_CLASSIC_STOPWORD_LISTS.map((list) => (
            <SelectItem key={list.iso6391} value={`${CLASSIC_LIST_PREFIX}${list.iso6391}`}>
              {`${list.name} (${String(list.wordCount)} words)`}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Languages (stopword library)</SelectLabel>
          {detectedStopwordLanguage ? (
            <SelectItem value={detectedStopwordLanguage.iso6391}>
              {detectedStopwordLanguage.name} (Detected)
            </SelectItem>
          ) : isDetecting ? (
            <SelectItem value={DETECTING_VALUE} disabled>
              Detecting language…
            </SelectItem>
          ) : null}
          {showAllLanguages ? (
            otherLanguages.map((language) => (
              <SelectItem key={language.iso6391} value={language.iso6391}>
                {language.name}
              </SelectItem>
            ))
          ) : (
            <SelectItem value={SHOW_ALL_LANGUAGES_VALUE}>
              {`Show all languages (${String(otherLanguages.length)})`}
            </SelectItem>
          )}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
