import { ProjectError, request } from '@/api/client';
import type { components } from '@/api/generated/native';
import type { DataBlockExportFormat } from '@/features/project/common/exportFormats';
import { type DataTarget, objectRef } from '@/features/project/objects';
import { saveGeneratedExport } from '@/lib/download';

export interface OniSearchResult {
  id: string;
  title: string;
  importable: boolean;
  crate_id?: string | null;
  description?: string | null;
  license?: string | null;
  access?: string[];
  collections?: string[];
  file_formats?: string[];
  types?: string[];
}

/** LDaCA returns heterogeneous external records rather than a Wordflow-owned DTO. */
function isOniSearchResult(value: unknown): value is OniSearchResult {
  if (value === null || typeof value !== 'object') return false;
  if (
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !('title' in value) ||
    typeof value.title !== 'string' ||
    !('importable' in value) ||
    typeof value.importable !== 'boolean'
  )
    return false;
  for (const key of ['crate_id', 'description', 'license']) {
    const field: unknown = Reflect.get(value, key);
    if (field !== undefined && field !== null && typeof field !== 'string') return false;
  }
  for (const key of ['access', 'collections', 'file_formats', 'types']) {
    const field: unknown = Reflect.get(value, key);
    if (
      field !== undefined &&
      (!Array.isArray(field) || !field.every((item) => typeof item === 'string'))
    )
      return false;
  }
  return true;
}

export async function searchLdaca(
  base: string,
  method: 'keyword' | 'identifier',
  query: string,
  token?: string,
): Promise<OniSearchResult[]> {
  const response = await request(base, '/api/project/ldaca/search', 'post', {
    body: {
      method,
      query,
      token: token === '' ? undefined : token,
    },
  });
  const { items } = await response.json();
  if (!items.every(isOniSearchResult)) throw new Error('Unsupported LDaCA search response');
  return items;
}

export type SampleCatalogue = components['schemas']['SampleSnapshot'];

export async function sampleCatalogue(
  base: string,
  signal?: AbortSignal,
): Promise<SampleCatalogue> {
  return (await request(base, '/api/project/samples', 'get', { signal })).json();
}

export type StopwordSource = components['schemas']['StopwordSource'];

export async function readStopwords(
  base: string,
  selected: StopwordSource,
  signal?: AbortSignal,
): Promise<string[]> {
  return (
    await request(base, '/api/project/stopwords/read', 'post', { body: selected, signal })
  ).json();
}

export async function prepareStopwords(
  base: string,
  selected: StopwordSource | null,
  inputs: readonly StopwordSource[],
): Promise<StopwordSource> {
  return (
    await request(base, '/api/project/stopwords/prepare', 'post', {
      body: {
        selected,
        inputs: inputs.map(({ source, column }) => ({ source, column })),
      },
    })
  ).json();
}

export async function saveStopwords(
  base: string,
  selected: StopwordSource,
  before: readonly string[],
  after: readonly string[],
  sort = false,
) {
  await request(base, '/api/project/stopwords/save', 'post', {
    body: { selected, before: [...before], after: [...after], sort },
  });
}

export type SampleImportRequest = components['schemas']['SampleImport'];

export async function importSamples(base: string, input: SampleImportRequest) {
  return (await request(base, '/api/project/samples/import', 'post', { body: input })).json();
}

export async function importLdaca(base: string, identifier: string, token?: string) {
  return (
    await request(base, '/api/project/ldaca/import', 'post', { body: { identifier, token } })
  ).json();
}

export type ExportRequest = components['schemas']['ExportRequest'];

export type ExportInspection = components['schemas']['ExportInspection'];

export async function inspectExport(
  base: string,
  input: ExportRequest,
  signal?: AbortSignal,
): Promise<ExportInspection> {
  return (
    await request(base, '/api/project/exports/inspect', 'post', { body: input, signal })
  ).json();
}

export async function exportProject(base: string, input: ExportRequest) {
  const { isTauri } = await import('@/lib/isTauri');
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      return await invoke<string | null>('save_export', { request: input });
    } catch (error) {
      throw ProjectError.fromNative(error);
    }
  }
  const response = await request(base, '/api/project/exports', 'post', { body: input });
  const disposition = response.headers.get('content-disposition');
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : 'export';
  return saveGeneratedExport(await response.blob(), filename);
}

export async function exportNode(base: string, name: DataTarget, format: DataBlockExportFormat) {
  return exportProject(base, { kind: 'files', objects: [objectRef(name)], format });
}

export async function importTables(
  base: string,
  sources: components['schemas']['ImportTables']['sources'],
): Promise<components['schemas']['TableNames']> {
  return (await request(base, '/api/project/import', 'post', { body: { sources } })).json();
}

export async function localFileMetadata(base: string, paths: string[], signal?: AbortSignal) {
  return (
    await request(base, '/api/project/files/metadata', 'post', { body: { paths }, signal })
  ).json();
}
