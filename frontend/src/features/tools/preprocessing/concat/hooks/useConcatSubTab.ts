import { useState } from 'react';
import type { ArrowColumn } from '@/lib/arrow/decodeArrowTable';
import type { NodeMetadata } from '@/features/tools/common/nodeInputs/nodeMetadata';
import type { ColumnInfo } from '@/features/project/data-view/utils/columnTypes';
import { usePreprocessingPreview } from '../../hooks/usePreprocessingPreview';
import type { ConcatPreviewRequestPayload, PreviewPagination, PreviewRow } from '../../types';

export interface ConcatSubTabProps {
  previewEnabled?: boolean;
  selectedNodeIds: string[];
  projectBase: string | null;
  projectNodes: NodeMetadata[];
  getColumnInfos: (node: NodeMetadata) => ColumnInfo[];
  concatNodes: (nodeIds: string[], newNodeName?: string, deduplicate?: boolean) => Promise<unknown>;
  concatPreview: (
    request: ConcatPreviewRequestPayload & {
      page: number;
      pageSize: number;
      signal: AbortSignal;
    },
  ) => Promise<{
    data: PreviewRow[];
    columns: string[];
    schema?: ArrowColumn[];
    pagination: PreviewPagination | null;
  }>;
  isLoading: {
    operations: boolean;
  };
  onAlert: (message: string) => void;
}

/** DuckDB owns schema alignment. This hook owns only inputs, preview and the draft. */
export function useConcatSubTab(props: ConcatSubTabProps) {
  const {
    projectBase,
    projectNodes,
    getColumnInfos,
    concatPreview,
    concatNodes,
    isLoading,
    onAlert,
  } = props;
  const [name, setName] = useState('');
  const [deduplicate, setDeduplicate] = useState(false);
  const busy = isLoading.operations;
  const names = [...new Set(props.selectedNodeIds)].filter((name) =>
    projectNodes.some((node) => node.id === name),
  );
  const nodes = names.flatMap((name) => projectNodes.filter((node) => node.id === name));
  const ready = names.length >= 2 && nodes.every((node) => getColumnInfos(node).length > 0);
  const statusMessage =
    names.length < 2
      ? 'Pick at least two Data Blocks to stack.'
      : !ready
        ? 'Loading input columns…'
        : 'Columns align by name. Missing columns become NULL; DuckDB resolves compatible types.';
  const placeholder = names.length
    ? `Stack(${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''})`
    : 'Stacked data';
  const request =
    projectBase !== null && ready ? { projectBase, nodeIds: names, deduplicate } : null;
  const preview = usePreprocessingPreview({
    request,
    enabled: props.previewEnabled !== false,
    identity: request
      ? { projectBase: request.projectBase, operation: 'stack', nodeIds: names }
      : null,
    fetcher: ({ request, page, pageSize, signal }) =>
      concatPreview({ ...request, page, pageSize, signal }),
  });
  async function run() {
    if (!ready || projectBase === null) return;
    try {
      await concatNodes(names, name.trim() || placeholder, deduplicate);
    } catch (error) {
      onAlert(error instanceof Error ? error.message : 'Could not stack Data Blocks');
    }
  }
  return {
    form: { value: name, setValue: setName, placeholder, deduplicate, setDeduplicate },
    statusMessage,
    preview: {
      ...preview,
      readyMessage: statusMessage,
      onPageChange: preview.setPage,
      onPageSizeChange: preview.setPageSize,
    },
    apply: {
      run,
      disabled: !ready || projectBase === null,
      disabledReason: ready ? undefined : statusMessage,
      isBusy: busy,
    },
    showActivityTag: busy,
  };
}
