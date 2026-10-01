import type { components } from '@/api/generated/native';
import { objectRef } from '@/features/project/objects';
export type Rename = components['schemas']['ReferenceRename'];
const fold = (name: string) => name.toLowerCase();
const isRenameSource = (source: { name: string; schema?: string | null }, rename: Rename) =>
  fold(objectRef(source).schema) === fold(rename.source.schema) &&
  fold(source.name) === fold(rename.source.name);
/** Callers name the reference fields owned by their feature. SQL and unknown JSON are never walked. */
export function renameInput<T extends { source: { name: string; schema?: string | null } }>(
  input: T,
  rename: Rename,
  fields: (keyof T)[],
): T {
  if (!isRenameSource(input.source, rename)) return input;
  if (rename.type === 'table') return { ...input, source: { ...input.source, name: rename.name } };
  const column = (value: unknown) =>
    typeof value === 'string' && fold(value) === fold(rename.before) ? rename.after : value;
  return {
    ...input,
    ...Object.fromEntries(
      fields.map((field) => [
        field,
        Array.isArray(input[field]) ? input[field].map(column) : column(input[field]),
      ]),
    ),
  };
}
export function renamedDrafts<Request>(
  drafts: Record<string, Request>,
  base: string,
  rename: Rename,
  update: (request: Request, rename: Rename) => Request,
) {
  return Object.fromEntries(
    Object.entries(drafts).map(([key, draft]) => [
      key,
      (JSON.parse(key) as [string, string])[0] === base ? update(draft, rename) : draft,
    ]),
  );
}
