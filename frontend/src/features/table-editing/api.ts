import { request } from '@/api/client';
import type { components } from '@/api/generated/native';
import { type DataTarget, objectRef } from '@/features/project/objects';
import { type AnnotationReview } from '@/features/tools/annotation/api';

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
