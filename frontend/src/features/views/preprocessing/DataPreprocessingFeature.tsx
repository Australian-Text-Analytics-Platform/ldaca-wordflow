import { CopyMinus, Filter, Layers, Merge, Scissors, Shuffle, Sigma, Split } from 'lucide-react';
import { useState } from 'react';
import InfoIcon from '@/components/help/InfoIcon';
import { type EditorTabItem, EditorTabs } from '@/components/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useGuidance } from '@/features/guidance/GuidanceContext';
import { CONTEXTUAL_HINT_IDS } from '@/features/guidance/registry';
import { useProgressiveContextualHints } from '@/features/guidance/useProgressiveContextualHints';
import { NodeInputsPanel } from '@/features/views/common/components/NodeInputsPanel';
import type { NodeSelectionRenderArgs } from '@/features/views/common/components/NodeSelectionList';
import { useWorkspaceNodeInputs } from '@/features/views/common/nodeInputs';
import { useWorkspaceActions } from '@/features/workspace/common/hooks/useWorkspaceActions';
import { useWorkspaceData } from '@/features/workspace/common/hooks/useWorkspaceData';
import { useWorkspaceStatus } from '@/features/workspace/common/hooks/useWorkspaceStatus';
import { useAuthStore } from '@/stores/authStore';
import {
  preprocessingInputsKey,
  usePreprocessingInputsStore,
} from '@/stores/preprocessingInputsStore';
import { columnKind, type BuilderInput } from './builder/builderTypes';
import { ConcatSubTab } from './concat/ConcatSubTab';
import { DedupeSubTab } from './dedupe/DedupeSubTab';
import { SegmentSubTab } from './segment/SegmentSubTab';
import { SplitByGroupSubTab } from './split-group/SplitByGroupSubTab';
import { GroupSummarySubTab } from './summarise/GroupSummarySubTab';
import { FilterSubTab } from './filter/FilterSubTab';
import { JoinSubTab } from './join/JoinSubTab';
import { SliceSubTab } from './slice/SliceSubTab';
import { MAX_CONCAT_NODES, MAX_JOIN_NODES } from './types';

type DataPrepSubtab =
  | 'filter'
  | 'slice'
  | 'join'
  | 'concat'
  | 'segment'
  | 'split_group'
  | 'summarise'
  | 'dedupe';

/** Data Builder tools that read the inputs panel's text column (issues 148, 150, 151). */
const TEXT_COLUMN_TABS: ReadonlySet<DataPrepSubtab> = new Set(['segment', 'summarise', 'dedupe']);

const PREPROCESSING_TABS: EditorTabItem[] = [
  {
    id: 'filter',
    title: 'Filter',
    icon: <Filter className="size-4" />,
    tabDomId: 'preprocessing-tab-filter',
    panelDomId: 'preprocessing-panel-filter',
    'data-guidance': 'preprocessing-operation-filter',
  },
  {
    id: 'slice',
    title: 'Sample',
    icon: <Shuffle className="size-4" />,
    tabDomId: 'preprocessing-tab-slice',
    panelDomId: 'preprocessing-panel-slice',
    'data-guidance': 'preprocessing-operation-sample',
  },
  {
    id: 'join',
    title: 'Join',
    icon: <Merge className="size-4" />,
    tabDomId: 'preprocessing-tab-join',
    panelDomId: 'preprocessing-panel-join',
    'data-guidance': 'preprocessing-operation-join',
  },
  {
    id: 'concat',
    title: 'Stack',
    icon: <Layers className="size-4" />,
    tabDomId: 'preprocessing-tab-concat',
    panelDomId: 'preprocessing-panel-concat',
    'data-guidance': 'preprocessing-operation-stack',
  },
  {
    id: 'segment',
    title: 'Segment',
    icon: <Scissors className="size-4" />,
    tabDomId: 'preprocessing-tab-segment',
    panelDomId: 'preprocessing-panel-segment',
  },
  {
    id: 'split_group',
    title: 'Split by group',
    icon: <Split className="size-4" />,
    tabDomId: 'preprocessing-tab-split-group',
    panelDomId: 'preprocessing-panel-split-group',
  },
  {
    id: 'summarise',
    title: 'Group & summarise',
    icon: <Sigma className="size-4" />,
    tabDomId: 'preprocessing-tab-summarise',
    panelDomId: 'preprocessing-panel-summarise',
  },
  {
    id: 'dedupe',
    title: 'Remove duplicates',
    icon: <CopyMinus className="size-4" />,
    tabDomId: 'preprocessing-tab-dedupe',
    panelDomId: 'preprocessing-panel-dedupe',
  },
];

const EMPTY_PREPROCESSING_INPUTS: [] = [];

// Hosts preprocessing subtabs and passes the active input node context into each tool.
/**
 * Rendered by: the analysis feature registry when this panel is selected.
 * Flow: read workspace/auth state, derive inputs and analysis parameters,
 * and render the active preprocessing subtab. Each tool has a fixed result
 * destination: row-changing tools create derived Data Blocks, column tools
 * edit the selected Data Block in place.
 */
function DataPreprocessingFeature() {
  const { reachContextualHint } = useGuidance();
  const { currentWorkspaceId } = useWorkspaceData();
  const userId = useAuthStore((state) => state.session?.user?.id ?? '__anonymous__');
  const {
    filterNode,
    filterPreview,
    joinNodes,
    concatNodes,
    concatPreview,
    sliceNode,
    slicePreview,
  } = useWorkspaceActions();
  const { isLoading } = useWorkspaceStatus();

  const [activeSubtab, setActiveSubtab] = useState<DataPrepSubtab>('filter');
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const preprocessingInputKey = preprocessingInputsKey(userId, currentWorkspaceId, activeSubtab);
  const persistedInputs = usePreprocessingInputsStore(
    (state) => state.byKey[preprocessingInputKey] ?? EMPTY_PREPROCESSING_INPUTS,
  );
  const setPersistedInputs = usePreprocessingInputsStore((state) => state.setInputs);
  const maxInputNodes =
    activeSubtab === 'join' ? MAX_JOIN_NODES : activeSubtab === 'concat' ? MAX_CONCAT_NODES : 1;
  const nodeInputs = useWorkspaceNodeInputs({
    value: persistedInputs,
    onChange: (inputs) => {
      if (!currentWorkspaceId) return;
      setPersistedInputs(userId, currentWorkspaceId, activeSubtab, inputs);
    },
    constraints: {
      maxNodes: maxInputNodes,
    },
  });
  const selectedNodes = nodeInputs.selectedNodes;
  const workspaceNodes = [...selectedNodes, ...nodeInputs.availableNodes];
  const selectedNode = selectedNodes[0] ?? null;
  const selectedNodeIds = nodeInputs.resolvedNodes.map((node) => node.id);
  const selectedNodeId = selectedNodeIds[0] ?? null;
  const selectedNodeColumnOptions = nodeInputs.resolvedNodes[0]?.columnOptions ?? [];
  const selectedNodeColumns = Object.fromEntries(
    nodeInputs.resolvedNodes.map((node) => [node.id, node.column]),
  );
  const setSelectedJoinColumns = (columns: Record<string, string>) => {
    if (!currentWorkspaceId) return;
    setPersistedInputs(
      userId,
      currentWorkspaceId,
      'join',
      persistedInputs.map((input) => {
        const column = columns[input.node_id];
        return column === undefined ? input : { ...input, column };
      }),
    );
  };
  const showInputColumnPicker = activeSubtab === 'join' || TEXT_COLUMN_TABS.has(activeSubtab);
  const resolvedInput = nodeInputs.resolvedNodes[0];
  const builderInput: BuilderInput | null = resolvedInput
    ? {
        id: resolvedInput.id,
        name: resolvedInput.name,
        column: resolvedInput.column,
        columns: resolvedInput.columnOptions.map((option) => ({
          name: option.name,
          kind: columnKind(option.field),
        })),
      }
    : null;
  const preprocessingColumnLabel = ({ nodeId }: NodeSelectionRenderArgs) => {
    if (activeSubtab === 'join') {
      if (nodeId === selectedNodeIds[0]) return 'Left column:';
      if (nodeId === selectedNodeIds[1]) return 'Right column:';
      return 'Join column:';
    }
    // Remove duplicates always compares this column (issue 158).
    if (activeSubtab === 'dedupe') return 'Deduplicating column:';
    return 'Text column:';
  };

  // Gives child subtabs one shared alert surface for validation and backend errors.
  /**
   * Passed to preprocessing sub-tabs as the shared alert callback.
   */
  const handleAlert = (message: string) => {
    setAlertMessage(message);
    setAlertOpen(true);
  };

  const reachApplyOutcome = () => {
    reachContextualHint(CONTEXTUAL_HINT_IDS.preprocessing.createOutcome);
  };
  const guidedFilterPreview = async (...args: Parameters<typeof filterPreview>) => {
    const response = await filterPreview(...args);
    reachContextualHint(CONTEXTUAL_HINT_IDS.preprocessing.preview);
    return response;
  };
  const guidedFilterNode = async (...args: Parameters<typeof filterNode>) => {
    const response = await filterNode(...args);
    reachApplyOutcome();
    return response;
  };
  const guidedSlicePreview = async (...args: Parameters<typeof slicePreview>) => {
    const response = await slicePreview(...args);
    reachContextualHint(CONTEXTUAL_HINT_IDS.preprocessing.preview);
    return response;
  };
  const guidedSliceNode = async (...args: Parameters<typeof sliceNode>) => {
    const response = await sliceNode(...args);
    reachApplyOutcome();
    return response;
  };
  const guidedJoinNodes = async (...args: Parameters<typeof joinNodes>) => {
    const response = await joinNodes(...args);
    reachApplyOutcome();
    return response;
  };
  const guidedConcatPreview = async (...args: Parameters<typeof concatPreview>) => {
    const response = await concatPreview(...args);
    reachContextualHint(CONTEXTUAL_HINT_IDS.preprocessing.preview);
    return response;
  };
  const guidedConcatNodes = async (...args: Parameters<typeof concatNodes>) => {
    const response = await concatNodes(...args);
    reachApplyOutcome();
    return response;
  };
  const operationReady =
    activeSubtab === 'join'
      ? selectedNodeIds.length >= 2
      : activeSubtab === 'concat'
        ? selectedNodeIds.length >= 2
        : Boolean(selectedNodeId);
  const activeOperationHint = {
    filter: CONTEXTUAL_HINT_IDS.preprocessing.filter,
    slice: CONTEXTUAL_HINT_IDS.preprocessing.sample,
    join: CONTEXTUAL_HINT_IDS.preprocessing.join,
    concat: CONTEXTUAL_HINT_IDS.preprocessing.stack,
    segment: null,
    split_group: null,
    summarise: null,
    dedupe: null,
  }[activeSubtab];
  useProgressiveContextualHints([
    CONTEXTUAL_HINT_IDS.preprocessing.inputs,
    ...(operationReady && activeOperationHint ? [activeOperationHint] : []),
  ]);

  /**
   * Renders the single shared preprocessing input panel inside each active
   * subtab card so preprocessing matches the other functional tab layouts.
   */
  const renderNodeInputsPanel = () => (
    <div>
      <NodeInputsPanel
        guidanceTarget="preprocessing-inputs"
        resolvedNodes={nodeInputs.resolvedNodes}
        availableNodes={nodeInputs.availableNodes}
        canAddMore={nodeInputs.canAddMore}
        maxNodes={maxInputNodes}
        onAddNodes={nodeInputs.addNodes}
        onRemoveNode={nodeInputs.removeNode}
        onClear={nodeInputs.clear}
        onColumnChange={nodeInputs.setColumn}
        showColumnPicker={showInputColumnPicker}
        columnLabel={showInputColumnPicker ? preprocessingColumnLabel : undefined}
        title="Data Builder Inputs"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-semibold leading-none tracking-tight text-foreground">
              Data Builder
            </h1>
            <InfoIcon
              targetKey="preprocessing.overview"
              label="About Data Builder"
              tooltip="Learn how the Data Builder makes new Data Blocks for analysis."
            />
          </div>
          <p className="text-body text-description">Make new Data Blocks from existing ones.</p>
        </div>
      </div>

      <Tabs
        value={activeSubtab}
        onValueChange={(value) => {
          setActiveSubtab(value as DataPrepSubtab);
        }}
        className="space-y-4"
      >
        <EditorTabs
          aria-label="Data preprocessing sub-views"
          tabs={PREPROCESSING_TABS}
          activeTabId={activeSubtab}
          onActivate={(id) => {
            setActiveSubtab(id as DataPrepSubtab);
          }}
        />

        <TabsContent
          id="preprocessing-panel-filter"
          aria-labelledby="preprocessing-tab-filter"
          value="filter"
          className="space-y-4"
        >
          <FilterSubTab
            renderNodeInputsPanel={renderNodeInputsPanel}
            selectedNodeId={selectedNodeId}
            selectedNode={selectedNode}
            columnOptions={selectedNodeColumnOptions}
            currentWorkspaceId={currentWorkspaceId}
            filterNode={guidedFilterNode}
            filterPreview={guidedFilterPreview}
            isLoading={isLoading}
            onAlert={handleAlert}
          />
        </TabsContent>

        <TabsContent
          id="preprocessing-panel-slice"
          aria-labelledby="preprocessing-tab-slice"
          value="slice"
          className="space-y-4"
        >
          <SliceSubTab
            renderNodeInputsPanel={renderNodeInputsPanel}
            currentWorkspaceId={currentWorkspaceId}
            selectedNodeId={selectedNodeId}
            selectedNode={selectedNode}
            sliceNode={guidedSliceNode}
            slicePreview={guidedSlicePreview}
            isLoading={isLoading}
            onAlert={handleAlert}
          />
        </TabsContent>

        <TabsContent
          id="preprocessing-panel-join"
          aria-labelledby="preprocessing-tab-join"
          value="join"
          className="space-y-4"
        >
          <JoinSubTab
            renderNodeInputsPanel={renderNodeInputsPanel}
            selectedNodeIds={selectedNodeIds}
            selectedNodeColumns={selectedNodeColumns}
            setSelectedNodeColumns={setSelectedJoinColumns}
            currentWorkspaceId={currentWorkspaceId}
            workspaceNodes={workspaceNodes}
            getColumnInfos={nodeInputs.getColumnInfos}
            joinNodes={guidedJoinNodes}
            onPreviewSuccess={() => {
              reachContextualHint(CONTEXTUAL_HINT_IDS.preprocessing.preview);
            }}
            isLoading={isLoading}
            onAlert={handleAlert}
          />
        </TabsContent>

        <TabsContent
          id="preprocessing-panel-concat"
          aria-labelledby="preprocessing-tab-concat"
          value="concat"
          className="space-y-4"
        >
          <ConcatSubTab
            renderNodeInputsPanel={renderNodeInputsPanel}
            selectedNodeIds={selectedNodeIds}
            currentWorkspaceId={currentWorkspaceId}
            workspaceNodes={workspaceNodes}
            getColumnInfos={nodeInputs.getColumnInfos}
            concatNodes={guidedConcatNodes}
            concatPreview={guidedConcatPreview}
            isLoading={isLoading}
            onAlert={handleAlert}
          />
        </TabsContent>
        <TabsContent
          id="preprocessing-panel-segment"
          aria-labelledby="preprocessing-tab-segment"
          value="segment"
        >
          <SegmentSubTab
            input={builderInput}
            workspaceId={currentWorkspaceId}
            renderNodeInputsPanel={renderNodeInputsPanel}
            onAlert={handleAlert}
          />
        </TabsContent>

        <TabsContent
          id="preprocessing-panel-split-group"
          aria-labelledby="preprocessing-tab-split-group"
          value="split_group"
        >
          <SplitByGroupSubTab
            input={builderInput}
            workspaceId={currentWorkspaceId}
            renderNodeInputsPanel={renderNodeInputsPanel}
            onAlert={handleAlert}
          />
        </TabsContent>

        <TabsContent
          id="preprocessing-panel-summarise"
          aria-labelledby="preprocessing-tab-summarise"
          value="summarise"
        >
          <GroupSummarySubTab
            input={builderInput}
            workspaceId={currentWorkspaceId}
            renderNodeInputsPanel={renderNodeInputsPanel}
            onAlert={handleAlert}
          />
        </TabsContent>

        <TabsContent
          id="preprocessing-panel-dedupe"
          aria-labelledby="preprocessing-tab-dedupe"
          value="dedupe"
        >
          <DedupeSubTab
            input={builderInput}
            workspaceId={currentWorkspaceId}
            renderNodeInputsPanel={renderNodeInputsPanel}
            onAlert={handleAlert}
          />
        </TabsContent>
      </Tabs>

      {/* Shared Alert Dialog for error messages */}
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alert</AlertDialogTitle>
            <AlertDialogDescription>{alertMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setAlertOpen(false);
              }}
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default DataPreprocessingFeature;
