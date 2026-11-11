/** The most of a search term that goes into a default name (issue 457). */
const SEARCH_TERM_NAME_LIMIT = 20;

/**
 * The ending of a Concordance result's default Data Block or file name:
 * `concordance_<search term>`, or `concordance_documents_<search term>` for
 * one row per document. Every result used to be named `<block>_concordance`,
 * so several searches of one Data Block could not be told apart in the
 * Project (issue 457, Monika). The term is the one the result was run with,
 * as typed, a regular expression included, so it is recognisable; control
 * characters and path separators are replaced and it is cut to 20 characters.
 * The name stays editable in the dialog.
 */
export function concordanceNameSuffix(perDocument: boolean, searchTerm: string): string {
  const base = perDocument ? 'concordance_documents' : 'concordance';
  const printable = Array.from(searchTerm, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
  const term = printable
    .replaceAll('/', '-')
    .replaceAll('\\', '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SEARCH_TERM_NAME_LIMIT)
    .trim();
  return term ? `${base}_${term}` : base;
}
