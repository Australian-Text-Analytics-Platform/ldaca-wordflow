import { suggestColumnName } from '@/features/project/automaticNames';
import { takeMostRecent } from '@/features/project/common/utils/selectionUtils';
import type { ColumnInfo } from '@/features/project/data-view/utils/columnTypes';
import type { NodeMetadata } from '@/features/tools/common/nodeInputs/nodeMetadata';
import { useRef, useState } from 'react';
import type { OperationPreviewFetcher } from '../../hooks/useNodePreviewWithRawFallback';
import { usePreprocessingPreview } from '../../hooks/usePreprocessingPreview';
import {
  insertExpression,
  moveExpression,
  removeExpression,
  updateExpression,
} from '../expressionTree';
import {
  buildColumnRequest,
  emptyVisualBuild,
  validateBuild,
  type BuildBuilderToken,
  type BuildColumnRequest,
  type BuildDefinition,
  type BuildVisualDefinition,
} from './buildExpressionModel';

export interface BuildSubTabProps {
  previewEnabled?: boolean;
  projectBase: string | null;
  selectedNodes: NodeMetadata[];
  getColumnInfos: (node: NodeMetadata) => ColumnInfo[];
  isLoading: { operations: boolean };
  onAlert: (message: string) => void;
  buildColumnPreview: OperationPreviewFetcher<BuildColumnRequest>;
  buildColumnApply: (
    nodeId: string,
    request: BuildColumnRequest,
  ) => Promise<{ table_name: string }>;
}
interface Draft {
  visual: BuildVisualDefinition;
  sql: { expression: string } | null;
  column: string | null;
}

/** Visual authoring generates SQL once. Apply captures the complete current draft. */
export function useBuildSubTab(props: BuildSubTabProps) {
  const [activeNode] = takeMostRecent(props.selectedNodes, 1);
  const columns = activeNode ? props.getColumnInfos(activeNode) : [];
  const [draft, setDraft] = useState<Draft>(() => ({
    visual: emptyVisualBuild(),
    sql: null,
    column: null,
  }));
  const suggestedColumn = suggestColumnName(columns.map((column) => column.name));
  const column = draft.column ?? suggestedColumn;
  const latest = useRef(draft);
  const update = (change: (value: Draft) => Draft) => {
    const next = change(latest.current);
    latest.current = next;
    setDraft(next);
  };
  const updateVisual = (change: (value: BuildVisualDefinition) => BuildVisualDefinition) => {
    update((value) => ({ ...value, visual: change(value.visual) }));
  };
  const definition: BuildDefinition = draft.sql
    ? { mode: 'sql', expression: draft.sql.expression }
    : draft.visual;
  const validation = validateBuild(definition, columns);
  const payload = buildColumnRequest(definition, column);
  const configured = draft.sql !== null || draft.visual.roots.length > 0;
  const disabledReason = !activeNode
    ? 'Select an input Data Block'
    : !column.trim()
      ? 'Enter a column name'
      : (validation.error ?? undefined);
  const request =
    activeNode && props.projectBase !== null && !disabledReason
      ? { nodeId: activeNode.id, projectBase: props.projectBase, payload }
      : null;
  const preview = usePreprocessingPreview({
    request,
    identity:
      activeNode && props.projectBase !== null
        ? { projectBase: props.projectBase, operation: 'build', nodeIds: [activeNode.id] }
        : null,
    enabled: props.previewEnabled !== false,
    debounceMs: 350,
    reportError: false,
    retainLastSuccess: true,
    fetcher: ({ request: captured, page, pageSize, signal }) =>
      props.buildColumnPreview({ ...captured, page, pageSize, signal }),
  });
  function editSql() {
    if (!activeNode) return;
    update((value) => ({
      ...value,
      sql: { expression: validation.expression },
    }));
  }
  function addPart(
    part: BuildBuilderToken,
    parent: string | null = null,
    index = Number.MAX_SAFE_INTEGER,
  ) {
    updateVisual((value) => ({
      ...value,
      roots: insertExpression(value.roots, parent, index, part),
    }));
  }
  function updatePart(id: string, change: (part: BuildBuilderToken) => BuildBuilderToken) {
    updateVisual((value) => ({ ...value, roots: updateExpression(value.roots, id, change) }));
  }
  async function handleApply() {
    if (!activeNode) return;
    const captured = latest.current;
    const definition: BuildDefinition = captured.sql
      ? { mode: 'sql', expression: captured.sql.expression }
      : captured.visual;
    const capturedColumn = captured.column ?? suggestedColumn;
    if (!capturedColumn.trim() || validateBuild(definition, columns).error) return;
    const request = buildColumnRequest(definition, capturedColumn);
    const target = activeNode.id;
    try {
      await props.buildColumnApply(target, request);
      preview.refresh();
    } catch (error) {
      props.onAlert(error instanceof Error ? error.message : String(error));
    }
  }
  return {
    activeNode,
    columns,
    draft: { ...draft, column },
    updateVisual,
    updatePart,
    addPart,
    removePart: (id: string) => {
      updateVisual((value) => ({ ...value, roots: removeExpression(value.roots, id) }));
    },
    movePart: (id: string, parent: string | null, index: number) => {
      updateVisual((value) => ({
        ...value,
        roots: moveExpression(value.roots, id, parent, index),
      }));
    },
    setColumn: (column: string) => {
      update((value) => ({ ...value, column }));
    },
    setSql: (expression: string) => {
      update((value) => (value.sql ? { ...value, sql: { ...value.sql, expression } } : value));
    },
    editSql,
    startNewVisual: () => {
      update((value) => ({ ...value, visual: emptyVisualBuild(), sql: null }));
    },

    clear: () => {
      update((value) => ({ ...value, visual: emptyVisualBuild(), sql: null }));
    },
    expression: validation.expression,
    isDraft: Boolean(validation.error),
    incomplete: validation.incomplete,
    validationError: configured ? validation.error : null,
    preview,
    apply: {
      canApply: !disabledReason,
      disabledReason,
      loading: props.isLoading.operations,
      handleApply,
    },
  };
}
