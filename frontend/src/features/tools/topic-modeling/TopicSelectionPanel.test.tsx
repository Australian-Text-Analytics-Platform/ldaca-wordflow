import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { TopicSelectionPanel } from './TopicSelectionPanel';

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
