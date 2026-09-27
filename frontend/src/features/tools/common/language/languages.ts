/** MediaPipe may return a regional code; recommendations use its primary language. */
export function normaliseIso6391LanguageCode(code: string | null | undefined): string | null {
  const primary = code?.trim().toLowerCase().split(/[-_]/, 1)[0];
  return primary && /^[a-z]{2}$/.test(primary) ? primary : null;
}

/** Partition the native catalogue without duplicating its model or language inventory. */
export function partitionTokenizerModelsForLanguage<T extends { languages: readonly string[] }>(
  models: readonly T[],
  code: string | null | undefined,
): { recommended: T[]; other: T[] } {
  const language = normaliseIso6391LanguageCode(code);
  return {
    recommended: language ? models.filter((model) => model.languages.includes(language)) : [],
    other: models.filter((model) => !language || !model.languages.includes(language)),
  };
}
