import { render, screen } from '@testing-library/react';
import { expect, it } from 'vite-plus/test';
import { ProjectError } from '@/api/client';
import { useSessionErrors } from '@/features/diagnostics/sessionErrors';
import { RunError } from './RunError';
import type { NativeTask } from '@/features/project/tasksApi';

it('records an accepted failure once when its task arrives and keeps pre-submission failures visible', () => {
  useSessionErrors.getState().clear();
  const props = { tabId: 'tab', name: 'Frequency', active: true, busy: false };
  const error = new ProjectError('Original engine message', '', 'run');
  const view = render(<RunError {...props} tasks={[]} error={error} />);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  const task = {
    id: 'run',
    tab_id: 'tab',
    created_at: 1,
    state: 'failed',
    error: { message: 'Original engine message' },
  } as NativeTask;
  view.rerender(<RunError {...props} tasks={[task]} error={error} />);
  expect(screen.getByRole('alert', { name: 'Could not run Frequency' })).toHaveTextContent(
    'Original engine message',
  );
  view.rerender(<RunError {...props} tasks={[task]} error={error} />);
  expect(useSessionErrors.getState().entries).toHaveLength(1);
  view.rerender(<RunError {...props} tasks={[]} error={new Error('No response received')} />);
  expect(screen.getByRole('alert')).toHaveTextContent('No response received');
});

it('owns unassociated imports from task state and records a failure once across new snapshots', () => {
  useSessionErrors.getState().clear();
  const props = {
    taskLabel: 'Import sample data',
    name: 'Import',
    title: 'Could not import samples',
    active: true,
    busy: false,
    error: null,
  };
  const task = {
    id: 'import',
    label: props.taskLabel,
    created_at: 1,
    state: 'failed',
    error: { message: 'Original import error' },
  } as NativeTask;
  const view = render(<RunError {...props} tasks={[task]} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Original import error');
  view.rerender(<RunError {...props} tasks={[structuredClone(task)]} />);
  expect(useSessionErrors.getState().entries).toHaveLength(1);
  expect(useSessionErrors.getState().entries[0]?.taskId).toBe('import');
  view.rerender(<RunError {...props} active={false} tasks={[task]} />);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
