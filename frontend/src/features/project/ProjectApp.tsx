import { EditingNavigation } from '@/features/table-editing/EditingNavigation';
import { FeedbackPanelView } from '@/features/feedback/components/FeedbackPanel';
import { useUIStore } from '@/stores/uiStore';
import { Toaster } from '@/components/ui/sonner';
import { createProjectQueryClient } from './projectErrors';
import { DocumentModalHost } from '@/components/dialogs/DocumentModalHost';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DesktopWindowFrame } from '@/components/layout/DesktopWindowFrame';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { HostSettings, useHostServices } from '@/features/settings/HostSettings';
import DocumentSession from './DocumentSession';

export default function ProjectApp({
  base,
  queryClient,
}: {
  base: string;
  queryClient?: QueryClient;
}) {
  const host = useHostServices();
  const feedback = useUIStore((s) => s.feedback);
  const closeFeedback = useUIStore((s) => s.closeFeedback);
  const [ownedClient] = useState(createProjectQueryClient);
  const client = queryClient ?? ownedClient;
  useEffect(
    () => () => {
      if (!queryClient) {
        void client.cancelQueries();
        client.clear();
      }
    },
    [client, queryClient],
  );
  const content = (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <DesktopWindowFrame>
          <Toaster style={{ pointerEvents: 'auto' }} />
          <DocumentModalHost />
          <FeedbackPanelView context={feedback} onClose={closeFeedback} />
          <ErrorBoundary>
            <EditingNavigation>
              <DocumentSession base={base} />
            </EditingNavigation>
          </ErrorBoundary>
        </DesktopWindowFrame>
      </TooltipProvider>
    </QueryClientProvider>
  );
  return host ? (
    content
  ) : (
    <HostSettings base={base} client={client}>
      {content}
    </HostSettings>
  );
}
