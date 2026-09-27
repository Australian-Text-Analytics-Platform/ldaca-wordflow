import { SidebarView } from './SidebarView';
import { useQueryClient } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';

import { useProjectData } from '@/features/project/common/hooks/useProjectData';
import { useProjectTaskInbox } from '@/features/project/task-stream/useProjectTaskInbox';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useUIStore } from '@/stores';

import SidebarTasksSection from '@/components/layout/sidebar/SidebarTasksSection';
import ProjectNodeList, { type ProjectListNode } from '@/components/layout/ProjectNodeList';
import { NodeActionsToolbar, NodePinButton } from '@/components/layout/NodeActionsToolbar';
import { useProjectSelection } from '@/features/project/common/hooks/useProjectSelection';
import { useProjectActions } from '@/features/project/common/hooks/useProjectActions';
import {
  type NodeInputPointerPosition,
  useNodeInputRequestsStore,
} from '@/stores/nodeInputRequestsStore';
import { useFreshNodesStore } from '@/stores/freshNodesStore';
import { usePinnedNodesStore } from '@/stores/pinnedNodesStore';

import { VIEW_DEFINITIONS, isProjectRequired } from '@/features/views/viewRegistry';
import type { ViewType } from '@/features/views/viewIds';
import { useVisibleViews } from '@/features/views/useVisibleViews';
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from '@/features/preferences/useUserPreferences';

/**
 * Main app sidebar used by the project shell. It coordinates view navigation,
 * data-block selection, task stream status, help links, feedback, and working
 * directory controls from the global stores and project hooks.
 * Why: navigation, data selection, task status, feedback, and working-directory actions need one persistent shell surface.
 * Flow: select global/project/task state, wire logout/settings/dialog handlers, compute split sections and visible nav items, then render sidebar chrome.
 */
const EMPTY_FRESH_IDS = new Set<string>();
function Sidebar() {
  const { currentView, setCurrentView } = useUIStore(
    useShallow(({ currentView, setCurrentView }) => ({
      currentView,
      setCurrentView,
    })),
  );
  const visibleViews = useVisibleViews();
  const { preferences } = useUserPreferences();
  const updatePreferences = useUpdateUserPreferences();
  const setViewHidden = (view: ViewType, hidden: boolean) => {
    const hiddenViews = new Set(preferences.hidden_views ?? []);
    if (hidden) hiddenViews.add(view);
    else hiddenViews.delete(view);
    updatePreferences.mutate({ hidden_views: [...hiddenViews] });
  };
  const { currentProjectId } = useProjectData();
  const { user, logout, isMultiUserMode } = useAuth();
  const queryClient = useQueryClient();
  /** Called by: the Sidebar footer/header Logout button onClick prop. */
  const handleLogout = async () => {
    // Drop all cached query data so the next signed-in user never sees the
    // previous user's files, projects, nodes, or preferences.
    queryClient.clear();
    await logout();
  };
  const {
    tasks,
    status: taskStreamStatus,
    error: taskStreamError,
    reconnect: reconnectTaskStream,
    stopUserFileImport,
    clearUserFileImport,
    clearUnavailableAnalysis,
    stoppingImportId,
    clearingImportId,
    clearingAnalysisTabId,
  } = useProjectTaskInbox(currentProjectId);
  const { projectGraph } = useProjectData();
  const { selectedNodeIds } = useProjectSelection();
  const { toggleNode, clearSelection, deleteNode, copyNode, renameNode } = useProjectActions();
  const requestNodeInputAdd = useNodeInputRequestsStore((state) => state.requestAdd);
  const pinnedNodeIds = usePinnedNodesStore((state) => state.pinnedNodeIds);
  const togglePinnedNode = usePinnedNodesStore((state) => state.togglePinnedNode);

  const freshIds = useFreshNodesStore(
    (state) =>
      (currentProjectId ? state.freshIdsByProject.get(currentProjectId) : undefined) ??
      EMPTY_FRESH_IDS,
  );
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Zustand action does not use this.
  const markInteracted = useFreshNodesStore((state) => state.markInteracted);

  const nodes = projectGraph?.nodes ?? [];
  const nodeCount = nodes.length;
  const selectedCount = selectedNodeIds.length;
  const pinnedIdSet = new Set(pinnedNodeIds);

  const getToolbarNode = (node: ProjectListNode) => ({
    id: node.id,
    name: node.name,
  });

  /**
   * Queues a data-block add request for the view that is active at click time.
   * Called by: NodeActionsToolbar in the Data Blocks sidebar section. The graph
   * path uses the same live-read pattern because add requests are scoped to the
   * active analysis view, and stale closures can otherwise tag a click for the
   * previous tool so no mounted selector consumes it.
   */
  const handleAddToSelection = (nodeId: string, pointer?: NodeInputPointerPosition) => {
    requestNodeInputAdd(currentProjectId, useUIStore.getState().currentView, nodeId, pointer);
    if (currentProjectId) markInteracted(currentProjectId, [nodeId]);
  };

  const isConnected = taskStreamStatus === 'open';
  const isConnecting = taskStreamStatus === 'connecting';
  const connectionError = taskStreamStatus === 'error' ? taskStreamError : null;

  const isProjectLoaded = Boolean(currentProjectId);
  const visibleNavItems = VIEW_DEFINITIONS.filter(({ id }) => visibleViews.includes(id));

  /**
   * Called by: Sidebar's Views section body renderer.
   * Flow: map visible views to sidebar buttons and disable project-only views until a project loads.
   */
  const renderViewsBody = () => (
    <SidebarMenu>
      {visibleNavItems.map(({ id, label, icon: Icon }) => {
        const isDisabled = !isProjectLoaded && isProjectRequired(id);
        return (
          <SidebarMenuItem key={id}>
            <SidebarMenuButton
              isActive={currentView === id}
              onClick={() => {
                if (isDisabled) return;
                setCurrentView(id);
              }}
              disabled={isDisabled}
              aria-disabled={isDisabled}
              tooltip={isDisabled ? 'Load a project to use this view' : undefined}
            >
              <Icon />
              <span>{label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
  return (
    <SidebarView
      header={
        isMultiUserMode ? (
          <SidebarHeader data-testid="sidebar-title" className="shrink-0 overflow-hidden px-3 py-2">
            <div className="flex items-center justify-between w-full">
              <p className="text-[11px] text-description truncate" title={user?.name ?? 'Guest'}>
                Welcome, {user?.name ?? 'Guest'}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-label-secondary text-error hover:text-error shrink-0 h-auto py-0 px-1"
                onClick={() => {
                  void handleLogout();
                }}
              >
                Logout
              </Button>
            </div>
          </SidebarHeader>
        ) : null
      }
      viewsContent={renderViewsBody()}
      nodesContent={
        <ProjectNodeList
          freshIds={freshIds}
          nodes={nodes}
          unavailableWarnings={(projectGraph?.unavailableNodes ?? []).map((node) => node.warning)}
          selectedNodeIds={selectedNodeIds}
          onToggleNodeSelection={toggleNode}
          renderPinnedRowAction={(node: ProjectListNode) => (
            <NodePinButton
              node={getToolbarNode(node)}
              isPinned={pinnedIdSet.has(node.id)}
              onTogglePin={togglePinnedNode}
            />
          )}
          renderRowActions={(node: ProjectListNode) => (
            <NodeActionsToolbar
              node={getToolbarNode(node)}
              isPinned={pinnedIdSet.has(node.id)}
              onTogglePin={togglePinnedNode}
              onAddToSelection={handleAddToSelection}
              onRename={(id, newName) => {
                void renameNode(id, newName);
              }}
              onClone={(id) => {
                void copyNode(id);
              }}
              onDelete={(id) => {
                void deleteNode(id);
              }}
            />
          )}
        />
      }
      tasksContent={
        <SidebarTasksSection
          tasks={tasks}
          isConnected={isConnected}
          isConnecting={isConnecting}
          connectionError={connectionError}
          onReconnect={reconnectTaskStream}
          onStopUserFileImport={stopUserFileImport}
          onClearUserFileImport={clearUserFileImport}
          onClearUnavailableAnalysis={clearUnavailableAnalysis}
          stoppingImportId={stoppingImportId}
          clearingImportId={clearingImportId}
          clearingAnalysisTabId={clearingAnalysisTabId}
        />
      }
      nodeCount={nodeCount}
      selectedCount={selectedCount}
      clearSelection={clearSelection}
      visibleViews={visibleViews}
      setViewHidden={setViewHidden}
      connection={{ connected: isConnected, connecting: isConnecting, error: connectionError }}
    />
  );
}

export default Sidebar;
