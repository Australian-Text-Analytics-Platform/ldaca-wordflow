import type React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { TopicSelectionPanel } from '../TopicSelectionPanel';

const topics = [
  {
    id: 0,
    representative_words: [{ word: 'alpha', occurrence_count: 4 }],
    size: [4],
    total_size: 4,
    x: 0,
    y: 0,
  },
  {
    id: 1,
    representative_words: [{ word: 'beta', occurrence_count: 3 }],
    size: [3],
    total_size: 3,
    x: 1,
    y: 1,
  },
  {
    id: 2,
    representative_words: [{ word: 'alphabet', occurrence_count: 2 }],
    size: [2],
    total_size: 2,
    x: 2,
    y: 2,
  },
];
const corpusPresentation = {
  corpusCount: 0,
  panelNodeIds: [],
  nodeColors: {},
  defaultPalette: [],
};

type PanelProps = React.ComponentProps<typeof TopicSelectionPanel>;

function panelProps(overrides: Partial<PanelProps> = {}): PanelProps {
  return {
    topics,
    selectedTopicIds: new Set(),
    onToggleTopicSelection: vi.fn(),
    onClearSelection: vi.fn(),
    topicSearchQuery: '',
    lassoTopicIds: new Set(),
    corpusPresentation,
    hoveredTopicId: null,
    onHoveredTopicChange: vi.fn(),
    shownTopicId: null,
    onToggleShownTopic: vi.fn(),
    onClearFilters: vi.fn(),
    ...overrides,
  };
}

describe('TopicSelectionPanel', () => {
  it('keeps selected topics listed, dimmed when the filters hide them (#353)', () => {
    render(
      <TopicSelectionPanel
        {...panelProps({
          selectedTopicIds: new Set([1]),
          topicSearchQuery: 'alpha',
          lassoTopicIds: new Set([0, 1, 2]),
        })}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Topics 2 / 3' })).toBeInTheDocument();
    const selected = screen.getByRole('list', { name: 'Selected topics' });
    expect(within(selected).getByText('Topic 1')).toBeInTheDocument();
    expect(within(selected).getByRole('listitem')).toHaveClass('opacity-50');
    const others = screen.getByRole('list', { name: 'Other topics' });
    expect(
      within(others)
        .getAllByRole('listitem')
        .map((item) => item.getAttribute('data-topic-id')),
    ).toEqual(['0', '2']);
    expect(screen.getByText('Selected 1')).toBeInTheDocument();
    expect(screen.getByText('Others 2')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('lists the latest selected topic first', () => {
    render(<TopicSelectionPanel {...panelProps({ selectedTopicIds: new Set([0, 2, 1]) })} />);

    const selected = screen.getByRole('list', { name: 'Selected topics' });
    expect(
      within(selected)
        .getAllByRole('listitem')
        .map((item) => item.getAttribute('data-topic-id')),
    ).toEqual(['1', '2', '0']);
  });

  it('counts every topic when nothing filters them', () => {
    const onHoveredTopicChange = vi.fn();
    const onToggleTopicSelection = vi.fn();
    render(
      <TopicSelectionPanel {...panelProps({ onHoveredTopicChange, onToggleTopicSelection })} />,
    );

    expect(screen.getByRole('heading', { name: 'Topics 3' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Selected topics' })).not.toBeInTheDocument();

    const topicRow = screen.getByRole('button', { name: 'Select Topic 0' });
    fireEvent.mouseEnter(topicRow);
    fireEvent.mouseLeave(topicRow);
    expect(onHoveredTopicChange).toHaveBeenNthCalledWith(1, 0);
    expect(onHoveredTopicChange).toHaveBeenNthCalledWith(2, null);
    fireEvent.click(topicRow);
    expect(onToggleTopicSelection).toHaveBeenCalledWith(0);
  });

  it('shows and stops showing examples from the eye at the tail of a card (#353)', () => {
    const onToggleShownTopic = vi.fn();
    const onToggleTopicSelection = vi.fn();
    const { rerender } = render(
      <TopicSelectionPanel {...panelProps({ onToggleShownTopic, onToggleTopicSelection })} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show examples of Topic 2' }));
    expect(onToggleShownTopic).toHaveBeenCalledWith(2);
    expect(onToggleTopicSelection).not.toHaveBeenCalled();

    rerender(
      <TopicSelectionPanel
        {...panelProps({ onToggleShownTopic, onToggleTopicSelection, shownTopicId: 2 })}
      />,
    );
    const eye = screen.getByRole('button', { name: 'Stop showing Topic 2' });
    expect(eye).toHaveAttribute('aria-pressed', 'true');
    expect(eye).toHaveClass('bg-button');
  });

  it('resizes the list beside the examples with the divider (#353)', () => {
    window.localStorage.removeItem('ldaca.layout.topicListShare');
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <TopicSelectionPanel
          {...panelProps({
            examples: {
              workspaceId: 'ws-1',
              analysisId: 'analysis-1',
              clusterCount: 3,
              nodeNames: ['Hansard'],
              colorScheme: null,
            },
          })}
        />
      </QueryClientProvider>,
    );

    const divider = screen.getByRole('separator', { name: 'Resize the topic list and examples' });
    expect(divider).toHaveAttribute('aria-valuenow', '33');
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    expect(divider).toHaveAttribute('aria-valuenow', '38');
    expect(window.localStorage.getItem('ldaca.layout.topicListShare')).toBe('0.383');
    fireEvent.doubleClick(divider);
    expect(divider).toHaveAttribute('aria-valuenow', '33');
    expect(window.localStorage.getItem('ldaca.layout.topicListShare')).toBeNull();
  });

  it('picks out the matching words in bold orange, with all words in a tooltip (issue 342)', async () => {
    render(
      <TopicSelectionPanel
        {...panelProps({ topicSearchQuery: 'famil*' })}
        topics={[
          {
            id: 5,
            representative_words: [
              { word: 'care', occurrence_count: 6 },
              { word: 'family', occurrence_count: 5 },
              { word: 'familiarisation', occurrence_count: 2 },
            ],
            size: [6],
            total_size: 6,
            x: 0,
            y: 0,
          },
        ]}
      />,
    );

    const line = screen.getByText('care', { exact: false });
    expect(line).toHaveTextContent('care, family, familiarisation');
    for (const word of ['family', 'familiarisation']) {
      const highlighted = within(line).getByText(word);
      expect(highlighted).toHaveAttribute('data-matched-word');
      expect(highlighted).toHaveClass('font-semibold', 'text-chart-4');
    }

    fireEvent.focus(line);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('care, family, familiarisation');
  });
});
