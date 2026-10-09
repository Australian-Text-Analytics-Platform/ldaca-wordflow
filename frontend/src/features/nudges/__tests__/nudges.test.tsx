import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip';
import { GuidanceContext } from '@/features/guidance/GuidanceContext';
import { NudgeCard } from '../NudgeCard';
import { outlineMissingInputs, outlineNudgeTargets } from '../nudgeHighlight';
import {
  isLargeTopicInput,
  LARGE_INPUT_DOCUMENTS,
  LARGE_INPUT_SEGMENTS,
  topicResultNudge,
} from '../nudges';
import { useNudgeStore } from '../nudgeStore';

/** Lets the outline and card start listening (they wait a tick). */
const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

function Targets() {
  return (
    <>
      <input aria-label="Max topic size" data-nudge-target="topic-max-cluster-size" />
      <button type="button" data-nudge-target="topic-modeling-clear">
        Clear
      </button>
      <button type="button">Elsewhere</button>
    </>
  );
}

beforeEach(() => {
  useNudgeStore.setState({ enabled: true });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Suggestions rules (issue 360)', () => {
  it('prefers a giant topic, then too few topics', () => {
    expect(
      topicResultNudge({ clusterCount: 3, largestTopicSize: 60, clusteredSegments: 100 }),
    ).toBe('topic-giant-topic');
    expect(
      topicResultNudge({ clusterCount: 3, largestTopicSize: 40, clusteredSegments: 100 }),
    ).toBe('topic-few-topics');
    expect(
      topicResultNudge({ clusterCount: 12, largestTopicSize: 40, clusteredSegments: 100 }),
    ).toBeNull();
  });

  it('calls an input large from 60% of the Obesity corpus', () => {
    expect(
      isLargeTopicInput({ documents: LARGE_INPUT_DOCUMENTS, segments: null, topicSampling: false }),
    ).toBe(true);
    expect(
      isLargeTopicInput({ documents: 100, segments: LARGE_INPUT_SEGMENTS, topicSampling: false }),
    ).toBe(true);
    // Topic sampling already samples the segments.
    expect(
      isLargeTopicInput({ documents: 100, segments: LARGE_INPUT_SEGMENTS, topicSampling: true }),
    ).toBe(false);
  });
});

describe('the Suggestions outline', () => {
  it('outlines targets and fades after other actions, not actions on them', async () => {
    render(<Targets />);
    const input = screen.getByLabelText('Max topic size');
    outlineNudgeTargets(['topic-max-cluster-size', 'topic-modeling-clear']);
    expect(input).toHaveAttribute('data-nudge-active', '');
    expect(screen.getByText('Clear')).toHaveAttribute('data-nudge-active', '');
    await tick();

    fireEvent.pointerDown(input);
    fireEvent.pointerDown(screen.getByText('Elsewhere'));
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(input).toHaveAttribute('data-nudge-active', '');
    fireEvent.pointerDown(screen.getByText('Elsewhere'));
    expect(input).toHaveAttribute('data-nudge-active', 'fading');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(input).not.toHaveAttribute('data-nudge-active');
  });

  it('outlines what a disabled control waits for, only with Suggestions on', () => {
    render(<Targets />);
    const input = screen.getByLabelText('Max topic size');
    useNudgeStore.setState({ enabled: false });
    outlineMissingInputs(['topic-max-cluster-size']);
    expect(input).not.toHaveAttribute('data-nudge-active');
    useNudgeStore.setState({ enabled: true });
    outlineMissingInputs(['topic-max-cluster-size']);
    expect(input).toHaveAttribute('data-nudge-active', '');
    expect(input.scrollIntoView).toHaveBeenCalled();
  });

  it('reports a click or key press on a disabled control through its reason wrapper', async () => {
    const onDisabledClick = vi.fn();
    const user = userEvent.setup();
    render(
      <DisabledReasonTooltip reason="Select a tokeniser" onDisabledClick={onDisabledClick}>
        <button type="button" disabled>
          Run
        </button>
      </DisabledReasonTooltip>,
    );
    // The wrapper takes focus for the disabled button; Enter reports it too.
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onDisabledClick).toHaveBeenCalledTimes(1);
  });
});

describe('NudgeCard', () => {
  const startSettingsWalk = vi.fn();
  const renderCard = (occurrence: string) =>
    render(
      <GuidanceContext.Provider
        value={{
          dispatchContextualHintVisit: vi.fn(),
          startGuidedTour: vi.fn(),
          startSettingsWalk,
        }}
      >
        <Targets />
        <NudgeCard id="topic-giant-topic" occurrence={occurrence} />
      </GuidanceContext.Provider>,
    );

  it('shows the suggestion, outlines its settings, and offers the way to turn it off', async () => {
    const user = userEvent.setup();
    renderCard('run-1');
    expect(screen.getByRole('status')).toHaveTextContent('One topic holds most segments');
    expect(screen.getByLabelText('Max topic size')).toHaveAttribute('data-nudge-active', '');

    await user.click(screen.getByRole('button', { name: 'Show me' }));
    expect(screen.getByLabelText('Max topic size').scrollIntoView).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Turn off suggestions…' }));
    expect(startSettingsWalk).toHaveBeenCalledWith('suggestions');
  });

  it('fades after other actions and comes back when the situation happens again', async () => {
    const view = renderCard('run-1');
    await tick();
    for (let i = 0; i < 6; i += 1) fireEvent.pointerDown(screen.getByText('Elsewhere'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    view.rerender(
      <GuidanceContext.Provider
        value={{
          dispatchContextualHintVisit: vi.fn(),
          startGuidedTour: vi.fn(),
          startSettingsWalk,
        }}
      >
        <Targets />
        <NudgeCard id="topic-giant-topic" occurrence="run-2" />
      </GuidanceContext.Provider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('One topic holds most segments');
  });

  it('shows nothing when Suggestions are off', () => {
    useNudgeStore.setState({ enabled: false });
    renderCard('run-1');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Max topic size')).not.toHaveAttribute('data-nudge-active');
  });
});
