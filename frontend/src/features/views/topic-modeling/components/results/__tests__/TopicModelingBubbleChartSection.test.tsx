import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TopicModelingBubbleChartSection } from '../TopicModelingBubbleChartSection';
import { topicChartWidth } from '../topicChartLayout';
import { buildTopicsCSV } from '../topicModelingCsv';
import type { TopicBubbleModel } from '../topicModelingGraph';

vi.mock('../TopicModelingFlowChart', () => ({
  TopicModelingFlowChart: ({
    lassoMode,
    lassoFilterActive,
    onToggleLassoMode,
    onClearLassoFilter,
    onAddLassoTopics,
    bubbles,
  }: {
    lassoMode: boolean;
    lassoFilterActive: boolean;
    onToggleLassoMode: () => void;
    onClearLassoFilter: () => void;
    onAddLassoTopics: (ids: Set<number>) => void;
    bubbles: TopicBubbleModel[];
  }) => (
    <div data-testid="topic-flow-chart">
      <span>{lassoMode ? 'lasso enabled' : 'pan enabled'}</span>
      <span>
        Hovered topics: {bubbles.filter((bubble) => bubble.hovered).map((bubble) => bubble.id)}
      </span>
      <button type="button" onClick={onToggleLassoMode}>
        Toggle lasso
      </button>
      <button type="button" onClick={() => onAddLassoTopics(new Set([0]))}>
        Lasso zero
      </button>
      <button type="button" onClick={() => onAddLassoTopics(new Set([1]))}>
        Lasso one
      </button>
      <button type="button" disabled={!lassoFilterActive} onClick={onClearLassoFilter}>
        Clear filter
      </button>
    </div>
  ),
}));

vi.mock('../TopicSelectionPanel', () => ({
  TopicSelectionPanel: ({
    lassoTopicIds,
    onHoveredTopicChange,
  }: {
    lassoTopicIds: Set<number>;
    onHoveredTopicChange: (topicId: number | null) => void;
  }) => (
    <div data-testid="topic-selection-panel">
      <span>Lasso topics: {[...lassoTopicIds].join(',')}</span>
      <button type="button" onMouseEnter={() => onHoveredTopicChange(0)}>
        Hover topic zero
      </button>
      <button type="button" onMouseEnter={() => onHoveredTopicChange(null)}>
        Leave topic zero
      </button>
    </div>
  ),
}));

const commonProps = {
  selectedTopicIds: new Set<number>(),
  onToggleTopicSelection: vi.fn(),
  onClearSelection: vi.fn(),
  topicSearchQuery: '',
  onTopicSearchQueryChange: vi.fn(),
  corpusSizes: [100, 100],
  panelNodeIds: ['a', 'b'],
  nodeColors: { a: '#7c3aed', b: '#dc2626' },
  defaultPalette: ['#7c3aed', '#dc2626'],
  projectionKey: 'analysis-1:1',
  onViewReady: vi.fn(),
};

describe('TopicModelingBubbleChartSection', () => {
  it('keeps list hover local and resets it when the graph projection changes', () => {
    const topic = {
      id: 0,
      representative_words: [{ word: 'alpha', occurrence_count: 4 }],
      size: [4, 0],
      total_size: 4,
      x: 0,
      y: 0,
    };
    const view = render(<TopicModelingBubbleChartSection {...commonProps} topics={[topic]} />);

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Hover topic zero' }));
    expect(screen.getByText('Hovered topics: 0')).toBeInTheDocument();

    view.rerender(
      <TopicModelingBubbleChartSection
        {...commonProps}
        projectionKey="analysis-1:2"
        topics={[topic]}
      />,
    );
    expect(screen.getByText('Hovered topics:')).toBeInTheDocument();
  });

  it('keeps lasso mode sticky and unions repeated lasso results until cleared', () => {
    const view = render(<TopicModelingBubbleChartSection {...commonProps} topics={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle lasso' }));
    expect(screen.getByText('lasso enabled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lasso zero' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lasso one' }));
    expect(screen.getByText('Lasso topics: 0,1')).toBeInTheDocument();

    view.rerender(<TopicModelingBubbleChartSection {...commonProps} topics={[]} />);
    expect(screen.getByText('Lasso topics: 0,1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(screen.getByText('Lasso topics:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filter' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Lasso zero' }));

    view.rerender(
      <TopicModelingBubbleChartSection {...commonProps} projectionKey="analysis-1:2" topics={[]} />,
    );
    expect(screen.getByText('lasso enabled')).toBeInTheDocument();
    expect(screen.getByText('Lasso topics:')).toBeInTheDocument();
  });

  it('exports complete counted candidates in one topic row', () => {
    const csv = buildTopicsCSV(
      [
        {
          id: 1,
          representative_words: [
            { word: 'climate', occurrence_count: 8 },
            { word: 'policy', occurrence_count: 5 },
          ],
          size: [4],
          total_size: 4,
          x: 0,
          y: 0,
        },
      ],
      new Set(),
      ['Corpus'],
    );

    expect(csv).toContain('climate (8), policy (5)');
    expect(csv.split('\r\n')).toHaveLength(2);
  });
});

/** Gives the chart layout wrapper a size, as the browser would. */
const sizeChartLayout = (width: number, height: number) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const box =
      this.dataset.testid === 'topic-chart-layout' ? { width, height } : { width: 0, height: 0 };
    return {
      ...box,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: box.width,
      bottom: box.height,
      toJSON: () => box,
    };
  });

describe('topic chart layout (issue 433)', () => {
  it('makes the chart 4:3 of its height, or the dragged share, leaving the side its minimum', () => {
    expect(topicChartWidth({ width: 1400, height: 480 }, null)).toBe(640);
    expect(topicChartWidth({ width: 900, height: 480 }, null)).toBe(552);
    expect(topicChartWidth({ width: 1400, height: 200 }, null)).toBe(420);
    expect(topicChartWidth({ width: 1400, height: 480 }, 0.5)).toBe(700);
    expect(topicChartWidth({ width: 1400, height: 480 }, 0.99)).toBe(1052);
  });

  it('puts the legend and settings beside a 4:3 chart on a wide card', () => {
    const spy = sizeChartLayout(1400, 480);
    const onChartLayoutChange = vi.fn();
    render(
      <TopicModelingBubbleChartSection
        {...commonProps}
        topics={[]}
        nodeNames={['A', 'B']}
        controlRowSlot={({ placementToggle }) => (
          <section>Display options{placementToggle}</section>
        )}
        onChartLayoutChange={onChartLayoutChange}
      />,
    );
    expect(screen.getByTestId('topic-chart-layout')).toHaveAttribute(
      'data-settings-placement',
      'side',
    );
    const side = screen.getByTestId('topic-chart-side');
    expect(within(side).getByText('Display options')).toBeInTheDocument();
    expect(within(side).getByRole('group', { name: 'Bubble colours by Data Block' })).toBeVisible();
    expect(screen.getByTestId('topic-chart-column')).toHaveStyle({
      width: '640px',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Move the options below the chart' }));
    expect(onChartLayoutChange).toHaveBeenLastCalledWith({
      placement: 'below',
      chartShare: null,
    });
    const divider = screen.getByTestId('topic-chart-divider');
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    expect(onChartLayoutChange.mock.lastCall?.[0].chartShare).toBeCloseTo(710 / 1400, 3);
    fireEvent.doubleClick(divider);
    expect(onChartLayoutChange).toHaveBeenLastCalledWith({
      placement: 'side',
      chartShare: null,
    });
    spy.mockRestore();
  });

  it('keeps the settings below when chosen, and on a narrow card without the choice', () => {
    const spy = sizeChartLayout(1400, 480);
    const view = render(
      <TopicModelingBubbleChartSection
        {...commonProps}
        topics={[]}
        controlRowSlot={({ placementToggle }) => (
          <section>Display options{placementToggle}</section>
        )}
        chartLayout={{ placement: 'below', chartShare: 0.5 }}
        onChartLayoutChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('topic-chart-side')).not.toBeInTheDocument();
    expect(screen.getByText('Display options')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Move the options beside the chart' }),
    ).toBeInTheDocument();
    view.unmount();
    spy.mockRestore();

    const narrow = sizeChartLayout(600, 400);
    render(
      <TopicModelingBubbleChartSection
        {...commonProps}
        topics={[]}
        controlRowSlot={({ placementToggle }) => (
          <section>Display options{placementToggle}</section>
        )}
        onChartLayoutChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('topic-chart-layout')).toHaveAttribute(
      'data-settings-placement',
      'below',
    );
    expect(screen.queryByRole('button', { name: /Move the options/ })).not.toBeInTheDocument();
    narrow.mockRestore();
  });
});
