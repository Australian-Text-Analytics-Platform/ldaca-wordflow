import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vite-plus/test';
import { TopicSelectionPanel } from './TopicSelectionPanel';
import { topicEligibility } from './topicSearch';
import { buildTopicBubbleModels } from './topicModelingGraph';

it('shares graph eligibility, keeps excluded selections faded and puts the latest selection first', () => {
  const topics = [1, 2].map((id) => ({
    id,
    x: id,
    y: 0,
    size: [id],
    total_size: id,
    representative_words: [{ word: id === 1 ? 'alpha' : 'beta', occurrence_count: 1 }],
  }));
  const selected = new Set([2, 1]);
  const projection = topicEligibility(topics, 'alp*', new Set([1]));
  render(
    <TopicSelectionPanel
      canPublish
      topics={topics}
      selectedTopicIds={selected}
      onToggleTopicSelection={vi.fn()}
      onClearSelection={vi.fn()}
      topicSearchQuery="alp*"
      onTopicSearchQueryChange={vi.fn()}
      lassoTopicIds={new Set([1])}
      corpusPresentation={{ corpusCount: 1, panelNodeIds: [], nodeColors: {}, defaultPalette: [] }}
      hoveredTopicId={null}
      onHoveredTopicChange={vi.fn()}
      eligibility={projection}
    />,
  );
  const selectedPanel = screen.getByRole('heading', { name: 'Selected Topics (2)' }).parentElement
    ?.parentElement;
  if (!selectedPanel) throw new Error('Missing selected Topics');
  expect(
    within(selectedPanel)
      .getAllByRole('button')
      .slice(1)
      .map((button) => button.getAttribute('aria-label')),
  ).toEqual(['Remove topic 1', 'Remove topic 2']);
  expect(screen.getByRole('button', { name: 'Remove topic 2' }).parentElement).toHaveClass(
    'opacity-40',
  );
  expect(within(selectedPanel).getByText('alpha', { selector: 'mark' })).toBeInTheDocument();
  const bubbles = buildTopicBubbleModels({
    topics,
    corpusSizes: [3],
    panelNodeIds: [],
    nodeColors: {},
    defaultPalette: [],
    selectedTopicIds: selected,
    lassoTopicIds: new Set([1]),
    hoveredTopicId: null,
    topicSearchQuery: 'alp*',
    eligibility: projection,
  });
  expect(bubbles.filter((bubble) => !bubble.filteredOut).map((bubble) => bubble.id)).toEqual([1]);
  expect(bubbles.find((bubble) => bubble.id === 1)?.highlightedWords).toEqual(new Set(['alpha']));
});

it('exposes selection and document inspection as independent keyboard controls', async () => {
  const select = vi.fn();
  const inspect = vi.fn();
  render(
    <TopicSelectionPanel
      canPublish
      topics={[{ id: 1, x: 0, y: 0, size: [4], total_size: 4, representative_words: [] }]}
      selectedTopicIds={new Set()}
      onToggleTopicSelection={select}
      onInspect={inspect}
      onClearSelection={vi.fn()}
      topicSearchQuery=""
      onTopicSearchQueryChange={vi.fn()}
      lassoTopicIds={new Set()}
      hoveredTopicId={null}
      onHoveredTopicChange={vi.fn()}
      corpusPresentation={{ corpusCount: 1, panelNodeIds: [], nodeColors: {}, defaultPalette: [] }}
    />,
  );
  const user = userEvent.setup();
  const selection = screen.getByRole('button', { name: /^Topic 1/ });
  const inspection = screen.getByRole('button', { name: 'View documents for topic 1' });
  expect(within(selection).queryByRole('button')).not.toBeInTheDocument();
  selection.focus();
  await user.keyboard('{Enter}');
  expect(select).toHaveBeenCalledExactlyOnceWith(1);
  await user.tab();
  expect(inspection).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(inspect).toHaveBeenCalledExactlyOnceWith(1);
  expect(select).toHaveBeenCalledTimes(1);
});
