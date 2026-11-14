import { Suspense, lazy } from 'react';
import { useSidebarResize } from '@/hooks/useSidebarResize';
import { useRightPanelResize } from '@/hooks/useRightPanelResize';
import { QueryProvider } from '@/providers/QueryProvider';
import { WorkspaceProvider } from '@/features/workspace/common/WorkspaceProvider';
import { WorkspaceDownloadsProvider } from '@/features/workspace/workspace-downloads/WorkspaceDownloadsProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import Sidebar from '@/components/layout/Sidebar';
import { InsetCard } from '@/components/layout/InsetCard';
import { RefreshStatusBanner } from '@/features/auth/components/RefreshStatusBanner';
import { useUIStore } from '@/stores';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { DocumentModalHost } from '@/components/dialogs/DocumentModalHost';
import { useDesktopHelpMenu } from '@/features/desktop-help/useDesktopHelpMenu';
import { useWebUpdateNotice } from '@/features/app-update/useWebUpdateNotice';
import { ViewRouteSync } from '@/components/layout/ViewRouteSync';
import { ViewRouter } from '@/components/layout/ViewRouter';
import { isTabbedMainView } from '@/features/views/viewRegistry';
import { GuidanceProvider } from '@/features/guidance/GuidanceProvider';
import { NodeInputPointerCarrier } from '@/components/layout/NodeInputPointerCarrier';
import { ResizeHandle } from '@/components/layout/ResizeHandle';
import { AccountThemeSynchronizer } from '@/features/theme/AccountThemeSynchronizer';
import { DesktopNavigationHeader } from '@/components/layout/DesktopNavigationHeader';
import { ServerNoticeBanner } from '@/features/server-notice/ServerNoticeBanner';
import { LayoutFocusGuard } from '@/components/layout/LayoutFocusGuard';
import { shellRegions } from '@/components/layout/shellLayout';
import { useLayoutFocusStore } from '@/stores/layoutFocusStore';

const WorkspaceView = lazy(() => import('@/components/layout/WorkspaceView'));

export function WorkspaceShell() {
  return (
    <QueryProvider>
      <AccountThemeSynchronizer />
      <WorkspaceShellContent />
    </QueryProvider>
  );
}

function WorkspaceShellContent() {
  // The desktop Help menu searches and opens Wordflow's help.
  useDesktopHelpMenu();
  // Binder, pip and server hear about a newer Wordflow (issue 386).
  useWebUpdateNotice();
  const currentView = useUIStore((s) => s.currentView);
  const isTabbedMain = isTabbedMainView(currentView);

  const {
    containerRef: sidebarHostRef,
    value: sidebarWidth,
    isDragging: isResizingSidebar,
    splitterProps: sidebarSplitterProps,
  } = useSidebarResize();

  const {
    layoutRef,
    asidePanelRatio,
    isResizing,
    rightPanelSplitterProps,
    isRightCollapsed,
    toggleRightPanel,
    mainRef,
    asideRef,
  } = useRightPanelResize();
  // A maximised surface (an analysis tool's results, or the Data Editor)
  // takes the window: the other regions are hidden, never unmounted, and no
  // split ratio changes, so restoring gives the same layout back.
  const maximised = useLayoutFocusStore((state) => state.maximised);
  const regions = shellRegions({ maximised, isRightCollapsed, asidePanelRatio });

  return (
    <WorkspaceProvider>
      <GuidanceProvider>
        <DesktopNavigationHeader />
        <ViewRouteSync />
        <LayoutFocusGuard />
        <ErrorBoundary>
          <SidebarProvider
            className="app-titlebar-backplane h-full min-h-0"
            style={{ ['--sidebar-width' as string]: `${String(sidebarWidth)}px` }}
          >
            <DocumentModalHost />
            <NodeInputPointerCarrier />
            <RefreshStatusBanner />
            <div className="flex h-full w-full overflow-hidden" ref={sidebarHostRef}>
              <div className={regions.sidebarHidden ? 'hidden' : 'contents'}>
                <ErrorBoundary>
                  <Sidebar />
                </ErrorBoundary>

                <ResizeHandle
                  orientation="vertical"
                  isDragging={isResizingSidebar}
                  className={`-mx-0.5 my-2 hidden md:flex ${isResizingSidebar ? 'z-20' : ''}`}
                  aria-label="Resize sidebar"
                  {...sidebarSplitterProps}
                />
              </div>

              <SidebarInset className="@container/workspace-shell flex h-full flex-1 flex-col overflow-hidden bg-transparent md:m-0! md:ml-0! md:rounded-none! md:shadow-none!">
                <header className="app-titlebar-backplane border-b px-4 py-2 md:hidden">
                  <div className="flex items-center justify-between">
                    <SidebarTrigger />
                  </div>
                </header>
                {/* The operator's notice, until Got it (issue 438). */}
                <ServerNoticeBanner />

                <div className="flex flex-1 flex-col overflow-hidden">
                  {/* Stack whenever the post-sidebar shell becomes too narrow for both panes. */}
                  <div
                    className="relative flex flex-1 overflow-hidden max-md:flex-col max-md:overflow-y-auto @max-[639px]/workspace-shell:flex-col @max-[639px]/workspace-shell:overflow-y-auto"
                    ref={layoutRef}
                  >
                    <InsetCard
                      ref={mainRef}
                      role="main"
                      className={`relative h-full p-2 pt-0 pl-0 ${
                        // With the sidebar hidden the card needs its own left gap.
                        regions.sidebarHidden ? 'pl-2!' : ''
                      } ${regions.mainHidden ? 'hidden!' : ''} ${
                        isRightCollapsed || regions.asideHidden
                          ? // Stacked and collapsed: the analysis takes the
                            // whole height above the Project panel's bar (issue 390).
                            'pr-2 max-md:min-h-0 max-md:flex-1 @max-[639px]/workspace-shell:min-h-0 @max-[639px]/workspace-shell:flex-1'
                          : 'pr-0 max-md:min-h-[calc(100dvh-3.5rem)] @max-[639px]/workspace-shell:min-h-[calc(100dvh-3.5rem)]'
                      } max-md:h-auto max-md:w-full! max-md:min-w-0! max-md:px-2 @max-[639px]/workspace-shell:h-auto @max-[639px]/workspace-shell:w-full! @max-[639px]/workspace-shell:min-w-0! @max-[639px]/workspace-shell:px-2 ${
                        isResizing ? 'transition-none' : 'transition-all duration-300 ease-in-out'
                      }`}
                      style={{ width: regions.mainWidth, minWidth: 280 }}
                      innerClassName={
                        isTabbedMain
                          ? // Tabbed views own their continuous editor surface,
                            // so strip the shared frame and padding.
                            'overflow-hidden border-0 bg-transparent p-0 shadow-none'
                          : 'overflow-y-auto scrollbar-none p-4'
                      }
                    >
                      <div className="mx-0 flex min-h-0 w-full max-w-none flex-1">
                        <WorkspaceDownloadsProvider>
                          <ViewRouter />
                        </WorkspaceDownloadsProvider>
                      </div>
                    </InsetCard>

                    {!regions.handleHidden && (
                      <ResizeHandle
                        orientation="vertical"
                        isDragging={isResizing}
                        className="-mx-0.5 my-2 hidden md:flex @max-[639px]/workspace-shell:hidden"
                        aria-label="Resize right panel"
                        {...rightPanelSplitterProps}
                      />
                    )}

                    <aside
                      ref={asideRef}
                      className={`relative flex h-full flex-col bg-transparent ${
                        regions.asideHidden ? 'hidden!' : ''
                      } ${
                        // Maximised, the Data Editor takes the full height when stacked too.
                        maximised === 'data-editor'
                          ? 'max-md:h-full! @max-[639px]/workspace-shell:h-full!'
                          : ''
                      } ${isResizing ? 'transition-none' : 'transition-all duration-300 ease-in-out'} ${
                        isRightCollapsed
                          ? 'min-w-0 w-0 overflow-visible flex-none max-md:h-auto max-md:w-full! @max-[639px]/workspace-shell:h-auto @max-[639px]/workspace-shell:w-full!'
                          : 'min-w-[320px] overflow-hidden max-md:h-[70dvh] max-md:w-full! max-md:min-w-0! max-md:flex-none @max-[639px]/workspace-shell:h-[70dvh] @max-[639px]/workspace-shell:w-full! @max-[639px]/workspace-shell:min-w-0! @max-[639px]/workspace-shell:flex-none'
                      }`}
                      style={{ width: regions.asideWidth }}
                    >
                      <ErrorBoundary>
                        <Suspense
                          fallback={
                            <div className="flex h-full items-center justify-center bg-editor text-body text-description">
                              Loading Project view…
                            </div>
                          }
                        >
                          <WorkspaceView
                            collapsed={isRightCollapsed}
                            onToggleCollapse={toggleRightPanel}
                          />
                        </Suspense>
                      </ErrorBoundary>
                    </aside>
                  </div>
                </div>
              </SidebarInset>
            </div>
          </SidebarProvider>
        </ErrorBoundary>
      </GuidanceProvider>
    </WorkspaceProvider>
  );
}
