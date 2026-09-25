import {
  executeWorkspaceSql,
  getNodeSchema,
  previewFile,
  previewNodeCreation,
  previewNodeEdit,
  queryConcordanceDocumentProjection,
  queryQuotationPreviewTable as queryQuotationPreviewTableRequest,
  type ConcordanceDocumentProjectionQuery,
  type QuotationPreviewQuery,
  type WorkspaceNodeInfo,
  type WorkspaceSqlCreateRequest,
  type WorkspaceSqlQueryRequest,
} from './generated';
import {
  decodeArrowPage,
  decodeArrowTable,
  type ArrowTableData,
  type ArrowTablePage,
} from '@/lib/arrow/arrowTable';

const ARROW_STREAM_MEDIA_TYPE = 'application/vnd.apache.arrow.stream';
const JSON_MEDIA_TYPE = 'application/json';

const responseMediaType = (response: Response): string | undefined =>
  response.headers.get('Content-Type')?.split(';', 1)[0];

export async function queryWorkspaceSqlTable(options: {
  baseUrl?: string;
  path: { workspace_id: string };
  body: WorkspaceSqlQueryRequest & { mode: 'query' };
  signal?: AbortSignal;
}): Promise<ArrowTablePage> {
  const { data, response } = await executeWorkspaceSql({ ...options, throwOnError: true });
  const contentType = responseMediaType(response);
  if (contentType !== ARROW_STREAM_MEDIA_TYPE) {
    throw new Error(
      `Expected ${ARROW_STREAM_MEDIA_TYPE}, received ${contentType ?? 'no content type'}`,
    );
  }
  if (!(data instanceof Blob) && !(data instanceof ArrayBuffer)) {
    throw new Error('Project SQL query did not return Arrow IPC');
  }
  return decodeArrowPage(data, response);
}

export async function queryConcordanceDocumentProjectionTable(options: {
  baseUrl?: string;
  path: { workspace_id: string; analysis_id: string; table_id: string };
  body: ConcordanceDocumentProjectionQuery;
  signal?: AbortSignal;
}): Promise<ArrowTablePage> {
  const { data, response } = await queryConcordanceDocumentProjection({
    ...options,
    throwOnError: true,
  });
  const contentType = responseMediaType(response);
  if (contentType !== ARROW_STREAM_MEDIA_TYPE) {
    throw new Error(
      `Expected ${ARROW_STREAM_MEDIA_TYPE}, received ${contentType ?? 'no content type'}`,
    );
  }
  const payload: unknown = data;
  if (!(payload instanceof Blob) && !(payload instanceof ArrayBuffer)) {
    throw new Error('Concordance document projection did not return Arrow IPC');
  }
  return decodeArrowPage(payload, response);
}

export async function queryQuotationPreviewArrowTable(options: {
  baseUrl?: string;
  path: { workspace_id: string; analysis_id: string };
  body: QuotationPreviewQuery;
  signal?: AbortSignal;
}): Promise<ArrowTablePage> {
  const { data, response } = await queryQuotationPreviewTableRequest({
    ...options,
    throwOnError: true,
  });
  const contentType = responseMediaType(response);
  if (contentType !== ARROW_STREAM_MEDIA_TYPE) {
    throw new Error(
      `Expected ${ARROW_STREAM_MEDIA_TYPE}, received ${contentType ?? 'no content type'}`,
    );
  }
  const payload: unknown = data;
  if (!(payload instanceof Blob) && !(payload instanceof ArrayBuffer)) {
    throw new Error('Quotation Preview did not return Arrow IPC');
  }
  return decodeArrowPage(payload, response);
}

export async function createWorkspaceSqlDataBlock(options: {
  baseUrl?: string;
  path: { workspace_id: string };
  body: WorkspaceSqlCreateRequest & { mode: 'create' };
  signal?: AbortSignal;
}): Promise<WorkspaceNodeInfo> {
  const { data, response } = await executeWorkspaceSql({ ...options, throwOnError: true });
  const contentType = responseMediaType(response);
  if (contentType !== JSON_MEDIA_TYPE) {
    throw new Error(`Expected ${JSON_MEDIA_TYPE}, received ${contentType ?? 'no content type'}`);
  }
  const resource: unknown = data;
  if (!resource || typeof resource !== 'object' || !('id' in resource)) {
    throw new Error('Project SQL creation did not return a Data Block resource');
  }
  return resource as WorkspaceNodeInfo;
}

export async function getNodeSchemaTable(
  options: Parameters<typeof getNodeSchema>[0],
): Promise<ArrowTableData> {
  const { data } = await getNodeSchema({ ...options, throwOnError: true });
  return decodeArrowTable(data);
}

export async function previewFileTable(
  options: Parameters<typeof previewFile>[0],
): Promise<ArrowTablePage> {
  const { data, response } = await previewFile({ ...options, throwOnError: true });
  return decodeArrowPage(data, response);
}

/** One previewed page of a Data Block Edit and how many rows it changes. */
export interface EditPreviewPage extends ArrowTablePage {
  /** Rows the edit changes across the whole Data Block. */
  changedRows: number | null;
}

/** Previews a Data Block Edit without applying it (issue 143). */
export async function previewNodeEditTable(
  options: Parameters<typeof previewNodeEdit>[0],
): Promise<EditPreviewPage> {
  const { data, response } = await previewNodeEdit({ ...options, throwOnError: true });
  const raw = response.headers.get('X-Wordflow-Changed-Rows');
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10);
  return {
    ...(await decodeArrowPage(data, response)),
    changedRows: Number.isFinite(parsed) && parsed >= 0 ? parsed : null,
  };
}

export async function previewNodeCreationTable(
  options: Parameters<typeof previewNodeCreation>[0],
): Promise<ArrowTablePage> {
  const { data, response } = await previewNodeCreation({ ...options, throwOnError: true });
  return decodeArrowPage(data, response);
}
