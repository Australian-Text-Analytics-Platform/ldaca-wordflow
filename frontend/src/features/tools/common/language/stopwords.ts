import { normaliseIso6391LanguageCode } from './languages';

const STOPWORD_LANGUAGE_METADATA = [
  { stopwordCode: 'afr', iso6391: 'af', name: 'Afrikaans' },
  { stopwordCode: 'ara', iso6391: 'ar', name: 'Arabic' },
  { stopwordCode: 'hye', iso6391: 'hy', name: 'Armenian' },
  { stopwordCode: 'eus', iso6391: 'eu', name: 'Basque' },
  { stopwordCode: 'ben', iso6391: 'bn', name: 'Bengali' },
  { stopwordCode: 'bre', iso6391: 'br', name: 'Breton' },
  { stopwordCode: 'bul', iso6391: 'bg', name: 'Bulgarian' },
  { stopwordCode: 'mya', iso6391: 'my', name: 'Burmese' },
  { stopwordCode: 'cat', iso6391: 'ca', name: 'Catalan' },
  { stopwordCode: 'zho', iso6391: 'zh', name: 'Chinese' },
  { stopwordCode: 'hrv', iso6391: 'hr', name: 'Croatian' },
  { stopwordCode: 'ces', iso6391: 'cs', name: 'Czech' },
  { stopwordCode: 'dan', iso6391: 'da', name: 'Danish' },
  { stopwordCode: 'nld', iso6391: 'nl', name: 'Dutch' },
  { stopwordCode: 'eng', iso6391: 'en', name: 'English' },
  { stopwordCode: 'epo', iso6391: 'eo', name: 'Esperanto' },
  { stopwordCode: 'est', iso6391: 'et', name: 'Estonian' },
  { stopwordCode: 'fin', iso6391: 'fi', name: 'Finnish' },
  { stopwordCode: 'fra', iso6391: 'fr', name: 'French' },
  { stopwordCode: 'glg', iso6391: 'gl', name: 'Galician' },
  { stopwordCode: 'deu', iso6391: 'de', name: 'German' },
  { stopwordCode: 'guj', iso6391: 'gu', name: 'Gujarati' },
  { stopwordCode: 'hau', iso6391: 'ha', name: 'Hausa' },
  { stopwordCode: 'heb', iso6391: 'he', name: 'Hebrew' },
  { stopwordCode: 'hin', iso6391: 'hi', name: 'Hindi' },
  { stopwordCode: 'hun', iso6391: 'hu', name: 'Hungarian' },
  { stopwordCode: 'ind', iso6391: 'id', name: 'Indonesian' },
  { stopwordCode: 'gle', iso6391: 'ga', name: 'Irish' },
  { stopwordCode: 'ita', iso6391: 'it', name: 'Italian' },
  { stopwordCode: 'jpn', iso6391: 'ja', name: 'Japanese' },
  { stopwordCode: 'kor', iso6391: 'ko', name: 'Korean' },
  { stopwordCode: 'kur', iso6391: 'ku', name: 'Kurdish' },
  { stopwordCode: 'lat', iso6391: 'la', name: 'Latin' },
  { stopwordCode: 'lav', iso6391: 'lv', name: 'Latvian' },
  { stopwordCode: 'lit', iso6391: 'lt', name: 'Lithuanian' },
  { stopwordCode: 'msa', iso6391: 'ms', name: 'Malay (macrolanguage)' },
  { stopwordCode: 'mar', iso6391: 'mr', name: 'Marathi' },
  { stopwordCode: 'ell', iso6391: 'el', name: 'Modern Greek (1453-)' },
  { stopwordCode: 'nob', iso6391: 'nb', name: 'Norwegian Bokmål' },
  { stopwordCode: 'fas', iso6391: 'fa', name: 'Persian' },
  { stopwordCode: 'pol', iso6391: 'pl', name: 'Polish' },
  { stopwordCode: 'por', iso6391: 'pt', name: 'Portuguese' },
  { stopwordCode: 'ron', iso6391: 'ro', name: 'Romanian' },
  { stopwordCode: 'rus', iso6391: 'ru', name: 'Russian' },
  { stopwordCode: 'slk', iso6391: 'sk', name: 'Slovak' },
  { stopwordCode: 'slv', iso6391: 'sl', name: 'Slovenian' },
  { stopwordCode: 'som', iso6391: 'so', name: 'Somali' },
  { stopwordCode: 'sot', iso6391: 'st', name: 'Southern Sotho' },
  { stopwordCode: 'spa', iso6391: 'es', name: 'Spanish' },
  { stopwordCode: 'swa', iso6391: 'sw', name: 'Swahili (macrolanguage)' },
  { stopwordCode: 'swe', iso6391: 'sv', name: 'Swedish' },
  { stopwordCode: 'tgl', iso6391: 'tl', name: 'Tagalog' },
  { stopwordCode: 'tha', iso6391: 'th', name: 'Thai' },
  { stopwordCode: 'tur', iso6391: 'tr', name: 'Turkish' },
  { stopwordCode: 'ukr', iso6391: 'uk', name: 'Ukrainian' },
  { stopwordCode: 'urd', iso6391: 'ur', name: 'Urdu' },
  { stopwordCode: 'vie', iso6391: 'vi', name: 'Vietnamese' },
  { stopwordCode: 'yor', iso6391: 'yo', name: 'Yoruba' },
  { stopwordCode: 'zul', iso6391: 'zu', name: 'Zulu' },
] as const;

interface MergedStopwordsResult {
  byLanguage: { language: string; words: string[] }[];
  merged: string[];
}

let stopwordPromise: Promise<Record<string, unknown>> | null = null;

function loadStopwordModule(): Promise<Record<string, unknown>> {
  stopwordPromise ??= import('stopword')
    .then((module) => module as Record<string, unknown>)
    .catch((error: unknown) => {
      stopwordPromise = null;
      throw error;
    });
  return stopwordPromise;
}

/** Tidy local drafts while preserving first spelling; DuckDB owns saved membership rules. */
export function mergeStopwords(
  existing: string | readonly string[],
  incoming: readonly string[],
): string[] {
  const candidates = typeof existing === 'string' ? existing.split(/[,\n]/) : existing;
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const candidate of [...candidates, ...incoming]) {
    const word = candidate.trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    merged.push(word);
  }
  return merged;
}

/** Lazy bundled lists: opening a selector does not load the complete vocabulary. */
export async function loadMergedStopwords({
  languages,
}: {
  languages: readonly (string | null | undefined)[];
}): Promise<MergedStopwordsResult> {
  const selected = new Map<string, (typeof STOPWORD_LANGUAGE_METADATA)[number]>();
  for (const language of languages) {
    const code = language?.trim().toLowerCase().split(/[-_]/, 1)[0];
    const list = STOPWORD_LANGUAGE_METADATA.find(
      (item) => item.iso6391 === normaliseIso6391LanguageCode(code) || item.stopwordCode === code,
    );
    if (list) selected.set(list.iso6391, list);
  }
  if (selected.size === 0) return { byLanguage: [], merged: [] };
  const module = await loadStopwordModule();
  const byLanguage = [...selected.values()].map(({ iso6391, stopwordCode }) => {
    const words = module[stopwordCode];
    return {
      language: iso6391,
      words: Array.isArray(words)
        ? words
            .filter((word): word is string => typeof word === 'string')
            .map((word) => word.trim())
            .filter(Boolean)
        : [],
    };
  });
  return {
    byLanguage,
    merged: mergeStopwords(
      [],
      byLanguage.flatMap((group) => group.words),
    ),
  };
}

export function listSupportedStopwordLanguages(): { iso6391: string; name: string }[] {
  return STOPWORD_LANGUAGE_METADATA.map(({ iso6391, name }) => ({ iso6391, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
