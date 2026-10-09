import type React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';

const api = vi.hoisted(() => ({
  queryTopicSegments: vi.fn(),
  queryTopicDocument: vi.fn(),
}));

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  ...api,
}));

import { TopicExamplesPane } from '../TopicExamplesPane';

const topic = {
  id: 3,
  representative_words: [
    { word: 'housing', occurrence_count: 9 },
    { word: 'rent', occurrence_count: 4 },
  ],
  size: [12],
  total_size: 12,
  x: 0,
  y: 0,
};

const item = (index: number, typicality: number | null) => ({
  segment_index: index,
  document_index: index,
  corpus_index: 0,
  node_id: 'node-1',
  row_index: index,
  start: 0,
  end: 30,
  text: `Housing costs and rent rise ${String(index)}`,
  similarity: typicality === null ? null : typicality / 100,
  typicality,
  metadata: { speaker: `Speaker ${String(index)}` },
});

const page = (overrides: Record<string, unknown> = {}) => ({
  topic_id: 3,
  segment_count: 40,
  document_count: 12,
  matching_count: 12,
  has_similarity: true,
  page: 1,
  page_size: 5,
  metadata_columns: ['speaker'],
  items: [item(0, 96), item(1, 50), item(2, 10)],
  ...overrides,
});

function renderPane(props: Partial<React.ComponentProps<typeof TopicExamplesPane>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <TopicExamplesPane
          workspaceId="ws-1"
          analysisId="analysis-1"
          clusterCount={8}
          nodeNames={['Hansard']}
          corpusColors={['#dc2626']}
          colorScheme={null}
          topic={topic}
          wordColor="#2563eb"
          filteredOut={false}
          onClose={vi.fn()}
          onClearFilters={vi.fn()}
          {...props}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('TopicExamplesPane (#353)', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    api.queryTopicSegments.mockReset();
    api.queryTopicSegments.mockResolvedValue({ data: page() });
  });

  it('invites the reader to pick a topic when none is shown', () => {
    renderPane({ topic: null });
    expect(screen.getByText(/Click the eye on a topic/)).toBeInTheDocument();
    expect(api.queryTopicSegments).not.toHaveBeenCalled();
  });

  it('lists the most typical examples, one per document, with rank badges', async () => {
    renderPane();
    expect(await screen.findByText('40 segments in 12 documents')).toBeInTheDocument();
    expect(api.queryTopicSegments).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { workspace_id: 'ws-1', analysis_id: 'analysis-1' },
        body: expect.objectContaining({
          cluster_count: 8,
          topic_id: 3,
          order: 'typical',
          one_per_document: true,
          page: 1,
          page_size: 5,
        }),
      }),
    );
    expect(screen.getByRole('checkbox', { name: 'One per document' })).toBeChecked();
    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(within(cards[0]!).getByText('Top 4%')).toHaveClass('tabular-nums');
    expect(within(cards[1]!).getByText('Top 50%')).toBeInTheDocument();
    expect(within(cards[2]!).getByText('Top 90%')).toBeInTheDocument();
    // The Topic's words take its bubble's base colour.
    expect(within(cards[0]!).getByText('Housing')).toHaveStyle({ color: '#2563eb' });
    expect(within(cards[0]!).getByText('rent')).toHaveClass('font-semibold');
    expect(cards[0]).toHaveTextContent('Hansard, row 1');
    expect(within(cards[0]!).getByText('Hansard')).toHaveStyle({ color: '#dc2626' });
  });

  it('labels examples by a chosen column, saying when it is empty', async () => {
    const user = userEvent.setup();
    api.queryTopicSegments.mockResolvedValue({
      data: page({ items: [item(0, 96), { ...item(1, 50), metadata: { speaker: null } }] }),
    });
    renderPane();
    await screen.findByText('40 segments in 12 documents');
    await user.click(screen.getByRole('combobox', { name: 'Label each example by' }));
    await user.click(screen.getByRole('option', { name: 'Label: speaker' }));
    const cards = screen.getAllByRole('listitem');
    // The Data Block's name stays; the label replaces the row.
    expect(cards[0]).toHaveTextContent('Hansard, Speaker 0');
    expect(cards[1]).toHaveTextContent('Hansard, (no speaker)');
    expect(cards[1]).not.toHaveTextContent('row 2');
  });

  it('shows Ungrouped passages in random order, with no ranking to choose (issue 362)', async () => {
    renderPane({
      topic: { id: -1, representative_words: [], size: [12], total_size: 12, x: 0, y: 0 },
    });
    expect(await screen.findByText('Ungrouped examples')).toBeInTheDocument();
    expect(api.queryTopicSegments).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ topic_id: -1, order: 'random' }) }),
    );
    expect(screen.queryByRole('radiogroup', { name: 'Examples order' })).not.toBeInTheDocument();
    expect(screen.getByText(/no topic centre to rank them by/)).toBeInTheDocument();
  });

  it('asks for the next page and switches to random order', async () => {
    const user = userEvent.setup();
    renderPane();
    await screen.findByText('1–5 of 12');
    await user.click(screen.getByRole('button', { name: 'More examples' }));
    await waitFor(() => {
      expect(api.queryTopicSegments).toHaveBeenLastCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ page: 2 }) }),
      );
    });
    await user.click(screen.getByRole('radio', { name: 'Random' }));
    await waitFor(() => {
      expect(api.queryTopicSegments).toHaveBeenLastCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ order: 'random', page: 1 }) }),
      );
    });
  });

  it('notes a hidden topic and an older run without similarities', async () => {
    const user = userEvent.setup();
    const onClearFilters = vi.fn();
    const onClose = vi.fn();
    api.queryTopicSegments.mockResolvedValue({
      data: page({ has_similarity: false, items: [item(0, null)] }),
    });
    renderPane({ filteredOut: true, onClearFilters, onClose });

    expect(await screen.findByText(/Run Topic Modelling again to rank them/)).toBeInTheDocument();
    expect(screen.queryByText(/^Top \d+%$/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Topic 3 is hidden by the current search or lasso/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearFilters).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Stop showing examples' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
