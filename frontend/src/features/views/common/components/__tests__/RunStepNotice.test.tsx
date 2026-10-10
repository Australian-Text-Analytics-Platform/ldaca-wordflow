import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ProgressDetail } from '@/api';
import { TaskLiveness } from '@/components/layout/sidebar/TaskLiveness';
import { useTaskFocusStore } from '@/stores/taskFocusStore';
import { AnalysisRunningStateCard } from '../AnalysisRunningStateCard';

const detail = (overrides: Partial<ProgressDetail> = {}): ProgressDetail => ({
  step: 2,
  steps: 5,
  step_label: 'Reading the text into the model',
  done: 18900,
  total: 114461,
  unit: 'segments',
  eta_seconds: 4800,
  processors_busy: 1.9,
  processors: 2,
  stalled_seconds: 0,
  ...overrides,
});

describe('slow-run progress (issue 350)', () => {
  beforeEach(() => {
    useTaskFocusStore.setState({ taskId: null, requestId: 0 });
  });

  it('shows one calm step line instead of the bar, linking to Tasks', () => {
    render(
      <AnalysisRunningStateCard
        message="Step 2 of 5, reading the text into the model: 18,900 of 114,461 segments"
        progress={0.3}
        detail={detail()}
        taskId="task-1"
      />,
    );

    expect(screen.getByText(/Step 2 of 5: Reading the text into the model\./)).toBeInTheDocument();
    expect(screen.queryByText(/18,900/)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Live progress in Tasks' }));
    expect(useTaskFocusStore.getState()).toMatchObject({ taskId: 'task-1', requestId: 1 });
  });

  it('keeps the message and bar for runs without step detail', () => {
    render(<AnalysisRunningStateCard message="Counting words…" progress={0.6} />);
    expect(screen.getByText('Counting words…')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('says how many processors a run is using', () => {
    render(<TaskLiveness detail={detail()} />);
    expect(screen.getByText('Working: using 1.9 of 2 processors.')).toBeInTheDocument();
  });

  it('notes a run that may be stuck: no progress and idle processors', () => {
    render(<TaskLiveness detail={detail({ processors_busy: 0, stalled_seconds: 900 })} />);
    expect(screen.getByText('Waiting: the processors are idle.')).toBeInTheDocument();
    expect(
      screen.getByText(/No progress for 15 min and the processors are idle/),
    ).toBeInTheDocument();
  });

  it('says an AI annotation run is waiting for its provider (issue 370)', () => {
    const { rerender } = render(
      <TaskLiveness detail={detail({ processors_busy: 0, waiting_for: 'ai_provider' })} />,
    );
    expect(screen.getByText('Waiting for the AI provider.')).toBeInTheDocument();
    rerender(
      <TaskLiveness
        detail={detail({ processors_busy: 0, stalled_seconds: 900, waiting_for: 'ai_provider' })}
      />,
    );
    expect(screen.getByText(/No answer from the AI provider for 15 min\./)).toBeInTheDocument();
  });

  it('does not alarm while a long step keeps the processors busy', () => {
    render(<TaskLiveness detail={detail({ processors_busy: 2, stalled_seconds: 3600 })} />);
    expect(screen.queryByText(/may be stuck/)).not.toBeInTheDocument();
  });
});
