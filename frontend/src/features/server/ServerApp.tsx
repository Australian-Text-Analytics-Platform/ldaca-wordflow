import { request } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import ProjectApp from '@/features/project/ProjectApp';
import { createProjectQueryClient } from '@/features/project/projectErrors';
import { useAnnotationState } from '@/features/tools/annotation/annotationState';
import { useConcordanceState } from '@/features/tools/concordance/concordanceState';
import { usePlotMode, usePlotState } from '@/features/tools/plots/plotState';
import { useQuotationState } from '@/features/tools/quotation/quotationState';
import { useFrequencyState } from '@/features/tools/token-frequency/frequencyState';
import { useTopicSampling, useTopicState } from '@/features/tools/topic-modeling/topicState';
import { useSelectionStore } from '@/stores/selectionStore';
import { QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ServerContext } from './context';

export default function ServerApp({ base }: { base: string }) {
  const [client] = useState(createProjectQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ServerSession base={base} />
    </QueryClientProvider>
  );
}
function ServerSession({ base }: { base: string }) {
  const cache = useQueryClient();
  const status = useQuery({
    queryKey: ['server', base],
    queryFn: async ({ signal }) => (await request(base, '/api/server', 'get', { signal })).json(),
  });
  useEffect(() => {
    const events = new EventSource(`${base}/api/server/events`);
    events.onmessage = () => {
      void cache.invalidateQueries({ queryKey: ['server', base] });
    };
    return () => {
      events.close();
    };
  }, [base, cache]);
  const identity = status.data?.session_id;
  useEffect(() => {
    useSelectionStore.getState().clearSelection();
    useConcordanceState.setState({ active: {}, drafts: {}, previews: {} });
    useQuotationState.setState({ active: {}, drafts: {}, previews: {} });
    useAnnotationState.setState({ active: {}, drafts: {}, previews: {} });
    useTopicState.setState({ active: {}, drafts: {}, previews: {} });
    useTopicSampling.setState({ choices: {} });
    useFrequencyState.setState({ active: {}, drafts: {}, display: {} });
    usePlotState.setState({ active: {}, drafts: {}, previews: {} });
    usePlotMode.setState({ modes: {} });
  }, [identity]);
  if (!status.data)
    return (
      <main className="p-6">
        <Toaster />
        <p role="status">
          {status.isError ? 'Could not connect to Wordflow.' : 'Opening Wordflow…'}
        </p>
        {status.isError && (
          <Button
            onClick={() => {
              void status.refetch();
            }}
          >
            Retry
          </Button>
        )}
      </main>
    );
  const value = {
    base,
    status: status.data,
    refresh: () => cache.invalidateQueries({ queryKey: ['server', base] }),
  };
  return (
    <ServerContext value={value}>
      <ProjectApp key={status.data.session_id} base={`${base}/session/${status.data.session_id}`} />
    </ServerContext>
  );
}
