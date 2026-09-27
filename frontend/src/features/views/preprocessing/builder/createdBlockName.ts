/** The name of a newly created Data Block from a create response (issue 205). */
export function createdBlockName(created: unknown, fallback?: string): string {
  const name =
    created && typeof created === 'object' ? (created as { name?: unknown }).name : undefined;
  if (typeof name === 'string' && name) return name;
  return fallback ?? 'the new Data Block';
}
