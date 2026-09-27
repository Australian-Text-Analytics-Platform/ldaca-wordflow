import {
  requestUrl,
  type HttpPath,
  type Method,
  type RequestOptions,
  type HttpResponse,
} from '@/api/http';
import type { components } from '@/api/generated/native';
import { decodeArrowData } from '@/lib/arrow/decodeArrowTable';
import { type Table, type TypeMap, tableFromIPC } from 'apache-arrow';
import type { DataBlockExportFormat } from '@/features/project/common/exportFormats';
import type { ChangeScope } from './projectChanges';

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

export type Project = components['schemas']['ProjectInfo'];
export type ObjectRef = components['schemas']['Relation'];
/** Strings address registered Data Blocks; explicit references address catalogue objects. */
export type DataTarget = string | components['schemas']['ObjectTarget'];
export const objectRef = (target: DataTarget): ObjectRef =>
  typeof target === 'string'
    ? { schema: 'data', name: target }
    : { schema: target.schema ?? 'data', name: target.name };
export const targetKey = (target: DataTarget) => {
  const r = objectRef(target);
  return JSON.stringify([r.schema, r.name]);
};
export const targetLabel = (target: DataTarget) =>
  typeof target === 'string' ? target : `${objectRef(target).schema}.${target.name}`;
export const sameTarget = (left: DataTarget | null, right: DataTarget | null) =>
  left === null || right === null ? left === right : targetKey(left) === targetKey(right);

export type DependencyGraph = components['schemas']['DependencyGraph'];
export async function dependencyGraph(
  base: string,
  signal?: AbortSignal,
): Promise<DependencyGraph> {
  return (
    await request(base, '/api/project/graph', 'get', {
      query: { mode: 'dependencies' },
      signal,
    })
  ).json() as Promise<DependencyGraph>;
}
export type ProjectNode = components['schemas']['Node'] & {
  object?: ObjectRef;
  registered?: boolean;
  label?: string;
};
export type Graph = Omit<components['schemas']['Graph'], 'nodes'> & { nodes: ProjectNode[] };
export type Statement = components['schemas']['SqlStatement'];

export async function request<P extends HttpPath, M extends Method<P>>(
  base: string,
  template: P,
  method: M,
  options: RequestOptions<P, M>,
): Promise<HttpResponse<P, M>> {
  const path = requestUrl(template, options.path, options.query);
  const body = options.body;
  const signal = options.signal;
  const keepalive = options.keepalive ?? false;
  const requestMethod = method.toUpperCase();
  const requestContext = `${requestMethod} ${path}`;
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: requestMethod,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      keepalive,
      cache: options.cache,
    });
  } catch (error) {
    if (
      signal?.aborted ||
      (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
    )
      throw error;
    throw new ProjectError(
      error instanceof Error ? error.message : String(error),
      '',
      undefined,
      `${requestContext}\nNo HTTP response received`,
    );
  }
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const error = JSON.parse(text) as Partial<components['schemas']['ErrorEnvelope']>;
      message = error.error?.message ?? text;
    } catch {
      /* Transport errors may be plain text. */
    }
    throw new ProjectError(
      message || `Request failed (${String(response.status)})`,
      text,
      response.headers.get('x-wordflow-task-id') ?? undefined,
      `${requestContext}\nHTTP ${String(response.status)} ${response.statusText}`.trim(),
    );
  }
  // The selected operation owns the JSON type; binary callers retain Response methods.
  return response as HttpResponse<P, M>;
}
/** Syntax-only DTO. SQL and literal text retain precision; DuckDB's AST stays native. */
export type ParsedExpression = components['schemas']['ParsedExpression'];
export async function parseExpression(
  base: string,
  expression: string,
  signal?: AbortSignal,
): Promise<ParsedExpression> {
  return (
    await request(base, '/api/project/expressions/parse', 'post', {
      body: { expression },
      signal,
    })
  ).json();
}
export async function projectStatus(base: string, signal?: AbortSignal): Promise<Project | null> {
  const response = await request(base, '/api/project', 'get', { signal });
  return (await response.json()).project;
}
export async function querySql(
  base: string,
  statements: Statement[],
  signal?: AbortSignal,
): Promise<Table<TypeMap>> {
  const response = await request(base, '/api/project/sql', 'post', {
    body: { statements, mode: 'read' },
    signal,
  });
  return tableFromIPC<TypeMap>(new Uint8Array(await response.arrayBuffer()));
}
export interface SqlExecutionResult {
  table: Table<TypeMap>;
  statementsCompleted: number;
  truncated: boolean;
}
export async function runSqlScript(
  base: string,
  script: string,
  mode: 'execute' | 'preview',
  taskLabel?: string,
): Promise<SqlExecutionResult> {
  const response = await request(base, '/api/project/sql', 'post', {
    body: {
      script,
      mode,
      max_rows: 50_000,
      task_label: taskLabel,
    },
  });
  return {
    table: tableFromIPC<TypeMap>(new Uint8Array(await response.arrayBuffer())),
    statementsCompleted: Number(response.headers.get('x-wordflow-statements-completed')),
    truncated: response.headers.get('x-wordflow-result-truncated') === 'true',
  };
}
export async function graph(base: string, signal?: AbortSignal): Promise<Graph> {
  return (await request(base, '/api/project/graph', 'get', { signal })).json() as Promise<Graph>;
}
export const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
export const relation = (node: Pick<ProjectNode, 'table_name'> & { schema?: string }) =>
  `${node.schema ? identifier(node.schema) : 'data'}.${identifier(node.table_name)}`;
export const objectSql = (target: DataTarget) => {
  const r = objectRef(target);
  return relation({ table_name: r.name, schema: r.schema });
};
export interface SqlType {
  name: string;
  logical_type: string;
  comment: string | null;
  builtin: boolean;
}
export async function sqlTypes(base: string, signal?: AbortSignal): Promise<SqlType[]> {
  const result = await querySql(
    base,
    [
      {
        sql: `
    SELECT DISTINCT
      CASE WHEN internal THEN upper(type_name)
        ELSE '"' || replace(schema_name, '"', '""') || '"."' || replace(type_name, '"', '""') || '"'
      END AS name,
      logical_type, comment, internal AS builtin
    FROM duckdb_types()
    WHERE (internal OR database_name=current_database())
      AND logical_type NOT IN ('NULL', 'TYPE')
      AND NOT (schema_name='wordflow' AND logical_type='ENUM'
        AND regexp_full_match(type_name, 'enum_[0-9a-f]{32}'))
    ORDER BY name
  `,
      },
    ],
    signal,
  );
  // Omit pseudo-types and Wordflow's generated categorical types from suggestions only.
  return result.toArray().map((row: { toJSON: () => SqlType }) => row.toJSON());
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

export async function rowPage(
  base: string,
  name: DataTarget,
  page: number,
  pageSize: number,
  sorting: { id: string; desc: boolean }[],
  signal?: AbortSignal,
) {
  const { decodeArrowTable } = await import('@/lib/arrow/decodeArrowTable');
  const response = await (typeof name === 'string'
    ? request(base, '/api/project/nodes/{table_name}/page', 'post', {
        path: { table_name: name },
        body: {
          page,
          page_size: pageSize,
          sorting: sorting.map(({ id, desc }) => ({ column: id, descending: desc })),
        },
        signal,
      })
    : request(base, '/api/project/objects/{schema}/{table_name}/page', 'post', {
        path: { schema: objectRef(name).schema, table_name: name.name },
        body: {
          page,
          page_size: pageSize,
          sorting: sorting.map(({ id, desc }) => ({ column: id, descending: desc })),
        },
        signal,
      }));
  const decoded = await decodeArrowTable(await response.arrayBuffer());
  return {
    ...decoded,
    rows: decoded.rows.slice(0, pageSize),
    hasNext: decoded.rows.length > pageSize,
  };
}
export async function nodeSchema(base: string, name: DataTarget, signal?: AbortSignal) {
  const { decodeArrowTable } = await import('@/lib/arrow/decodeArrowTable');
  const response = await (typeof name === 'string'
    ? request(base, '/api/project/nodes/{table_name}/schema', 'get', {
        path: { table_name: name },
        signal,
      })
    : request(base, '/api/project/objects/{schema}/{table_name}/schema', 'get', {
        path: { schema: objectRef(name).schema, table_name: name.name },
        signal,
      }));
  return (await decodeArrowTable(await response.arrayBuffer())).schema;
}

export async function deleteNode(base: string, name: DataTarget) {
  await (typeof name === 'string'
    ? request(base, '/api/project/nodes/{table_name}/delete', 'post', {
        path: { table_name: name },
        body: {},
      })
    : request(base, '/api/project/objects/{schema}/{table_name}/delete', 'post', {
        path: { schema: objectRef(name).schema, table_name: name.name },
        body: {},
      }));
}
export async function materializeNode(base: string, name: DataTarget) {
  await (typeof name === 'string'
    ? request(base, '/api/project/nodes/{table_name}/materialize', 'post', {
        path: { table_name: name },
        body: {},
      })
    : request(base, '/api/project/objects/{schema}/{table_name}/materialize', 'post', {
        path: { schema: objectRef(name).schema, table_name: name.name },
        body: {},
      }));
}
export async function viewDefinition(
  base: string,
  name: DataTarget,
  signal?: AbortSignal,
): Promise<components['schemas']['ViewDefinition']> {
  return (
    await (typeof name === 'string'
      ? request(base, '/api/project/nodes/{table_name}/definition', 'get', {
          path: { table_name: name },
          signal,
        })
      : request(base, '/api/project/objects/{schema}/{table_name}/definition', 'get', {
          path: { schema: objectRef(name).schema, table_name: name.name },
          signal,
        }))
  ).json();
}
export async function replaceViewDefinition(base: string, name: DataTarget, sql: string) {
  await (typeof name === 'string'
    ? request(base, '/api/project/nodes/{table_name}/definition', 'post', {
        path: { table_name: name },
        body: { sql },
      })
    : request(base, '/api/project/objects/{schema}/{table_name}/definition', 'post', {
        path: { schema: objectRef(name).schema, table_name: name.name },
        body: { sql },
      }));
}
export async function executeSql(base: string, statements: Statement[], changes: ChangeScope) {
  await request(base, '/api/project/sql', 'post', {
    body: { statements, response: 'command', changes },
  });
}
export async function addLogicalLink(base: string, source: string, target: string) {
  await executeSql(
    base,
    [
      {
        sql: 'INSERT INTO wordflow.edges VALUES ((SELECT table_name FROM wordflow.nodes WHERE table_name=?), (SELECT table_name FROM wordflow.nodes WHERE table_name=?)) ON CONFLICT DO NOTHING',
        parameters: [source, target],
      },
    ],
    { resources: ['graph'] },
  );
}
export async function replaceSource(
  base: string,
  child: ObjectRef,
  oldSource: ObjectRef,
  newSource: ObjectRef,
) {
  await request(base, '/api/project/objects/{schema}/{table_name}/replace-source', 'post', {
    path: { schema: child.schema, table_name: child.name },
    body: { old_source: oldSource, new_source: newSource },
  });
}
export async function undoNode(base: string, name: DataTarget) {
  await (typeof name === 'string'
    ? request(base, '/api/project/nodes/{table_name}/undo', 'post', {
        path: { table_name: name },
        body: {},
      })
    : request(base, '/api/project/objects/{schema}/{table_name}/undo', 'post', {
        path: { schema: objectRef(name).schema, table_name: name.name },
        body: {},
      }));
}
export async function renameNode(
  base: string,
  name: DataTarget,
  next: string,
): Promise<components['schemas']['TableName']> {
  return (
    await (typeof name === 'string'
      ? request(base, '/api/project/nodes/{table_name}/rename', 'post', {
          path: { table_name: name },
          body: { name: next },
        })
      : request(base, '/api/project/objects/{schema}/{table_name}/rename', 'post', {
          path: { schema: objectRef(name).schema, table_name: name.name },
          body: { name: next },
        }))
  ).json();
}
export async function cloneNode(
  base: string,
  name: DataTarget,
): Promise<components['schemas']['TableName']> {
  return (
    await (typeof name === 'string'
      ? request(base, '/api/project/nodes/{table_name}/clone', 'post', {
          path: { table_name: name },
          body: {},
        })
      : request(base, '/api/project/objects/{schema}/{table_name}/clone', 'post', {
          path: { schema: objectRef(name).schema, table_name: name.name },
          body: {},
        }))
  ).json();
}
export type ColumnCastType = components['schemas']['CastType'];
export type ColumnChange = components['schemas']['ColumnChange'];
export async function changeColumn(base: string, target: DataTarget, change: ColumnChange) {
  await (typeof target === 'string'
    ? request(base, '/api/project/nodes/{table_name}/columns', 'post', {
        path: { table_name: target },
        body: change,
      })
    : request(base, '/api/project/objects/{schema}/{table_name}/columns', 'post', {
        path: { schema: objectRef(target).schema, table_name: target.name },
        body: change,
      }));
}
export type ColumnMapping = components['schemas']['ColumnMapping'];
export async function createView(
  base: string,
  input: components['schemas']['CreateView'],
): Promise<components['schemas']['TableName']> {
  return (await request(base, '/api/project/views', 'post', { body: input })).json();
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
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
  return filename;
}
export async function exportNode(base: string, name: DataTarget, format: DataBlockExportFormat) {
  return exportProject(base, { kind: 'files', objects: [objectRef(name)], format });
}

export class ProjectError extends Error {
  static fromNative(value: unknown): ProjectError {
    const error =
      value && typeof value === 'object'
        ? (value as { message?: string; task_id?: string })
        : { message: String(value) };
    return new ProjectError(
      error.message ?? JSON.stringify(error),
      JSON.stringify({ error: { ...error, message: error.message } }),
      error.task_id,
    );
  }
  code: string;
  statementIndex?: number;
  readonly taskId?: string;
  readonly details: string;
  constructor(message: string, body: string, taskId?: string, context?: string) {
    super(message);
    this.name = 'ProjectError';
    this.taskId = taskId;
    this.code = 'request_failed';
    let details = body || message;
    try {
      const parsed = JSON.parse(body) as Partial<components['schemas']['ErrorEnvelope']>;
      this.code = parsed.error?.code ?? this.code;
      this.statementIndex = parsed.error?.statement_index ?? undefined;
      details = JSON.stringify(parsed, null, 2);
    } catch {
      /* Non-JSON transport errors keep the response text. */
    }
    this.details = context ? `${context}\n\n${details}` : details;
  }
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

export type AnnotationCodebook = components['schemas']['Codebook'];
export type AnnotationSetup = components['schemas']['ManualSetup'];
export type MutationStamp = components['schemas']['MutationStamp'];
export type AnnotationEdit = components['schemas']['EditRequest'];
export type AnnotationFilter = components['schemas']['RowFilter'];
export type AnnotationReview = Required<components['schemas']['Review']>;
export type AnnotationComparison = components['schemas']['Comparison'];
export type AnnotationReviewSummary = components['schemas']['ReviewSummary'];
export async function beginAnnotationEdit(
  base: string,
  tab: string,
  input: AnnotationEdit,
): Promise<CellEditSession> {
  return (
    await request(base, '/api/project/tabs/{id}/annotation/edit', 'post', {
      path: { id: tab },
      body: input,
    })
  ).json();
}
export async function createAnnotationCodebook(
  base: string,
  name: string,
): Promise<AnnotationCodebook> {
  return (
    await request(base, '/api/project/annotation/codebooks', 'post', { body: { name } })
  ).json();
}
export async function annotationCodebook(
  base: string,
  book: AnnotationCodebook,
  signal?: AbortSignal,
): Promise<components['schemas']['Code'][]> {
  return (
    await request(base, '/api/project/annotation/codebook', 'post', { body: book, signal })
  ).json();
}

export type CellEditColumn = components['schemas']['CellEditColumn'];
export type CellEditSession = components['schemas']['SessionInfo'];
export type CellPatch = components['schemas']['CellEditPatch'];
export type TableEdits = Required<components['schemas']['CellEditSave']>;
export async function beginCellEdit(base: string, name: DataTarget): Promise<CellEditSession> {
  return (
    await (typeof name === 'string'
      ? request(base, '/api/project/nodes/{table_name}/cell-edit', 'post', {
          path: { table_name: name },
          body: {},
        })
      : request(base, '/api/project/objects/{schema}/{table_name}/cell-edit', 'post', {
          path: { schema: objectRef(name).schema, table_name: name.name },
          body: {},
        }))
  ).json();
}
export async function cellEditPage(
  base: string,
  session: string,
  page: number,
  pageSize: number,
  sorting: { id: string; desc: boolean }[],
  signal?: AbortSignal,
  review?: AnnotationReview,
) {
  const response = await request(base, '/api/project/cell-edits/{session_id}/page', 'post', {
    path: { session_id: session },
    body: {
      review,
      page,
      page_size: pageSize,
      sorting: sorting.map(({ id, desc }) => ({ column: id, descending: desc })),
    },
    signal,
  });
  const { decodeCellEditPage } = await import('@/features/table-editing/decodeCellEditPage');
  return decodeCellEditPage(await response.arrayBuffer(), pageSize);
}
export async function saveCellEdit(base: string, session: string, edits: TableEdits) {
  await request(base, '/api/project/cell-edits/{session_id}/save', 'post', {
    path: { session_id: session },
    body: edits,
  });
}
export async function cancelCellEdit(base: string, session: string) {
  await request(base, '/api/project/cell-edits/{session_id}/cancel', 'post', {
    path: { session_id: session },
    body: {},
    keepalive: true,
  });
}

export type NativeTask = components['schemas']['TaskSummary'];
export type TaskSnapshot = components['schemas']['TaskSnapshot'];
export async function getTasks(base: string, signal?: AbortSignal): Promise<TaskSnapshot> {
  return (await request(base, '/api/project/tasks', 'get', { signal })).json();
}
export async function cancelTask(base: string, id: string): Promise<TaskSnapshot> {
  return (
    await request(base, '/api/project/tasks/{task_id}/cancel', 'post', {
      path: { task_id: id },
      body: {},
    })
  ).json();
}
export async function dismissTask(base: string, id: string): Promise<TaskSnapshot> {
  return (
    await request(base, '/api/project/tasks/{task_id}', 'delete', { path: { task_id: id } })
  ).json();
}

export type AnalysisKind =
  | 'annotation'
  | 'frequency'
  | 'concordance'
  | 'quotation'
  | 'topic-modeling'
  | PlotMode;
export type Tab = Omit<components['schemas']['Tab'], 'kind' | 'settings'> & {
  kind: AnalysisKind;
  settings: Record<string, unknown>;
};
export type FrequencyRequest = components['schemas']['FrequencyRequest'];
type Analysis<Result = unknown> = Omit<components['schemas']['Analysis'], 'result'> & {
  result: (Omit<components['schemas']['AnalysisOutput'], 'payload'> & { payload: Result }) | null;
};
/** Completed output returned by Run or a validated saved-output read. */
type AnalysisResult<Result = unknown> = Omit<Analysis<Result>, 'result'> & {
  result: NonNullable<Analysis<Result>['result']>;
};
export type FrequencyAnalysisResult = AnalysisResult<components['schemas']['FrequencyResultV1']>;
export type FrequencyQuery = components['schemas']['FrequencyQuery'];
export type TokenizerInfo = components['schemas']['TokenizerInfo'];
export async function listTabs(base: string, signal?: AbortSignal, kind?: string): Promise<Tab[]> {
  return (
    await (await request(base, '/api/project/tabs', 'get', { query: { kind }, signal })).json()
  ).map(tabView);
}
export async function createTab(base: string, kind: AnalysisKind, name?: string): Promise<Tab> {
  return tabView(
    await (await request(base, '/api/project/tabs', 'post', { body: { kind, name } })).json(),
  );
}
export async function updateTab(
  base: string,
  id: string,
  changes: components['schemas']['UpdateTab'],
): Promise<Tab> {
  return tabView(
    await (
      await request(base, '/api/project/tabs/{id}', 'post', { path: { id }, body: changes })
    ).json(),
  );
}
export async function reorderTabs(base: string, kind: string, ids: string[]): Promise<Tab[]> {
  return (
    await (await request(base, '/api/project/tabs/reorder', 'post', { body: { kind, ids } })).json()
  ).map(tabView);
}
export async function deleteTab(base: string, id: string): Promise<void> {
  await request(base, '/api/project/tabs/{id}', 'delete', { path: { id } });
}
export async function clearTab(base: string, id: string): Promise<void> {
  await request(base, '/api/project/tabs/{id}/result', 'delete', { path: { id } });
}
export async function runFrequency(
  base: string,
  tabId: string,
  input: FrequencyRequest,
): Promise<FrequencyAnalysisResult> {
  return completedAnalysis(
    await (
      await request(base, '/api/project/tabs/{id}/frequency', 'post', {
        path: { id: tabId },
        body: input,
      })
    ).json(),
    'frequency',
  );
}
export async function getFrequencyResult(
  base: string,
  id: string,
  signal?: AbortSignal,
): Promise<FrequencyAnalysisResult | null> {
  const result = await (
    await request(base, '/api/project/analyses/{id}', 'get', { path: { id }, signal })
  ).json();
  if (result.kind === 'frequency' && result.result === null) return null;
  if (result.kind !== 'frequency' || result.result?.version !== 1)
    throw new Error('This Frequency result version is not supported.');
  // Source descriptors also initialize the request panel's legacy colours.
  const corpora = (
    result.result.payload as { corpora?: ({ source?: Partial<ObjectRef> | null } | null)[] } | null
  )?.corpora;
  if (
    !Array.isArray(corpora) ||
    corpora.some(
      (corpus) =>
        typeof corpus?.source?.schema !== 'string' || typeof corpus.source.name !== 'string',
    )
  )
    throw new Error('Saved Frequency source descriptors are invalid. Rerun to rebuild results.');
  return result as FrequencyAnalysisResult;
}
export async function queryFrequency(
  base: string,
  id: string,
  query: FrequencyQuery,
  signal?: AbortSignal,
) {
  const response = await request(base, '/api/project/analyses/{id}/frequency/query', 'post', {
    path: { id },
    body: query,
    signal,
  });
  return {
    table: tableFromIPC<TypeMap>(new Uint8Array(await response.arrayBuffer())),
    totalRows: Number(response.headers.get('x-wordflow-total-rows')),
  };
}
export async function getTokenizers(base: string, signal?: AbortSignal): Promise<TokenizerInfo[]> {
  return (await request(base, '/api/project/tokenizers', 'get', { signal })).json();
}
export async function downloadFrequency(
  base: string,
  id: string,
  query: FrequencyQuery,
  format: 'csv' | 'markdown',
): Promise<Blob> {
  return (
    await request(base, '/api/project/analyses/{id}/frequency/export', 'post', {
      path: { id },
      body: {
        query,
        format,
      },
    })
  ).blob();
}
export async function downloadFrequencyParts(
  base: string,
  id: string,
  query: FrequencyQuery,
  format: 'csv' | 'markdown',
) {
  const response = await request(base, '/api/project/analyses/{id}/frequency/export', 'post', {
    path: { id },
    body: {
      query,
      format,
      include_stopwords: true,
    },
  });
  const parts = await response.formData();
  const table = parts.get('table');
  const words = parts.get('stopwords');
  if (!(table instanceof Blob) || !(words instanceof Blob))
    throw new Error('Incomplete Frequency export');
  return { table, stopwords: (await words.text()).split('\n').filter(Boolean) };
}
export async function exportFrequency(
  base: string,
  id: string,
  query: FrequencyQuery,
  format: 'csv' | 'markdown',
  suggestedName?: string,
): Promise<string | null> {
  const { isTauri } = await import('@/lib/isTauri');
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      return await invoke<string | null>('save_frequency_export', {
        analysisId: id,
        query,
        format,
      });
    } catch (error) {
      throw ProjectError.fromNative(error);
    }
  }
  const url = URL.createObjectURL(await downloadFrequency(base, id, query, format));
  const name = suggestedName ?? `frequency.${format === 'markdown' ? 'md' : 'csv'}`;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
  return name;
}

export type ConcordanceSearch = Required<components['schemas']['ConcordanceSearch']>;
export type ConcordanceInput = components['schemas']['ConcordanceInput'];
export type ConcordanceRequest = Omit<components['schemas']['ConcordanceRequest'], 'search'> & {
  search: ConcordanceSearch;
};
export type ConcordanceAnalysisResult = AnalysisResult<
  components['schemas']['ConcordanceResultV1']
>;
export type ConcordanceFilter = components['schemas']['ConcordanceFilter'];
export type ConcordanceSort = components['schemas']['SavedSort'];
export type ConcordanceQuery = Required<components['schemas']['ConcordanceQuery']>;
export type ConcordancePreviewRequest = Omit<
  Required<components['schemas']['ConcordancePreview']>,
  'search'
> & { search: ConcordanceSearch };
export type ConcordancePublishSource = components['schemas']['PublishSource'];
export async function runConcordance(
  base: string,
  tabId: string,
  input: ConcordanceRequest,
): Promise<ConcordanceAnalysisResult> {
  return completedAnalysis(
    await (
      await request(base, '/api/project/tabs/{id}/concordance', 'post', {
        path: { id: tabId },
        body: input,
      })
    ).json(),
    'concordance',
  );
}
export async function getConcordanceResult(
  base: string,
  id: string,
  signal?: AbortSignal,
): Promise<ConcordanceAnalysisResult | null> {
  const result = await (
    await request(base, '/api/project/analyses/{id}', 'get', { path: { id }, signal })
  ).json();
  if (result.kind === 'concordance' && result.result === null) return null;
  if (result.kind !== 'concordance' || result.result?.version !== 1)
    throw new Error('Unsupported Concordance result version');
  return result as ConcordanceAnalysisResult;
}
async function documentMatchPage(response: Response) {
  return {
    table: tableFromIPC<TypeMap>(new Uint8Array(await response.arrayBuffer())),
    totalRows: Number(response.headers.get('x-wordflow-total-rows')),
    documentCount: Number(response.headers.get('x-wordflow-document-count')),
    matchCount: Number(response.headers.get('x-wordflow-match-count')),
    hasNext: response.headers.get('x-wordflow-has-next') === 'true',
  };
}
export async function previewConcordance(
  base: string,
  id: string,
  input: ConcordancePreviewRequest,
  signal?: AbortSignal,
) {
  return documentMatchPage(
    await request(base, '/api/project/tabs/{id}/concordance/preview', 'post', {
      path: { id },
      body: input,
      signal,
    }),
  );
}
export async function queryConcordance(
  base: string,
  id: string,
  input: ConcordanceQuery,
  signal?: AbortSignal,
) {
  return documentMatchPage(
    await request(base, '/api/project/analyses/{id}/concordance/query', 'post', {
      path: { id },
      body: input,
      signal,
    }),
  );
}
export async function concordanceDensity(
  base: string,
  id: string,
  input: components['schemas']['ConcordanceDensity'],
  signal?: AbortSignal,
) {
  return tableFromIPC<TypeMap>(
    new Uint8Array(
      await (
        await request(base, '/api/project/analyses/{id}/concordance/density', 'post', {
          path: { id },
          body: input,
          signal,
        })
      ).arrayBuffer(),
    ),
  );
}
export async function publishConcordance(
  base: string,
  id: string,
  projection: 'matches' | 'documents',
  sources: ConcordancePublishSource[],
) {
  return (
    await request(base, '/api/project/analyses/{id}/concordance/publish', 'post', {
      path: { id },
      body: {
        projection,
        sources,
      },
    })
  ).json();
}

export type QuotationRequest = components['schemas']['QuotationRequest'];
export type QuotationPreviewRequest = Required<components['schemas']['QuotationPreview']>;
export type QuotationAnalysisResult = AnalysisResult<components['schemas']['QuotationResultV1']>;
export type QuotationQuery = components['schemas']['QuotationQuery'];
export type QuotationPublish = components['schemas']['QuotationPublish'];
export async function getQuotationResult(
  base: string,
  id: string,
  signal?: AbortSignal,
): Promise<QuotationAnalysisResult | null> {
  const result = await (
    await request(base, '/api/project/analyses/{id}', 'get', { path: { id }, signal })
  ).json();
  if (result.kind === 'quotation' && result.result === null) return null;
  if (result.kind !== 'quotation' || result.result?.version !== 1)
    throw new Error('Unsupported Quotation result version');
  return result as QuotationAnalysisResult;
}
export async function runQuotation(
  base: string,
  id: string,
  input: QuotationRequest,
): Promise<QuotationAnalysisResult> {
  return completedAnalysis(
    await (
      await request(base, '/api/project/tabs/{id}/quotation', 'post', {
        path: { id },
        body: input,
      })
    ).json(),
    'quotation',
  );
}
export async function previewQuotation(
  base: string,
  id: string,
  input: QuotationPreviewRequest,
  signal?: AbortSignal,
) {
  return documentMatchPage(
    await request(base, '/api/project/tabs/{id}/quotation/preview', 'post', {
      path: { id },
      body: input,
      signal,
    }),
  );
}
export async function queryQuotation(
  base: string,
  id: string,
  input: QuotationQuery,
  signal?: AbortSignal,
) {
  return documentMatchPage(
    await request(base, '/api/project/analyses/{id}/quotation/query', 'post', {
      path: { id },
      body: input,
      signal,
    }),
  );
}
export async function publishQuotation(base: string, id: string, input: QuotationPublish) {
  return (
    await request(base, '/api/project/analyses/{id}/quotation/publish', 'post', {
      path: { id },
      body: input,
    })
  ).json();
}

export type PlotMode = components['schemas']['PlotMode'];
export type PlotMeasure = components['schemas']['Measure'];
export type PlotTimeUnit = components['schemas']['TimeUnit'];
export type PlotInterval = components['schemas']['Interval'];
export type TrendsRequest = Required<components['schemas']['TrendsRequest']>;
export type CompareRequest = Required<components['schemas']['CompareRequest']>;
type ScatterRequest = Required<components['schemas']['ScatterRequest']>;
type HeatmapRequest = Required<components['schemas']['HeatmapRequest']>;
type SankeyRequest = Required<components['schemas']['SankeyRequest']>;
export interface PlotRequests {
  trends: TrendsRequest;
  compare: CompareRequest;
  scatter: ScatterRequest;
  heatmap: HeatmapRequest;
  sankey: SankeyRequest;
}
export type PlotRequest = PlotRequests[PlotMode];
export type PlotAnalysis = AnalysisResult<components['schemas']['PlotResultV1']>;
export type PlotQuery = Required<components['schemas']['PlotQuery']>;
export type PlotSelection = Required<components['schemas']['PlotSelection']>;
export async function getPlotResult(
  base: string,
  id: string,
  mode: PlotMode,
  signal?: AbortSignal,
): Promise<PlotAnalysis | null> {
  const analysis = await (
    await request(base, '/api/project/analyses/{id}', 'get', { path: { id }, signal })
  ).json();
  if (analysis.kind === mode && analysis.result === null) return null;
  if (analysis.kind !== mode || analysis.result?.version !== 1)
    throw new Error('Unsupported plot result version');
  return analysis as PlotAnalysis;
}
export async function runPlot<M extends PlotMode>(
  base: string,
  id: string,
  mode: M,
  input: PlotRequests[NoInfer<M>],
): Promise<PlotAnalysis> {
  return completedAnalysis(
    await (
      await request(base, '/api/project/tabs/{id}/{mode}', 'post', {
        path: { id, mode },
        body: input,
      })
    ).json(),
    mode,
  );
}
export async function queryPlot(
  base: string,
  id: string,
  mode: PlotMode,
  input: PlotQuery,
  signal?: AbortSignal,
) {
  const response = await request(base, '/api/project/analyses/{id}/{mode}/query', 'post', {
    path: { id, mode },
    body: input,
    signal,
  });
  return tableFromIPC<TypeMap>(await response.arrayBuffer());
}
export async function publishPlot(
  base: string,
  id: string,
  mode: PlotMode,
  input: components['schemas']['PlotPublish'],
) {
  return (
    await request(base, '/api/project/analyses/{id}/{mode}/publish', 'post', {
      path: { id, mode },
      body: input,
    })
  ).json();
}
export async function plotTimezones(base: string, signal?: AbortSignal): Promise<string[]> {
  return (await request(base, '/api/project/timezones', 'get', { signal })).json();
}

export type TopicRequest = components['schemas']['TopicRequest'];
export type TopicSampling = components['schemas']['Sampling'];
export type TopicSummary = components['schemas']['PreviewSummary'];
export type TopicAnalysisResult = AnalysisResult<components['schemas']['TopicResultV1']>;
export type TopicWord = components['schemas']['RepresentativeWord'];
export type TopicBasis = Extract<components['schemas']['TopicProjection'], { projection: 'map' }>;
export type TopicWords = Extract<components['schemas']['TopicProjection'], { projection: 'words' }>;
export type TopicQuery = Exclude<components['schemas']['TopicQuery'], { projection: 'documents' }>;
export type TopicDocumentQuery = Extract<
  components['schemas']['TopicQuery'],
  { projection: 'documents' }
>;
export async function queryTopicDocuments(
  base: string,
  owner: { analysis: string } | { tab: string; preview: string },
  input: TopicDocumentQuery,
  signal?: AbortSignal,
) {
  return documentMatchPage(
    await ('analysis' in owner
      ? request(base, '/api/project/analyses/{id}/topic-modeling/query', 'post', {
          path: { id: owner.analysis },
          body: input,
          signal,
        })
      : request(base, '/api/project/tabs/{tab}/topic-modeling/preview/{id}/query', 'post', {
          path: { tab: owner.tab, id: owner.preview },
          body: input,
          signal,
        })),
  );
}
export type TopicPreviewUpdate = components['schemas']['TopicPreviewUpdate'];
export type TopicPublish = components['schemas']['TopicPublish'];
export function embeddingModels(base: string, signal?: AbortSignal) {
  return request(base, '/api/project/embedding-models', 'get', { signal }).then((r) => r.json());
}
export async function runTopicModel(
  base: string,
  id: string,
  input: TopicRequest,
): Promise<TopicAnalysisResult> {
  return completedAnalysis(
    await (
      await request(base, '/api/project/tabs/{id}/topic-modeling', 'post', {
        path: { id },
        body: input,
      })
    ).json(),
    'topic-modeling',
  );
}
export async function getTopicResult(
  base: string,
  id: string,
  signal?: AbortSignal,
): Promise<TopicAnalysisResult | null> {
  const value = (await (
    await request(base, '/api/project/analyses/{id}', 'get', { path: { id }, signal })
  ).json()) as Analysis<Partial<TopicSummary>>;
  if (value.kind === 'topic-modeling' && value.result === null) return null;
  if (
    value.kind !== 'topic-modeling' ||
    value.result?.version !== 1 ||
    !Array.isArray(value.result.payload.sources) ||
    !Number.isInteger(value.result.payload.natural_topic_count)
  )
    throw new Error(
      'This Topic Modelling result is unavailable or unsupported. Rerun to rebuild it.',
    );
  return value as TopicAnalysisResult;
}
export async function queryTopicModel(
  base: string,
  owner: { analysis: string } | { tab: string; preview: string },
  input: TopicQuery,
  signal?: AbortSignal,
): Promise<TopicBasis | TopicWords> {
  return (
    await ('analysis' in owner
      ? request(base, '/api/project/analyses/{id}/topic-modeling/query', 'post', {
          path: { id: owner.analysis },
          body: input,
          signal,
        })
      : request(base, '/api/project/tabs/{tab}/topic-modeling/preview/{id}/query', 'post', {
          path: { tab: owner.tab, id: owner.preview },
          body: input,
          signal,
        }))
  ).json();
}
export async function publishTopicModel(
  base: string,
  id: string,
  input: TopicPublish,
): Promise<ObjectRef[]> {
  return (
    await request(base, '/api/project/analyses/{id}/topic-modeling/publish', 'post', {
      path: { id },
      body: input,
    })
  ).json();
}
export async function deleteTopicPreview(base: string, tab: string, id: string) {
  await request(base, '/api/project/tabs/{tab}/topic-modeling/preview/{id}', 'delete', {
    path: { tab, id },
  });
}
/** A POST stream has no reconnection: reconnecting would silently fit a new model. */
export async function streamTopicPreview(
  base: string,
  tab: string,
  input: components['schemas']['TopicPreviewRequest'],
  signal: AbortSignal,
  onUpdate: (update: TopicPreviewUpdate) => void,
) {
  const response = await request(base, '/api/project/tabs/{id}/topic-modeling/preview', 'post', {
    path: { id: tab },
    body: input,
    signal,
  });
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Preview streaming is unavailable.');
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data || signal.aborted) continue;
        const update = JSON.parse(data) as TopicPreviewUpdate;
        if (update.state === 'failed')
          throw new ProjectError(update.error.message, JSON.stringify({ error: update.error }));
        onUpdate(update);
      }
    }
    if (!signal.aborted)
      throw new Error('The Preview connection closed. Click Preview to sample again.');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export type AiProvider = components['schemas']['Provider'];
export type AiConnection = components['schemas']['ConnectionInfo'];
export type CredentialUpdate = components['schemas']['CredentialUpdate'];
export async function aiConnections(base: string, signal?: AbortSignal): Promise<AiConnection[]> {
  return (await request(base, '/api/ai/providers', 'get', { signal })).json();
}
/** Call directly from the credential dialog; secret variables never enter a mutation cache. */
export async function saveAiConnection(
  base: string,
  id: string | null,
  input: Omit<components['schemas']['CreateConnection'], 'provider'> &
    Partial<Pick<components['schemas']['CreateConnection'], 'provider'>>,
): Promise<AiConnection> {
  if (id)
    return (
      await request(base, '/api/ai/providers/{id}', 'post', { path: { id }, body: input })
    ).json();
  if (!input.provider) throw new Error('Select a provider');
  return (
    await request(base, '/api/ai/providers', 'post', {
      body: { ...input, provider: input.provider },
    })
  ).json();
}
export async function deleteAiConnection(base: string, id: string) {
  await request(base, '/api/ai/providers/{id}', 'delete', { path: { id } });
}
export async function aiModels(base: string, id: string, signal?: AbortSignal): Promise<string[]> {
  return (
    await request(base, '/api/ai/providers/{id}/models', 'get', {
      path: { id },
      signal,
    })
  ).json();
}
export type AnnotationInference = Required<components['schemas']['Inference']>;
export type AnnotationExamples = components['schemas']['AnnotationExamples'];
export type AnnotationRequest = components['schemas']['AnnotationRequest'];
type AnnotationReport = components['schemas']['AnnotationReport'];
export interface AnnotationResult {
  id: string;
  request: unknown;
  report: AnnotationReport;
}
export type AnnotationPrediction = components['schemas']['Prediction'] | null;
export type AnnotationPreview = components['schemas']['AnnotationPreviewMetadata'] & {
  table: Table<TypeMap>;
};
export async function runAnnotation(base: string, tab: string, input: AnnotationRequest) {
  await request(base, '/api/project/tabs/{id}/annotation', 'post', {
    path: { id: tab },
    body: input,
  });
}
export async function previewAnnotation(
  base: string,
  tab: string,
  input: AnnotationRequest,
  page: number,
  page_size: number,
  signal: AbortSignal,
): Promise<AnnotationPreview> {
  const response = await request(base, '/api/project/tabs/{id}/annotation/preview', 'post', {
    path: { id: tab },
    body: { request: input, page, page_size },
    signal,
  });
  const table = tableFromIPC<TypeMap>(new Uint8Array(await response.arrayBuffer()));
  const value = JSON.parse(
    table.schema.metadata.get('wordflow:annotation-preview') ?? '{}',
  ) as Omit<AnnotationPreview, 'table'>;
  if (!Array.isArray(value.predictions))
    throw new Error('Annotation Preview metadata is unavailable');
  return { ...value, table };
}
export async function getAnnotationResult(
  base: string,
  id: string,
  signal?: AbortSignal,
): Promise<AnnotationResult | null> {
  const analysis = (await (
    await request(base, '/api/project/analyses/{id}', 'get', { path: { id }, signal })
  ).json()) as Analysis<AnnotationReport>;
  if (analysis.kind === 'annotation' && analysis.result === null) return null;
  if (analysis.kind !== 'annotation' || analysis.result?.version !== 1)
    throw new Error('Unsupported Annotation result');
  return { id: analysis.id, request: analysis.request, report: analysis.result.payload };
}
export async function annotationRows(
  base: string,
  id: string,
  page: number,
  page_size: number,
  review: AnnotationReview,
  signal?: AbortSignal,
  correction: string | null = null,
) {
  const response = await request(base, '/api/project/analyses/{id}/annotation/query', 'post', {
    path: { id },
    body: { view: 'rows', page, page_size, sorting: [], review, correction },
    signal,
  });
  const table = tableFromIPC<TypeMap>(new Uint8Array(await response.arrayBuffer()));
  return {
    table,
    summary: JSON.parse(
      table.schema.metadata.get('wordflow:annotation-review') ?? '{}',
    ) as AnnotationReviewSummary,
    live: JSON.parse(
      table.schema.metadata.get('wordflow:annotation-live') ?? '{}',
    ) as components['schemas']['AnnotationLiveMetadata'],
  };
}
export async function annotationContext(
  base: string,
  id: string,
  signal?: AbortSignal,
): Promise<components['schemas']['Context']> {
  return (
    await request(base, '/api/project/analyses/{id}/annotation/query', 'post', {
      path: { id },
      body: { view: 'context' },
      signal,
    })
  ).json();
}

export async function annotationDiagnostics(
  base: string,
  id: string,
  page: number,
  signal?: AbortSignal,
) {
  const response = await request(base, '/api/project/analyses/{id}/annotation/query', 'post', {
    path: { id },
    body: { view: 'diagnostics', page, page_size: 20 },
    signal,
  });
  return decodeArrowData(tableFromIPC<TypeMap>(new Uint8Array(await response.arrayBuffer())));
}

// Saved payloads remain unknown until the existing kind/version boundary.
type Payloads = {
  frequency: components['schemas']['FrequencyResultV1'];
  concordance: components['schemas']['ConcordanceResultV1'];
  quotation: components['schemas']['QuotationResultV1'];
  'topic-modeling': components['schemas']['TopicResultV1'];
} & Record<PlotMode, components['schemas']['PlotResultV1']>;
function completedAnalysis<K extends keyof Payloads>(
  value: components['schemas']['Analysis'],
  kind: K,
): AnalysisResult<Payloads[K]> {
  if (value.kind !== kind || value.result?.version !== 1)
    throw new Error('Unsupported analysis result version');
  return value as AnalysisResult<Payloads[K]>;
}
function tabView(value: components['schemas']['Tab']): Tab {
  const kind = value.kind;
  if (
    ![
      'frequency',
      'concordance',
      'quotation',
      'topic-modeling',
      'annotation',
      'trends',
      'compare',
      'scatter',
      'heatmap',
      'sankey',
    ].includes(kind)
  )
    throw new Error('Unsupported analysis kind');
  const settings = value.settings;
  return {
    ...value,
    kind: kind as AnalysisKind,
    settings:
      settings !== null && typeof settings === 'object' && !Array.isArray(settings)
        ? (settings as Record<string, unknown>)
        : {},
  };
}
