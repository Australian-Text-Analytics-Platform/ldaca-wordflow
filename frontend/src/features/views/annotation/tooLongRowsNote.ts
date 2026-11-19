/**
 * The sentence added to a Run's failed-rows notice when some rows failed
 * because their text is too long for the model's context window (issue 493).
 * It names the model, and the window where the provider gave it. Empty when
 * no row was too long.
 * Used by: AnnotationFeature, after the failed-rows sentence.
 */
export function tooLongRowsNote(
  tooLongRows: number | null | undefined,
  model: string,
  contextWindowTokens: number | null | undefined,
): string {
  if (!tooLongRows) return '';
  const rows =
    tooLongRows === 1 ? '1 failed row has a text' : `${String(tooLongRows)} failed rows have texts`;
  const window = contextWindowTokens
    ? `, whose context window is ${contextWindowTokens.toLocaleString('en-US')} tokens`
    : '';
  return ` ${rows} too long for ${model}${window}. Choose a model that takes longer texts, use fewer examples, or annotate shorter texts.`;
}
