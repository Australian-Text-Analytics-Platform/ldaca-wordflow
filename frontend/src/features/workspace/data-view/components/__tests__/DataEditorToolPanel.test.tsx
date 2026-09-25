import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataEditorToolStore } from '../../dataEditorToolStore';
import { DataEditorToolPanel } from '../DataEditorToolPanel';

const mocks = vi.hoisted(() => ({ applyEdit: vi.fn() }));

vi.mock('@/features/workspace/common/hooks/useWorkspaceActions', () => ({
  useWorkspaceActions: () => ({ applyEdit: mocks.applyEdit }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const open = (
  tool: Parameters<ReturnType<typeof useDataEditorToolStore.getState>['open']>[0],
  column: string | null = null,
) => {
  act(() => {
    useDataEditorToolStore.getState().open(tool, 'node-1', {
      nodeName: 'speeches',
      columns: ['id', 'text', 'party'],
      column,
    });
  });
};

describe('DataEditorToolPanel (issue 143)', () => {
  beforeEach(() => {
    mocks.applyEdit.mockReset().mockResolvedValue({});
    act(() => {
      useDataEditorToolStore.getState().close();
    });
  });

  it('previews a pre-filled duplicate without marking it unfinished, then applies it', async () => {
    const user = userEvent.setup();
    open('duplicate', 'text');
    render(<DataEditorToolPanel />);

    await waitFor(() => {
      expect(useDataEditorToolStore.getState().request).toEqual({
        kind: 'duplicate_column',
        column: 'text',
      });
    });
    expect(useDataEditorToolStore.getState().dirty).toBe(false);
    expect(useDataEditorToolStore.getState().highlightColumns).toEqual(['text copy']);
    act(() => {
      useDataEditorToolStore.getState().setChangedRows(312);
    });
    expect(screen.getByRole('status')).toHaveTextContent('312 rows changed');

    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(mocks.applyEdit).toHaveBeenCalledWith('node-1', {
      kind: 'duplicate_column',
      column: 'text',
    });
    await waitFor(() => {
      expect(useDataEditorToolStore.getState().tool).toBeNull();
    });
  });

  it('marks the tool unfinished once the user edits it and waits for a complete form', async () => {
    const user = userEvent.setup();
    open('find_replace', 'text');
    render(<DataEditorToolPanel />);

    expect(screen.getByRole('status')).toHaveTextContent('Complete the settings');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await user.type(screen.getByLabelText('Find (regular expression)'), 'a');

    await waitFor(() => {
      expect(useDataEditorToolStore.getState().request).toMatchObject({
        kind: 'replace',
        source_column: 'text',
        pattern: 'a',
      });
    });
    expect(useDataEditorToolStore.getState().dirty).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Show Project Graph' }));
    expect(useDataEditorToolStore.getState().graphVisible).toBe(true);
  });
});
