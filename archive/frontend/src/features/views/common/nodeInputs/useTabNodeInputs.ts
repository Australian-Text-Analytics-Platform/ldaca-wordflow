import { useCallback, useMemo } from 'react';
import type { WorkspaceNodeInfo } from '@/api';
import { useNodeColumnInfos } from '@/features/project/common/hooks/useNodeColumnInfos';
import { useProjectData } from '@/features/project/common/hooks/useProjectData';
import {
  projectProjectNodeMetadata,
  type ProjectNodeMetadata,
} from '@/features/project/common/projectNodeMetadata';
import type { ColumnInfo } from '@/features/project/data-view/utils/columnTypes';
import { useUIStore } from '@/stores';
import { useNodeInputRequests } from './useNodeInputRequests';
import {
  type AnalysisTabInput,
  type AnalysisTabInputSets,
  DEFAULT_TAB_INPUT_SET_ID,
  getTabInputSet,
} from '../tabs/tabStateOps';
import type { NodeInput, NodeInputConstraints } from './nodeInputsCore';
import { type UseNodeInputsResult, useNodeInputs } from './useNodeInputs';

export interface UseTabNodeInputsConfig {
  /** Selector id within the active tab; defaults to the source selector. */
  selectorId?: string;
  /** All named input sets for the active tab. */
  tabInputSets?: AnalysisTabInputSets;
  /** Commit one named draft input set for the active client tab. */
  onTabInputSetChange: (selectorId: string, inputs: AnalysisTabInput[]) => void;
  /** Per-view constraints (allowed column types, max nodes, document-only). */
  constraints: NodeInputConstraints;
  /** Keep graph/sidebar add requests on the pointer when this view has multiple placement areas. */
  deferNodeInputPlacement?: boolean;
}

export interface UseTabNodeInputsResult extends UseNodeInputsResult {
  /** Current project id, for convenience. */
  projectId: string | null;
  /** Complete graph metadata for the currently selected input nodes, keyed by id. */
  nodeInfoById: Record<string, WorkspaceNodeInfo>;
  /** Returns cached typed columns for a selected input node, with snapshot fallback. */
  getColumnInfos: (node: ProjectNodeMetadata | null | undefined) => ColumnInfo[];
  /** Returns complete graph metadata for a selected input node when loaded. */
  getNodeInfo: (node: ProjectNodeMetadata | null | undefined) => WorkspaceNodeInfo | undefined;
}

export interface UseProjectNodeInputsConfig {
  value: NodeInput[];
  onChange: (inputs: NodeInput[]) => void;
  constraints: NodeInputConstraints;
  /** Keep graph/sidebar add requests carried when a view has multiple placement targets. */
  deferNodeInputPlacement?: boolean;
}

/**
 * Binds a named analysis-tab input set to {@link useNodeInputs}, wiring in the
 * live project nodes and typed column metadata.
 *
 * Used by: the tabbed analysis-style ``*Feature`` components because each needs
 * the same plumbing (tab value/onChange + live nodes + column infos + graph
 * focus) to drive {@link NodeInputsPanel} and build run requests. Keeping it
 * here keeps each feature's binding a thin call instead of repeated wiring.
 *
 * Flow: resolve the requested selector id from ``input_sets``, delegate it to
 * ``useProjectNodeInputs``, and expose the same callbacks to ``NodeInputsPanel``.
 * Single-selector views consume matching graph/sidebar requests immediately;
 * multi-selector views defer placement so the user can choose a target panel.
 */
export function useTabNodeInputs(config: UseTabNodeInputsConfig): UseTabNodeInputsResult {
  const {
    selectorId = DEFAULT_TAB_INPUT_SET_ID,
    tabInputSets,
    onTabInputSetChange,
    constraints,
    deferNodeInputPlacement = false,
  } = config;
  const value = useMemo(
    () => getTabInputSet(tabInputSets ? { input_sets: tabInputSets } : undefined, selectorId),
    [selectorId, tabInputSets],
  );
  const onChange = useCallback(
    (nextInputs: AnalysisTabInput[]) => {
      onTabInputSetChange(selectorId, nextInputs);
    },
    [selectorId, onTabInputSetChange],
  );

  return useProjectNodeInputs({
    value,
    onChange,
    constraints,
    deferNodeInputPlacement,
  });
}

/** Binds an owner-provided input list to live Project metadata and carried-input requests. */
export function useProjectNodeInputs(
  config: UseProjectNodeInputsConfig,
): UseTabNodeInputsResult {
  const { value, onChange, constraints, deferNodeInputPlacement = false } = config;
  const { nodes, currentProjectId } = useProjectData();
  const currentView = useUIStore((state) => state.currentView);

  // Typed columns for the already-selected nodes; getColumnInfos falls back to
  // the node snapshot for any node not in this query set (e.g. add candidates).
  const selectedGraphNodes = useMemo(() => {
    const ids = new Set(value.map((i) => i.node_id));
    return nodes.filter((node) => ids.has(node.id));
  }, [nodes, value]);

  const { getColumnInfos, getNodeInfo, nodeInfoById } = useNodeColumnInfos({
    projectId: currentProjectId,
    nodes: selectedGraphNodes,
  });

  const allNodes = useMemo(() => nodes.map(projectProjectNodeMetadata), [nodes]);

  const result = useNodeInputs({
    value,
    onChange,
    allNodes,
    constraints,
    getColumnInfos,
  });
  const { addNodes } = result;

  useNodeInputRequests({
    scopeId: currentProjectId,
    view: currentView,
    addNodes,
    deferPlacement: deferNodeInputPlacement,
  });

  return {
    ...result,
    projectId: currentProjectId ?? null,
    nodeInfoById,
    getColumnInfos,
    getNodeInfo,
  };
}
