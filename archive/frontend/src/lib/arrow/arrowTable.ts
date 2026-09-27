export * from './decodeArrowTable';
import {
  decodeArrowTable,
  decodeArrowPage,
  type ArrowTableData,
  type ArrowTablePage,
} from './decodeArrowTable';
import { getApiBase } from '@/lib/backend/env';
import { parseApiErrorResponse } from '@/lib/apiError';
const ARROW_STREAM_MEDIA_TYPE = 'application/vnd.apache.arrow.stream';
export const fetchArrowTable = async (url: string): Promise<ArrowTableData> => {
  const requestUrl = new URL(url, `${getApiBase()}/`).toString();
  const response = await fetch(requestUrl, { credentials: 'include' });
  if (!response.ok) {
    throw await parseApiErrorResponse(response, {
      fallbackMessage: `Arrow table request failed (${String(response.status)})`,
    });
  }
  const contentType = response.headers.get('Content-Type')?.split(';', 1)[0];
  if (contentType !== ARROW_STREAM_MEDIA_TYPE) {
    throw new Error(
      `Expected ${ARROW_STREAM_MEDIA_TYPE}, received ${contentType ?? 'no content type'}`,
    );
  }
  return decodeArrowTable(await response.arrayBuffer());
};

export interface ArrowPageRequest {
  page: number;
  pageSize: number;
  sortBy: string | null;
  descending: boolean;
}

/** Fetches one immutable paged Arrow Result table projection. */
export const fetchArrowTablePage = async (
  url: string,
  request: ArrowPageRequest,
): Promise<ArrowTablePage> => {
  const requestUrl = new URL(url, `${getApiBase()}/`);
  requestUrl.searchParams.set('page', String(request.page));
  requestUrl.searchParams.set('page_size', String(request.pageSize));
  if (request.sortBy) requestUrl.searchParams.set('sort_by', request.sortBy);
  requestUrl.searchParams.set('descending', String(request.descending));
  const response = await fetch(requestUrl, { credentials: 'include' });
  if (!response.ok) {
    throw await parseApiErrorResponse(response, {
      fallbackMessage: `Arrow table page request failed (${String(response.status)})`,
    });
  }
  const contentType = response.headers.get('Content-Type')?.split(';', 1)[0];
  if (contentType !== ARROW_STREAM_MEDIA_TYPE) {
    throw new Error(
      `Expected ${ARROW_STREAM_MEDIA_TYPE}, received ${contentType ?? 'no content type'}`,
    );
  }
  return decodeArrowPage(await response.arrayBuffer(), response);
};
