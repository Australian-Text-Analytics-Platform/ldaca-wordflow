import type { ArrowColumn } from '@/lib/arrow/decodeArrowTable';
import { previewSql } from '../projectPreprocessing';
import { table } from '../sql';
import type { PreviewPagination, PreviewRow } from '../types';
import {
  usePreprocessingPreview,
  type UsePreprocessingPreviewResult,
} from './usePreprocessingPreview';

interface OperationPreviewResult {
  data: PreviewRow[];
  columns: string[];
  schema?: ArrowColumn[];
  pagination: PreviewPagination;
}

interface PreviewRequest<P> {
  projectBase: string;
  nodeId: string;
  payload: P | null;
}

export type OperationPreviewFetcher<P> = (params: {
  projectBase: string;
  nodeId: string;
  payload: P;
  page: number;
  pageSize: number;
  signal: AbortSignal;
}) => Promise<OperationPreviewResult>;

export interface UseNodePreviewWithRawFallbackOptions<P> {
  /** Owning project connection, or null when unavailable. */
  projectBase: string | null;
  /** Currently-active node id, or null if no selection. */
  nodeId: string | null;
  /**
   * The operation-specific payload. When `null`, the hook falls back to
   * a source SELECT so the user sees rows even before they have
   * configured a valid operation.
   */
  operationPayload: P | null;
  /** Operation SQL preview callback. */
  operationFetch: OperationPreviewFetcher<P>;
  /** Operation name stored in the structured preview identity. */
  operation: string;
  /** When false (e.g. no node selected), the hook stays idle. */
  enabled?: boolean;
  /** Optional override for the debounce delay (default 600ms). */
  debounceMs?: number;
}

/**
 * Standardises the "operation preview, with raw-data fallback when the
 * payload is incomplete" pattern that every preprocessing sub-tab implements.
 *
 * Used by Filter, Build, Find, and Sample hooks that can
 * preview either an operation or the raw selected node.
 * Flow: call preprocessing preview first, fall back to raw node preview when no request is
 * ready, and expose one preview state shape to callers.
 */
export const useNodePreviewWithRawFallback = <P>(
  opts: UseNodePreviewWithRawFallbackOptions<P>,
): UsePreprocessingPreviewResult => {
  const {
    projectBase,
    nodeId,
    operationPayload,
    operationFetch,
    operation,
    enabled = true,
    debounceMs,
  } = opts;

  const request: PreviewRequest<P> | null =
    enabled && projectBase !== null && nodeId
      ? { projectBase, nodeId, payload: operationPayload }
      : null;

  return usePreprocessingPreview<PreviewRequest<P>>({
    request,
    identity: request
      ? {
          projectBase: request.projectBase,
          operation,
          nodeIds: [request.nodeId],
        }
      : null,
    debounceMs,
    // Routes complete operation payloads to the operation preview endpoint and
    // incomplete ones to raw node data so users always have rows to inspect.
    // Invoked by usePreprocessingPreview after debounce/cancellation setup.
    fetcher: async ({ request: req, page, pageSize, signal }) => {
      if (req.payload) {
        return operationFetch({
          projectBase: req.projectBase,
          nodeId: req.nodeId,
          payload: req.payload,
          page,
          pageSize,
          signal,
        });
      }
      return previewSql(
        req.projectBase,
        `SELECT * FROM ${table(req.nodeId)}`,
        page,
        pageSize,
        signal,
      );
    },
  });
};
