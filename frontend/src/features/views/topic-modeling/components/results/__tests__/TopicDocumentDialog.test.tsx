import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

const api = vi.hoisted(() => ({ queryTopicDocument: vi.fn() }));

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  ...api,
}));

import { TopicDocumentDialog } from '../TopicDocumentDialog';

const text = 'Rents rose. 😀 Parks opened. Rents fell again.';
// Code-point offsets, as the backend sends them.
const spans = [
  { start: 0, end: 11, topic_id: 4 },
  { start: 12, end: 27, topic_id: 2 },
  { start: 28, end: 45, topic_id: 4 },
];

describe('TopicDocumentDialog (#353)', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    api.queryTopicDocument.mockReset();
    api.queryTopicDocument.mockResolvedValue({
      data: {
        document_index: 9,
        corpus_index: 0,
        node_id: 'node-1',
        node_name: 'Hansard',
        row_index: 8,
        text,
        spans,
        metadata: { speaker: 'Senator A' },
      },
    });
  });

  it('shows the opened segment bold in the topic colour and steps through its segments', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <TopicDocumentDialog
            workspaceId="ws-1"
            analysisId="analysis-1"
            clusterCount={8}
            topicId={4}
            documentIndex={9}
            startAt={28}
            topicColor="#16a34a"
            onClose={vi.fn()}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    const current = await screen.findByText('Rents fell again.');
    expect(current).toHaveClass('font-bold');
    expect(current).toHaveStyle({ color: '#16a34a' });
    expect(screen.getByText('Rents rose.')).not.toHaveClass('font-bold');
    expect(screen.getByText('😀 Parks opened.')).toHaveAttribute('title', 'Topic 2');
    expect(screen.getByText('2 of 2 in Topic 4')).toBeInTheDocument();
    expect(screen.getByText('Senator A')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Previous segment/ }));
    await waitFor(() => {
      expect(screen.getByText('Rents rose.')).toHaveClass('font-bold');
    });
    expect(screen.getByText('1 of 2 in Topic 4')).toBeInTheDocument();
  });
});
