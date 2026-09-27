import { ThreeColumnLayout } from './ThreeColumnLayout';
import { Suspense, lazy } from 'react';
import { QueryProvider } from '@/providers/QueryProvider';
import { ServerProjectProvider } from '@/features/project/common/ServerProjectProvider';
import { ProjectDownloadsProvider } from '@/features/project/project-downloads/ProjectDownloadsProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import Sidebar from '@/components/layout/Sidebar';
import { RefreshStatusBanner } from '@/features/auth/components/RefreshStatusBanner';
import { useUIStore } from '@/stores';
import { DocumentModalHost } from '@/components/dialogs/DocumentModalHost';
import { ViewRouteSync } from '@/components/layout/ViewRouteSync';
import { ViewRouter } from '@/components/layout/ViewRouter';
import { isTabbedMainView } from '@/features/views/viewRegistry';
import { GuidanceProvider } from '@/features/guidance/GuidanceProvider';
import { ServerProjectNodeInputPointerCarrier } from '@/features/project/common/ServerProjectNodeInputPointerCarrier';
import { AccountThemeSynchronizer } from '@/features/theme/AccountThemeSynchronizer';
import { DesktopNavigationHeader } from '@/components/layout/DesktopNavigationHeader';

const ServerProjectView = lazy(() => import('@/components/layout/ServerProjectView'));

export function ServerProjectShell() {
  return (
    <QueryProvider>
      <AccountThemeSynchronizer />
      <ServerProjectShellContent />
    </QueryProvider>
  );
}

function ServerProjectShellContent() {
  const currentView = useUIStore((s) => s.currentView);
  const isTabbedMain = isTabbedMainView(currentView);

  return (
    <ServerProjectProvider>
      <GuidanceProvider>
        <DesktopNavigationHeader />
        <ViewRouteSync />
        <ErrorBoundary>
          <ThreeColumnLayout
            isTabbedMain={isTabbedMain}
            sidebar={<Sidebar />}
            hosts={
              <>
                <DocumentModalHost />
                <ServerProjectNodeInputPointerCarrier />
                <RefreshStatusBanner />
              </>
            }
            rightPanel={(collapsed, toggle) => (
              <ErrorBoundary>
                <Suspense fallback={<div>Loading project view…</div>}>
                  <ServerProjectView collapsed={collapsed} onToggleCollapse={toggle} />
                </Suspense>
              </ErrorBoundary>
            )}
          >
            <ProjectDownloadsProvider>
              <ViewRouter />
            </ProjectDownloadsProvider>
          </ThreeColumnLayout>
        </ErrorBoundary>
      </GuidanceProvider>
    </ServerProjectProvider>
  );
}
