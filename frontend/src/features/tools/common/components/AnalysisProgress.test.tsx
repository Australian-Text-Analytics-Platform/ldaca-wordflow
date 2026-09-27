import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { NativeTask } from '@/features/project/api';
import { AnalysisProgress } from './AnalysisProgress';

it('uses task stages and supplied progress, and forwards cancellation once', () => {
  const cancel = vi.fn();
  const task: NativeTask = {
    id: 'task',
    label: 'Concordance: Concordance 1',
    state: 'running',
    created_at: Date.now() - 5000,
    started_at: Date.now() - 3000,
    finished_at: null,
    progress: { message: 'Reading documents', fraction: null },
    error: null,
  };
  const view = render(<AnalysisProgress name="Concordance 1" task={task} onCancel={cancel} />);
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('value');
  expect(screen.getByRole('status')).toHaveTextContent('Reading documents');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(cancel).toHaveBeenCalledOnce();
  view.rerender(
    <AnalysisProgress
      name="Concordance 1"
      task={{ ...task, state: 'cancelling', progress: { message: 'Counting', fraction: 0.25 } }}
      onCancel={cancel}
    />,
  );
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0.25');
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
});
it('offers retry without a spinner or notification on result-loading failure', () => {
  const retry = vi.fn();
  render(
    <AnalysisProgress name="Frequency 1" message="Could not load results." error onRetry={retry} />,
  );
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledOnce();
});
