import { EditingNavigation } from '@/features/table-editing/EditingNavigation';
import { FeedbackPanelView } from '@/features/feedback/components/FeedbackPanel';
import { useUIStore } from '@/stores/uiStore';
import { Toaster } from '@/components/ui/sonner';
import { createProjectQueryClient } from './projectErrors';
import { DocumentModalHost } from '@/components/dialogs/DocumentModalHost';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { DesktopWindowFrame } from '@/components/layout/DesktopWindowFrame';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import DocumentSession from './DocumentSession';

export default function ProjectApp({ base }: { base: string }) {
  const feedback = useUIStore((s) => s.feedback);
  const closeFeedback = useUIStore((s) => s.closeFeedback);
  const [client] = useState(createProjectQueryClient);
  useEffect(
    () => () => {
      void client.cancelQueries();
      client.clear();
    },
    [client],
  );
  return (
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
}
