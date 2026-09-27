import { useState } from 'react';
import type { NodeInput } from '@/features/tools/common/nodeInputs/nodeInputsCore';
import { previewSql } from '../../projectPreprocessing';
import { joinSelect } from '../../sql';
import { usePreprocessingPreview } from '../../hooks/usePreprocessingPreview';
import type { JoinType } from '../../types';

export interface JoinSubTabProps {
  previewEnabled?: boolean;
  left: NodeInput | null;
  right: NodeInput | null;
  projectBase: string | null;
  joinNodes: (
    left: string,
    right: string,
    kind: JoinType,
    leftColumns: string[],
    rightColumns: string[],
    name?: string,
  ) => Promise<unknown>;
  isLoading: { operations: boolean };
  onAlert: (message: string) => void;
}

/** Left/right inputs are independent roles, including when both use the same Data Block. */
export function useJoinSubTab({
  left,
  right,
  projectBase,
  joinNodes,
  isLoading,
  onAlert,
  previewEnabled = true,
}: JoinSubTabProps) {
  const [joinType, setJoinType] = useState<JoinType>('left');
  const [joinNewNodeName, setJoinNewNodeName] = useState('');
  const needsColumns = joinType !== 'cross';
  const ready = Boolean(left && right && (!needsColumns || (left.column && right.column)));
  const request =
    ready && left && right && projectBase !== null
      ? { projectBase, left: { ...left }, right: { ...right }, kind: joinType }
      : null;
  const result = usePreprocessingPreview({
    request,
    identity:
      projectBase !== null
        ? { projectBase, operation: 'join', nodeIds: [left?.node_id ?? '', right?.node_id ?? ''] }
        : null,
    enabled: previewEnabled,
    fetcher: ({ request, page, pageSize, signal }) =>
      previewSql(
        request.projectBase,
        joinSelect(
          request.left.node_id,
          request.right.node_id,
          request.kind,
          request.left.column ?? undefined,
          request.right.column ?? undefined,
        ),
        page,
        pageSize,
        signal,
      ),
  });
  const defaultName =
    left && right ? `${left.node_id}_${joinType}_join_${right.node_id}`.replace(/\s+/g, '_') : '';
  const disabledReason =
    !left || !right
      ? 'Choose a left and right Data Block.'
      : !ready
        ? 'Choose both join columns.'
        : undefined;
  return {
    joinType,
    setJoinType,
    joinNewNodeName,
    setJoinNewNodeName,
    joinNamePlaceholder: defaultName || 'joined_data',
    showActivityTag: isLoading.operations || result.loading,
    preview: {
      ...result,
      readyMessage: disabledReason ?? 'Configure the join to preview results.',
      onPageChange: result.setPage,
      onPageSizeChange: result.setPageSize,
    },
    apply: {
      disabled: !request,
      disabledReason,
      isBusy: isLoading.operations,
      run: async () => {
        if (!request) return;
        // Capture both roles and the destination before any asynchronous work.
        const name = joinNewNodeName.trim() || defaultName;
        try {
          await joinNodes(
            request.left.node_id,
            request.right.node_id,
            request.kind,
            needsColumns && request.left.column ? [request.left.column] : [],
            needsColumns && request.right.column ? [request.right.column] : [],
            name,
          );
        } catch (error) {
          onAlert(error instanceof Error ? error.message : String(error));
        }
      },
    },
  };
}
