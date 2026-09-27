import { useState } from 'react';

import type { NodeMetadata } from '@/features/tools/common/nodeInputs/nodeMetadata';
import { takeMostRecent } from '@/features/project/common/utils/selectionUtils';
import type { ColumnInfo } from '@/features/project/data-view/utils/columnTypes';
import {
  useNodePreviewWithRawFallback,
  type OperationPreviewFetcher,
} from '../../hooks/useNodePreviewWithRawFallback';
import {
  buildReplaceRequest,
  resolveReplaceOutputColumnName,
  type ReplaceMode,
  type ReplaceRequestDraft,
} from './replaceRequestModel';
import type { ReplaceRequest } from './replaceRequestModel';
import { isArrowStringField } from '@/lib/arrow/decodeArrowTable';

export interface ReplaceSubTabProps {
  previewEnabled?: boolean;
  projectBase: string | null;
  selectedColumn?: string;
  selectedNodes: NodeMetadata[];
  getColumnInfos: (node: NodeMetadata) => ColumnInfo[];
  isLoading: {
    operations: boolean;
  };
  onAlert: (message: string) => void;
  replaceTextPreview: OperationPreviewFetcher<ReplaceRequest>;
  replaceText: (nodeId: string, request: ReplaceRequest) => Promise<{ table_name: string }>;
}

/**
 * Owns regex replace/extract state for the Find sub-tab. The component consumes
 * this hook for string-column selection, preview data, and apply controls.
 * Used by `ReplaceSubTab` to own replacement draft, preview, and apply state.
 * Flow: manage find/replace form state, build replacement request payloads, request preview
 * data, and apply/refresh the output node.
 */
export const useReplaceSubTab = (props: ReplaceSubTabProps) => {
  const {
    projectBase,
    selectedColumn: inputSelectedColumn = '',
    selectedNodes,
    isLoading,
    onAlert,
    replaceTextPreview,
    replaceText,
  } = props;

  const effectiveNodes = takeMostRecent(selectedNodes, 1);

  const activeNode = effectiveNodes[0] ?? null;
  const activeNodeId = activeNode?.id ?? null;
  const stringColumns = activeNode
    ? props
        .getColumnInfos(activeNode)
        .filter((column) => isArrowStringField(column.field))
        .map((column) => column.name)
    : [];
  const firstStringColumn = stringColumns[0] ?? '';

  const selectedColumn =
    activeNodeId && stringColumns.includes(inputSelectedColumn)
      ? inputSelectedColumn
      : firstStringColumn;
  const [mode, setMode] = useState<ReplaceMode>('replace');
  const [n, setN] = useState<number | null>(null);
  const [pattern, setPattern] = useState('');
  const [replacement, setReplacement] = useState('');
  const [connector, setConnector] = useState('');
  const [outputColumnName, setOutputColumnName] = useState('');
  const applyLoading = isLoading.operations;

  const replaceDraft: ReplaceRequestDraft = {
    selectedColumn,
    pattern,
    replacement,
    outputColumnName,
    mode,
    n,
    connector,
  };

  const previewColumnName = resolveReplaceOutputColumnName(replaceDraft);

  const hasSelection = Boolean(activeNodeId);
  const operationPayload = buildReplaceRequest(replaceDraft);

  const {
    data: previewData,
    columns: previewColumns,
    schema: previewSchema,
    pagination: previewPagination,
    loading: previewLoading,
    error: previewError,
    page: previewPage,
    pageSize: previewPageSize,
    setPage: setPreviewPage,
    setPageSize: setPreviewPageSize,
  } = useNodePreviewWithRawFallback<ReplaceRequest>({
    projectBase,
    nodeId: activeNodeId,
    operationPayload,
    operationFetch: replaceTextPreview,
    operation: 'find',
    enabled: hasSelection && props.previewEnabled !== false,
  });

  const controlsDisabled = !hasSelection;
  const canApply = Boolean(activeNodeId && selectedColumn && pattern.length > 0);
  const resolvedOutputColumnName = previewColumnName;

  const applyDisabledReason: string | undefined = (() => {
    if (!hasSelection) return 'Select a data block first';
    if (!selectedColumn) return 'No string column available in this data block';
    if (!pattern) return 'Enter a regex pattern first';
    return undefined;
  })();

  /**
   * Applies the replace/extract operation to the selected node and refreshes
   * schema so output-column changes are visible to downstream tools.
   * Returned to `ReplaceSubTab` as the Apply button action.
   * Steps: guard required inputs, capture the request, and delegate the mutation and
   * refresh while retaining the draft on success or failure.
   */
  const handleApply = async () => {
    const request = buildReplaceRequest(replaceDraft);
    if (!activeNodeId || !request) return;
    try {
      await replaceText(activeNodeId, request);
    } catch (error) {
      onAlert(error instanceof Error ? error.message : String(error));
    }
  };

  const previewReadyMessage = !hasSelection
    ? 'Select a data block to configure a find operation.'
    : 'Showing original data. Configure a pattern to preview find results.';

  return {
    activeNodeId,
    hasSelection,
    effectiveNodes,
    stringColumns,
    selectedColumn,
    mode,
    setMode,
    n,
    setN,
    pattern,
    setPattern,
    replacement,
    setReplacement,
    connector,
    setConnector,
    outputColumnName,
    setOutputColumnName,
    previewColumnName,
    resolvedOutputColumnName,
    controlsDisabled,
    canApply,
    applyDisabledReason,
    applyLoading,
    handleApply,
    preview: {
      data: previewData,
      columns: previewColumns,
      schema: previewSchema,
      pagination: previewPagination,
      loading: previewLoading,
      error: previewError,
      ready: hasSelection,
      readyMessage: previewReadyMessage,
      page: previewPage,
      pageSize: previewPageSize,
      setPageSize: setPreviewPageSize,
      onPageChange: setPreviewPage,
    },
  };
};
