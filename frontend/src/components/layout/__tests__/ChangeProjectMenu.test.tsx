import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChangeProjectMenu } from '../ChangeProjectMenu';

const mocks = vi.hoisted(() => ({
  setCurrentWorkspace: vi.fn(),
  tasks: [] as Record<string, unknown>[],
}));

vi.mock('@/features/workspace/common/hooks/useWorkspaceData', () => ({
  useWorkspaceData: () => ({
    currentWorkspace: { id: 'ws-1', name: 'Main Project' },
    currentWorkspaceId: 'ws-1',
    workspaces: [
      { id: 'ws-1', name: 'Main Project' },
      { id: 'ws-2', name: 'Hansard' },
    ],
  }),
}));
vi.mock('@/features/workspace/common/hooks/useWorkspaceActions', () => ({
  useWorkspaceActions: () => ({ setCurrentWorkspace: mocks.setCurrentWorkspace }),
}));
vi.mock('@/features/workspace/task-stream/useWorkspaceTaskInbox', () => ({
  useTaskResources: () => ({ tasks: mocks.tasks, error: null }),
}));

describe('ChangeProjectMenu (issue 192)', () => {
  beforeEach(() => {
    mocks.setCurrentWorkspace.mockReset();
    mocks.setCurrentWorkspace.mockResolvedValue(undefined);
    mocks.tasks = [];
  });

  it('lists the other projects and switches after confirmation', async () => {
    const user = userEvent.setup();
    render(<ChangeProjectMenu />);

    await user.click(screen.getByRole('button', { name: /Change Project/ }));
    expect(screen.queryByRole('menuitem', { name: 'Main Project' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Hansard' }));

    expect(screen.getByRole('alertdialog', { name: 'Switch to “Hansard”?' })).toHaveTextContent(
      '“Main Project” is saved automatically and will be closed.',
    );
    expect(mocks.setCurrentWorkspace).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Switch' }));

    await waitFor(() => {
      expect(mocks.setCurrentWorkspace).toHaveBeenCalledWith('ws-2');
    });
  });

  it('disables every project while a task is running, and says why', async () => {
    mocks.tasks = [
      { resource_type: 'analysis', workspace_id: 'ws-1', state: 'running', task_id: 'a' },
    ];
    const user = userEvent.setup();
    render(<ChangeProjectMenu />);

    await user.click(screen.getByRole('button', { name: /Change Project/ }));

    expect(screen.getByRole('note')).toHaveTextContent(
      'A task is still running in “Main Project”. Wait for it to finish, or stop it in its tab, before switching projects.',
    );
    expect(screen.getByRole('menuitem', { name: 'Hansard' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
