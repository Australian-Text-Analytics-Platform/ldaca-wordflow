import { request } from '@/api/client';
import type { components } from '@/api/generated/native';
import { objectRef, type DataTarget, type ObjectRef } from '@/features/project/objects';
import type { ChangeScope } from '@/features/project/projectChanges';
import { tableFromIPC, type Table, type TypeMap } from 'apache-arrow';
import { reconcileProjectRenames } from './reconcileRenames';

export type Project = components['schemas']['ProjectInfo'];

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
  const response = await (typeof name === 'string'
    ? request(base, '/api/project/nodes/{table_name}/rename', 'post', {
        path: { table_name: name },
        body: { name: next },
      })
    : request(base, '/api/project/objects/{schema}/{table_name}/rename', 'post', {
        path: { schema: objectRef(name).schema, table_name: name.name },
        body: { name: next },
      }));
  const result: components['schemas']['TableName'] = await response.json();
  reconcileProjectRenames(
    base,
    [{ type: 'table', source: objectRef(name), name: result.table_name }],
    response.headers.get('x-wordflow-change-id'),
  );
  return result;
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
  const response = await (typeof target === 'string'
    ? request(base, '/api/project/nodes/{table_name}/columns', 'post', {
        path: { table_name: target },
        body: change,
      })
    : request(base, '/api/project/objects/{schema}/{table_name}/columns', 'post', {
        path: { schema: objectRef(target).schema, table_name: target.name },
        body: change,
      }));
  if (change.operation === 'rename')
    reconcileProjectRenames(
      base,
      [
        {
          type: 'column',
          source: objectRef(target),
          before: change.column,
          after: change.name.trim(),
        },
      ],
      response.headers.get('x-wordflow-change-id'),
    );
}

export type ColumnMapping = components['schemas']['ColumnMapping'];

export async function createView(
  base: string,
  input: components['schemas']['CreateView'],
): Promise<components['schemas']['TableName']> {
  return (await request(base, '/api/project/views', 'post', { body: input })).json();
}
