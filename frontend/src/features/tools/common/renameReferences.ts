import type { components } from '@/api/generated/native';
export type Rename = components['schemas']['ReferenceRename'];
const fold = (name: string) => name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Only known source/column positions change; query text and unknown JSON remain literal. */
export function renameReferences<Request>(request: Request, rename: Rename): Request {
  const next = structuredClone(request);
  function input(value: unknown, fields: string[]) {
    if (!record(value) || !record(value.source)) return;
    const source = value.source;
    if (
      typeof source.name !== 'string' ||
      fold(source.name) !== fold(rename.source.name) ||
      fold(typeof source.schema === 'string' ? source.schema : 'data') !==
        fold(rename.source.schema)
    )
      return;
    if (rename.type === 'table') source.name = rename.name;
    else {
      const replace = (v: unknown) =>
        typeof v === 'string' && fold(v) === fold(rename.before) ? rename.after : v;
      for (const field of fields) {
        if (field in value) {
          const current = value[field];
          value[field] = Array.isArray(current) ? current.map(replace) : replace(current);
        }
      }
    }
  }
  if (!record(next)) return next;
  if (Array.isArray(next.inputs)) for (const source of next.inputs) input(source, ['column']);
  input(next.input, ['column']);
  input(next.setup, ['document', 'annotation', 'correction']);
  if (record(next.setup)) input(next.setup.codebook, ['code', 'description']);
  input(next.codebook, ['code', 'description']);
  input(next.examples, ['text', 'label']);
  if (record(next.execution)) input(next.execution.examples, ['text', 'label']);
  input(next, [
    'axis',
    'groups',
    'value',
    'category',
    'stack',
    'x',
    'y',
    'color',
    'size',
    'label',
    'row',
    'column',
    'stages',
  ]);
  if (
    rename.type === 'table' &&
    rename.source.schema === 'data' &&
    next.study === rename.source.name
  )
    (next as Record<string, unknown>).study = rename.name;
  return next;
}
export function renamedDrafts<Request>(
  drafts: Record<string, Request>,
  base: string,
  rename: Rename,
) {
  return Object.fromEntries(
    Object.entries(drafts).map(([key, draft]) => {
      const [scope] = JSON.parse(key) as [string, string];
      // Plot tabs use a nested [host, mode] scope; other tools use the host directly.
      const host = scope.startsWith('[') ? (JSON.parse(scope) as [string, string])[0] : scope;
      return [key, host === base ? renameReferences(draft, rename) : draft];
    }),
  );
}
