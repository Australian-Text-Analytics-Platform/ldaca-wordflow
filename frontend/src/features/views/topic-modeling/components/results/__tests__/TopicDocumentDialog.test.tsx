import { render, screen, waitFor, within } from '@testing-library/react';
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

  it('tints the opened segment more strongly and steps through its segments', async () => {
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
            topicWords={['rents', 'housing']}
            topicColor="#16a34a"
            onClose={vi.fn()}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    const current = await screen.findByText(
      (_, element) => element?.hasAttribute('data-current-segment') ?? false,
    );
    expect(current).toHaveTextContent('Rents fell again.');
    expect(current).toHaveAttribute('data-tint', 'strong');
    expect(screen.getByText('rose.', { exact: false })).toHaveAttribute('data-tint', 'light');
    // Only the topic's words are bold and italic, in every segment of the topic.
    expect(within(current).getByText('Rents')).toHaveClass('font-bold', 'italic');
    expect(within(current).queryByText('fell')).toBeNull();
    const other = screen.getByText('rose.', { exact: false });
    expect(other).not.toHaveAttribute('data-current-segment');
    expect(within(other).getByText('Rents')).toHaveClass('italic');
    expect(screen.getByText('😀 Parks opened.')).toHaveAttribute('title', 'Topic 2');
    expect(screen.getByText('2 of 2 in Topic 4')).toBeInTheDocument();
    expect(screen.getByText('Senator A')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Document \(Topic 4\)/ })).toHaveTextContent(
      'rents, housing',
    );

    await user.click(screen.getByRole('button', { name: /Previous segment/ }));
    await waitFor(() => {
      expect(screen.getByText('rose.', { exact: false })).toHaveAttribute('data-current-segment');
    });
    expect(screen.getByText('1 of 2 in Topic 4')).toBeInTheDocument();
  });
});
