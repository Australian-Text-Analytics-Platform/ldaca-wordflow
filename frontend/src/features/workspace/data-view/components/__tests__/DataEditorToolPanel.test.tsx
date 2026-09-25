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
    await user.type(screen.getByLabelText('Find'), '.');

    // Plain text by default: "." is a dot, not "any character".
    await waitFor(() => {
      expect(useDataEditorToolStore.getState().request).toMatchObject({
        kind: 'replace',
        source_column: 'text',
        pattern: '.',
        literal: true,
      });
    });
    await user.click(screen.getByLabelText('Use regular expression'));
    await waitFor(() => {
      expect(useDataEditorToolStore.getState().request).toMatchObject({ literal: false });
    });
    expect(useDataEditorToolStore.getState().dirty).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Show Project Graph' }));
    expect(useDataEditorToolStore.getState().graphVisible).toBe(true);
  });

  it('builds a Combine template with brace suggestions and the Insert column picker', async () => {
    const user = userEvent.setup();
    open('combine', 'party');
    render(<DataEditorToolPanel />);

    const template = screen.getByLabelText('Template');
    expect(template).toHaveValue('{party}');
    await user.click(template);
    await user.keyboard('{End}: {{te');
    const suggestions = screen.getByRole('listbox', { name: 'Matching columns' });
    expect(suggestions).toHaveTextContent('text');
    await user.keyboard('{Enter}');
    expect(template).toHaveValue('{party}: {text}');
    expect(screen.queryByRole('listbox', { name: 'Matching columns' })).not.toBeInTheDocument();

    await user.keyboard(' #');
    await user.click(screen.getByRole('combobox', { name: 'Insert column' }));
    await user.keyboard('id{Enter}');
    await waitFor(() => {
      expect(template).toHaveValue('{party}: {text} #{id}');
    });
    await user.type(screen.getByLabelText('New column name'), 'label');
    await user.click(screen.getByLabelText('Leave the combined value empty'));

    await waitFor(() => {
      expect(useDataEditorToolStore.getState().request).toEqual({
        kind: 'combine_columns',
        parts: [
          { kind: 'column', column: 'party' },
          { kind: 'text', text: ': ' },
          { kind: 'column', column: 'text' },
          { kind: 'text', text: ' #' },
          { kind: 'column', column: 'id' },
        ],
        output_column: 'label',
        empty_values: 'empty_result',
      });
    });
    expect(screen.getByText(/Uses party, text, id/)).toBeInTheDocument();
    act(() => {
      useDataEditorToolStore.getState().setPreviewSample('Labor: Hello #1');
    });
    expect(screen.getByText(/First row on this page/)).toHaveTextContent('Labor: Hello #1');
  });

  it('flags template columns that are not on the Data Block', async () => {
    const user = userEvent.setup();
    open('combine');
    render(<DataEditorToolPanel />);

    await user.type(screen.getByLabelText('Template'), '{{nope}');
    expect(screen.getByText(/Not a column on this Data Block: nope/)).toBeInTheDocument();
    expect(useDataEditorToolStore.getState().request).toBeNull();
  });

  it("starts in the tool's first field", () => {
    open('combine');
    render(<DataEditorToolPanel />);
    expect(screen.getByLabelText('Template')).toHaveFocus();
  });
});
