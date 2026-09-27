import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { parseExpression } from '@/features/project/api';
import { parsedBuildExpression } from '../parseBuildExpression';
import {
  insertExpression,
  moveExpression,
  removeExpression,
  updateExpression,
} from '../expressionTree';
import type { NodeMetadata } from '@/features/tools/common/nodeInputs/nodeMetadata';
import type { ColumnInfo } from '@/features/project/data-view/utils/columnTypes';
import { takeMostRecent } from '@/features/project/common/utils/selectionUtils';
import { usePreprocessingPreview } from '../../hooks/usePreprocessingPreview';
import type { OperationPreviewFetcher } from '../../hooks/useNodePreviewWithRawFallback';
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
  column: string;
}

/** One expression with visual and SQL representations. Apply captures the complete draft. */
export function useBuildSubTab(props: BuildSubTabProps) {
  const [activeNode] = takeMostRecent(props.selectedNodes, 1);
  const columns = activeNode ? props.getColumnInfos(activeNode) : [];
  const [draft, setDraft] = useState<Draft>(() => ({
    visual: emptyVisualBuild(),
    sql: null,
    column: 'new_column',
  }));
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
  const payload = buildColumnRequest(definition, draft.column);
  const configured = draft.sql !== null || draft.visual.roots.length > 0;
  const disabledReason = !activeNode
    ? 'Select an input Data Block'
    : !draft.column.trim()
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
  const parsing = useRef<AbortController | null>(null);
  useEffect(() => () => parsing.current?.abort(), []);
  const parse = useMutation({
    meta: { reportError: false }, // The builder displays this error beside the SQL draft.
    mutationFn: async () => {
      const expression = latest.current.sql?.expression;
      if (expression === undefined || props.projectBase === null) return;
      parsing.current?.abort();
      const controller = new AbortController();
      parsing.current = controller;
      try {
        const result = await parseExpression(props.projectBase, expression, controller.signal);
        if (controller.signal.aborted || latest.current.sql?.expression !== expression) return;
        const root = parsedBuildExpression(result, columns);
        update((value) => ({ ...value, visual: { mode: 'visual', roots: [root] }, sql: null }));
      } catch (error) {
        if (controller.signal.aborted || latest.current.sql?.expression !== expression) return;
        throw error;
      }
    },
  });
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
    if (!captured.column.trim() || validateBuild(definition, columns).error) return;
    const request = buildColumnRequest(definition, captured.column);
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
    draft,
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
      parsing.current?.abort();
      parse.reset();
      update((value) => (value.sql ? { ...value, sql: { ...value.sql, expression } } : value));
    },
    editSql,
    returnToBuilder: () => {
      parse.mutate();
    },
    parsing: parse.isPending,
    parseError: parse.error?.name === 'AbortError' ? null : parse.error?.message,

    clear: () => {
      parsing.current?.abort();
      parse.reset();
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
