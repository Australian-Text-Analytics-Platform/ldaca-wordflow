import { TooltipProvider } from '@/components/ui/tooltip';
import { DesktopNavigationHeaderView } from './DesktopNavigationHeaderView';
export { DesktopNavigationHeaderView } from './DesktopNavigationHeaderView';
import { useEffect, useRef, useState } from 'react';
import type { Tab } from '@/api';
import { SettingsButton } from '@/components/layout/SettingsButton';
import {
  analysisNavigationForKind,
  analysisNavigationForView,
} from '@/features/views/common/analysisNavigation';
import {
  analysisTabsPresentationKey,
  useAnalysisTabsPresentationStore,
} from '@/features/views/common/tabs/analysisTabsPresentationStore';
import { useProjectTabResources } from '@/features/views/common/tabs/projectTabsQuery';
import { useProjectData } from '@/features/project/common/hooks/useProjectData';
import { isMacOSDesktop } from '@/lib/isMacOSDesktop';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import {
  createDesktopNavigationHistory,
  type DesktopNavigationLocation,
  moveDesktopNavigation,
  pruneDesktopNavigationTabs,
  recordDesktopNavigation,
} from './desktopNavigationHistory';

const EMPTY_TABS: Tab[] = [];
/** Connects desktop title-bar controls to Project Tabs and session navigation history. */
export function DesktopNavigationHeader() {
  return (
    <TooltipProvider>
      <DesktopNavigationHeaderController />
    </TooltipProvider>
  );
}

function DesktopNavigationHeaderController() {
  const { currentProject, currentProjectId } = useProjectData();
  const userId = useAuthStore((state) => state.session?.user?.id ?? '__anonymous__');
  const currentView = useUIStore((state) => state.currentView);
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const activeTabIds = useAnalysisTabsPresentationStore((state) => state.activeTabIds);
  const rememberActiveTab = useAnalysisTabsPresentationStore((state) => state.rememberActiveTab);
  const tabsQuery = useProjectTabResources(currentProjectId);
  const tabResources = tabsQuery.data ?? EMPTY_TABS;
  const tabs = tabResources.filter((tab): tab is Tab => tab.availability === 'available');
  const unavailableTabWarnings = tabResources
    .filter((tab) => tab.availability === 'unavailable')
    .map((tab) => tab.warning);
  const currentAnalysis = analysisNavigationForView(currentView);
  const storedActiveTabId = currentAnalysis
    ? (activeTabIds[
        analysisTabsPresentationKey(userId, currentProjectId, currentAnalysis.kind)
      ] ?? null)
    : null;
  const currentTab = currentAnalysis
    ? (tabs.find((tab) => tab.kind === currentAnalysis.kind && tab.id === storedActiveTabId) ??
      tabs.find((tab) => tab.kind === currentAnalysis.kind) ??
      null)
    : null;
  const currentTabId = currentTab?.id ?? null;
  const locationReady = !currentAnalysis || !currentProjectId || !tabsQuery.isLoading;
  const [history, setHistory] = useState(() => createDesktopNavigationHistory(currentProjectId));
  const applyingHistoryRef = useRef<DesktopNavigationLocation | null>(null);

  useEffect(() => {
    const location: DesktopNavigationLocation = currentTabId
      ? { view: currentView, tabId: currentTabId }
      : { view: currentView };
    const applying = applyingHistoryRef.current;
    const applyingReached = applying?.view === location.view && applying.tabId === location.tabId;
    if (applyingReached) {
      applyingHistoryRef.current = null;
    }
    setHistory((current) => {
      let next =
        current.projectId === currentProjectId
          ? current
          : createDesktopNavigationHistory(currentProjectId);
      if (tabsQuery.isSuccess) {
        next = pruneDesktopNavigationTabs(next, new Set(tabs.map((tab) => tab.id)));
      }
      if (!locationReady || applyingReached) return next;
      return recordDesktopNavigation(next, currentProjectId, location);
    });
  }, [currentTabId, currentView, currentProjectId, locationReady, tabs, tabsQuery.isSuccess]);

  const applyHistoryLocation = (location: DesktopNavigationLocation) => {
    applyingHistoryRef.current = location;
    if (location.tabId && currentProjectId) {
      const tab = tabs.find((item) => item.id === location.tabId);
      if (tab) rememberActiveTab(userId, currentProjectId, tab.kind, tab.id);
    }
    setCurrentView(location.view);
  };

  const moveHistory = (direction: -1 | 1) => {
    const moved = moveDesktopNavigation(history, direction);
    if (!moved.location) return;
    setHistory(moved.history);
    applyHistoryLocation(moved.location);
  };

  return (
    <DesktopNavigationHeaderView
      tools={
        <SettingsButton tooltipSide="bottom" className="size-[22px]" iconClassName="!size-[18px]" />
      }
      projectName={currentProject?.name ?? 'No project'}
      tabs={tabs}
      unavailableTabWarnings={unavailableTabWarnings}
      currentTabId={currentTabId}
      isLoading={Boolean(currentProjectId) && tabsQuery.isLoading}
      isError={tabsQuery.isError}
      canGoBack={history.projectId === currentProjectId && history.index > 0}
      canGoForward={
        history.projectId === currentProjectId && history.index < history.entries.length - 1
      }
      hasNativeTrafficLights={isMacOSDesktop()}
      onBack={() => {
        moveHistory(-1);
      }}
      onForward={() => {
        moveHistory(1);
      }}
      onSelectTab={(tab) => {
        if (!currentProjectId) return;
        rememberActiveTab(userId, currentProjectId, tab.kind, tab.id);
        setCurrentView(analysisNavigationForKind(tab.kind).view);
      }}
      onRetry={() => {
        void tabsQuery.refetch();
      }}
    />
  );
}
