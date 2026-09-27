import type { ReactNode } from 'react';
import { useSidebarResize } from '@/hooks/useSidebarResize';
import { useRightPanelResize } from '@/hooks/useRightPanelResize';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { InsetCard } from './InsetCard';
import { ResizeHandle } from './ResizeHandle';

/** Shared pane geometry. Each host supplies its own state-connected features. */
export function ThreeColumnLayout({
  sidebar,
  hosts,
  children,
  rightPanel,
  isTabbedMain = false,
  scrollMain = true,
}: {
  sidebar: ReactNode;
  hosts?: ReactNode;
  children: ReactNode;
  rightPanel: (collapsed: boolean, toggle: () => void) => ReactNode;
  isTabbedMain?: boolean;
  scrollMain?: boolean;
}) {
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

  return (
    <SidebarProvider
      className="h-full min-h-0"
      style={{ ['--sidebar-width' as string]: `${String(sidebarWidth)}px` }}
    >
      {hosts}
      <div className="flex h-full w-full overflow-hidden" ref={sidebarHostRef}>
        <ErrorBoundary>{sidebar}</ErrorBoundary>

        <ResizeHandle
          orientation="vertical"
          isDragging={isResizingSidebar}
          className={`-mx-0.5 my-2 hidden md:flex ${isResizingSidebar ? 'z-20' : ''}`}
          aria-label="Resize sidebar"
          {...sidebarSplitterProps}
        />

        <SidebarInset className="@container/project-shell flex h-full flex-1 flex-col overflow-hidden bg-transparent md:m-0! md:ml-0! md:rounded-none! md:shadow-none!">
          <header className="app-titlebar-backplane border-b px-4 py-2 md:hidden">
            <div className="flex items-center justify-between">
              <SidebarTrigger />
            </div>
          </header>

          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Stack whenever the post-sidebar shell becomes too narrow for both panes. */}
            <div
              className="relative flex flex-1 overflow-hidden max-md:flex-col max-md:overflow-y-auto @max-[639px]/project-shell:flex-col @max-[639px]/project-shell:overflow-y-auto"
              ref={layoutRef}
            >
              <InsetCard
                ref={mainRef}
                role="main"
                className={`relative h-full p-2 pt-0 pl-0 ${isRightCollapsed ? 'pr-2' : 'pr-0'} max-md:h-auto max-md:min-h-[calc(100dvh-3.5rem)] max-md:w-full! max-md:min-w-0! max-md:px-2 @max-[639px]/project-shell:h-auto @max-[639px]/project-shell:min-h-[calc(100dvh-3.5rem)] @max-[639px]/project-shell:w-full! @max-[639px]/project-shell:min-w-0! @max-[639px]/project-shell:px-2 ${
                  isResizing ? 'transition-none' : 'transition-all duration-300 ease-in-out'
                }`}
                style={{
                  width: isRightCollapsed ? '100%' : `${String((1 - asidePanelRatio) * 100)}%`,
                  minWidth: 280,
                }}
                innerClassName={
                  isTabbedMain
                    ? // Tabbed tools own their continuous editor surface,
                      // so strip the shared frame and padding.
                      'overflow-hidden border-0 bg-transparent p-0 shadow-none'
                    : scrollMain
                      ? 'overflow-y-auto scrollbar-none p-4'
                      : 'overflow-hidden p-4'
                }
              >
                <div className="mx-0 flex min-h-0 w-full max-w-none flex-1">{children}</div>
              </InsetCard>

              {!isRightCollapsed && (
                <ResizeHandle
                  orientation="vertical"
                  isDragging={isResizing}
                  className="-mx-0.5 my-2 hidden md:flex @max-[639px]/project-shell:hidden"
                  aria-label="Resize right panel"
                  {...rightPanelSplitterProps}
                />
              )}

              <aside
                ref={asideRef}
                className={`relative flex h-full flex-col bg-transparent ${isResizing ? 'transition-none' : 'transition-all duration-300 ease-in-out'} ${
                  isRightCollapsed
                    ? 'min-w-0 w-0 overflow-visible flex-none'
                    : 'min-w-[320px] overflow-hidden max-md:h-[70dvh] max-md:w-full! max-md:min-w-0! max-md:flex-none @max-[639px]/project-shell:h-[70dvh] @max-[639px]/project-shell:w-full! @max-[639px]/project-shell:min-w-0! @max-[639px]/project-shell:flex-none'
                }`}
                style={
                  isRightCollapsed
                    ? { width: '0px' }
                    : { width: `${String(asidePanelRatio * 100)}%` }
                }
              >
                {rightPanel(isRightCollapsed, toggleRightPanel)}
              </aside>
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
