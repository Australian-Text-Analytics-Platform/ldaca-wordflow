import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Api from '@/api';
import type { WorkspaceNodeInfo } from '@/api';
import { AnnotationSavedLabelsNotice } from '../AnnotationSavedLabelsNotice';
import { savedLabelBlocks } from '../savedLabelBlocks';

const mocks = vi.hoisted(() => ({ apply: vi.fn(), deleteNode: vi.fn() }));

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  applyAnnotationLabels: mocks.apply,
}));
vi.mock('@/features/workspace/common/hooks/useWorkspaceActions', () => ({
  useWorkspaceActions: () => ({ deleteNode: mocks.deleteNode }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const labelBlock = (sourceId: string) =>
  ({
    id: 'labels-1',
    name: 'tweets · annotation in progress',
    shape: [312, 2],
    provenance: {
      type: 'derivation',
      operation: {
        kind: 'annotation',
        annotation_column: 'stance',
        provider: 'openai',
        model: 'm',
      },
      inputs: [{ role: 'source', value: { type: 'node', node_id: sourceId } }],
    },
  }) as unknown as WorkspaceNodeInfo;
const plainBlock = {
  id: 'tweets',
  name: 'tweets',
  provenance: { type: 'source' },
} as unknown as WorkspaceNodeInfo;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('AnnotationSavedLabelsNotice (issue 371)', () => {
  beforeEach(() => {
    mocks.apply.mockReset().mockResolvedValue({
      data: { node_id: 'tweets', annotation_column: 'stance', written_rows: 900 },
    });
    mocks.deleteNode.mockReset().mockResolvedValue(undefined);
  });

  it('finds the label blocks of this Data Block only', () => {
    expect(
      savedLabelBlocks([plainBlock, labelBlock('tweets'), labelBlock('other')], 'tweets'),
    ).toEqual([
      { id: 'labels-1', name: 'tweets · annotation in progress', column: 'stance', labels: 312 },
    ]);
  });

  it('writes the saved labels, then offers to remove the block', async () => {
    const user = userEvent.setup();
    render(
      <AnnotationSavedLabelsNotice
        workspaceId="ws"
        nodes={[plainBlock, labelBlock('tweets')]}
        sourceNodeId="tweets"
        running={false}
      />,
      { wrapper },
    );
    expect(screen.getByText(/312 labels from a run that didn't finish/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Write them into/ }));
    expect(mocks.apply).toHaveBeenCalledWith({
      path: { workspace_id: 'ws', node_id: 'labels-1' },
      throwOnError: true,
    });
    await screen.findByText(/The saved labels are in "stance" now/);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(mocks.deleteNode).toHaveBeenCalledWith('labels-1');
    });
  });

  it('asks before removing labels not written yet, and says they are kept while running', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AnnotationSavedLabelsNotice
        workspaceId="ws"
        nodes={[labelBlock('tweets')]}
        sourceNodeId="tweets"
        running={false}
      />,
      { wrapper },
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mocks.deleteNode).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/Removing it loses them/);
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(mocks.deleteNode).not.toHaveBeenCalled();

    rerender(
      <AnnotationSavedLabelsNotice
        workspaceId="ws"
        nodes={[labelBlock('tweets')]}
        sourceNodeId="tweets"
        running
      />,
    );
    expect(screen.getByText(/Labels are kept in .* as they return/)).toBeInTheDocument();
  });
});
