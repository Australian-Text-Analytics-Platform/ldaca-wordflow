import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

import { WorkspaceControls } from '../WorkspaceControls';

vi.mock('@/features/workspace/common/hooks/useWorkspaceData', () => ({
  /**
   * Supplies workspace identity and graph roots consumed by `WorkspaceControls`.
   */
  useWorkspaceData: () => ({
    currentWorkspace: { id: 'ws-1', name: 'Main Project' },
    currentWorkspaceId: 'ws-1',
    workspaces: [{ id: 'ws-1', name: 'Main Project' }],
  }),
}));

vi.mock('@/features/workspace/task-stream/useWorkspaceTaskInbox', () => ({
  useTaskResources: () => ({ tasks: [], error: null }),
}));

vi.mock('@/features/workspace/common/hooks/useWorkspaceActions', () => ({
  /** Used by: WorkspaceControls tests to provide action spies. */
  useWorkspaceActions: () => ({
    renameWorkspace: vi.fn(),
  }),
}));

describe('WorkspaceControls', () => {
  it('keeps project identity actions in the header and leaves deletion to the graph toolbar', () => {
    render(
      <TooltipProvider>
        <WorkspaceControls />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Rename project' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Change Project/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
