import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
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
  // Radix Select needs pointer capture, which jsdom lacks.
  beforeAll(() => {
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  beforeEach(() => {
    mocks.applyEdit.mockReset().mockResolvedValue({});
    act(() => {
      useDataEditorToolStore.getState().close();
    });
  });

  it('previews a pre-filled duplicate without marking it unfinished, then applies it', async () => {
    const user = userEvent.setup();
    open('duplicate', 'text');
    render(<DataEditorToolPanel />, { wrapper: TooltipProvider });

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
    // The tool stays open on the same column for the next edit (issue 217).
    await waitFor(() => {
      expect(useDataEditorToolStore.getState().initialColumn).toBe('text');
    });
    expect(useDataEditorToolStore.getState().tool).toBe('duplicate');
    expect(useDataEditorToolStore.getState().dirty).toBe(false);
  });

  it('stays open after Apply on the same column; Cancel starts over and Close closes (issue 217)', async () => {
    const user = userEvent.setup();
    act(() => {
      useDataEditorToolStore.getState().open('clean_text', 'node-1', {
        nodeName: 'speeches',
        columns: ['id', 'text', 'party'],
        column: 'text',
        operation: 'remove_digits',
      });
    });
    // Mounted like WorkspaceView: a new form key remounts a fresh form.
    function KeyedPanel() {
      const tool = useDataEditorToolStore((state) => state.tool);
      const formKey = useDataEditorToolStore((state) => state.formKey);
      return tool ? <DataEditorToolPanel key={`${tool}-${String(formKey)}`} /> : null;
    }
    render(<KeyedPanel />, { wrapper: TooltipProvider });

    await user.click(screen.getByLabelText('A new column, right of it'));
    await waitFor(() => {
      expect(useDataEditorToolStore.getState().request).toMatchObject({
        output_column: 'text cleaned',
      });
    });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(useDataEditorToolStore.getState().request).toEqual({
        kind: 'clean_text',
        column: 'text',
        operation: 'remove_digits',
        output_column: null,
      });
    });
    expect(useDataEditorToolStore.getState().tool).toBe('clean_text');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    act(() => {
      useDataEditorToolStore.getState().setChangedRows(3);
    });
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(mocks.applyEdit).toHaveBeenCalledWith('node-1', {
      kind: 'clean_text',
      column: 'text',
      operation: 'remove_digits',
      output_column: null,
    });
    // The fresh form previews again before Apply is offered (issue 285).
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Previewing…');
    });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    act(() => {
      useDataEditorToolStore.getState().setChangedRows(0);
    });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
    expect(useDataEditorToolStore.getState()).toMatchObject({
      tool: 'clean_text',
      initialColumn: 'text',
      initialOperation: 'remove_digits',
      dirty: false,
    });

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(useDataEditorToolStore.getState().tool).toBeNull();
  });

  it('keeps the Clean text operation just applied rather than the starting one (issue 230)', async () => {
    const user = userEvent.setup();
    act(() => {
      useDataEditorToolStore.getState().open('clean_text', 'node-1', {
        nodeName: 'speeches',
        columns: ['id', 'text', 'party'],
        column: 'text',
        operation: 'title_case',
      });
    });
    function KeyedPanel() {
      const tool = useDataEditorToolStore((state) => state.tool);
      const formKey = useDataEditorToolStore((state) => state.formKey);
      return tool ? <DataEditorToolPanel key={`${tool}-${String(formKey)}`} /> : null;
    }
    render(<KeyedPanel />, { wrapper: TooltipProvider });

    await user.click(screen.getByRole('combobox', { name: 'Cleaning' }));
    await user.click(screen.getByRole('option', { name: 'lowercase' }));
    act(() => {
      useDataEditorToolStore.getState().setChangedRows(1);
    });
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(mocks.applyEdit).toHaveBeenCalledWith(
      'node-1',
      expect.objectContaining({ operation: 'lowercase' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Cleaning' })).toHaveTextContent('lowercase');
    });
    expect(useDataEditorToolStore.getState().dirty).toBe(false);
  });

  it('marks the tool unfinished once the user edits it and waits for a complete form', async () => {
    const user = userEvent.setup();
    open('find_replace', 'text');
    render(<DataEditorToolPanel />, { wrapper: TooltipProvider });

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
    render(<DataEditorToolPanel />, { wrapper: TooltipProvider });

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
    render(<DataEditorToolPanel />, { wrapper: TooltipProvider });

    await user.type(screen.getByLabelText('Template'), '{{nope}');
    expect(screen.getByText(/Not a column on this Data Block: nope/)).toBeInTheDocument();
    expect(useDataEditorToolStore.getState().request).toBeNull();
  });

  it("starts in the tool's first field", () => {
    open('combine');
    render(<DataEditorToolPanel />, { wrapper: TooltipProvider });
    expect(screen.getByLabelText('Template')).toHaveFocus();
  });

  it('fills the suggested Count column name on Tab so it can be edited (issue 156)', async () => {
    const user = userEvent.setup();
    open('count', 'text');
    render(<DataEditorToolPanel />, { wrapper: TooltipProvider });

    const name = screen.getByLabelText('New column name');
    expect(name).toHaveValue('');
    expect(name).toHaveAttribute('placeholder', 'text word count');
    await user.click(name);
    await user.keyboard('{Tab}');
    expect(name).toHaveValue('text word count');
    expect(name).toHaveFocus();
    await user.keyboard('s');
    expect(name).toHaveValue('text word counts');
  });

  it('adds split delimiters as chips on Enter, without duplicates (issue 163)', async () => {
    const user = userEvent.setup();
    open('split', 'text');
    render(<DataEditorToolPanel />, { wrapper: TooltipProvider });

    expect(screen.getByLabelText('Number of columns')).toHaveValue(2);
    const input = screen.getByLabelText('Delimiters');
    await user.click(input);
    await user.keyboard('; {Enter}');
    await user.keyboard(';{Enter}');
    await user.keyboard(' {Enter}');
    await user.keyboard(';{Enter}');
    await user.keyboard('::{Enter}');
    // A space shows as a word, and the duplicate ";" was not added again.
    expect(screen.getByRole('button', { name: 'Remove delimiter space' })).toBeInTheDocument();
    await user.keyboard('{Backspace}');
    await user.click(screen.getByLabelText('Also split at each new line'));
    await user.click(screen.getByRole('button', { name: 'Remove delimiter ,' }));

    await waitFor(() => {
      expect(useDataEditorToolStore.getState().request).toEqual({
        kind: 'split_column',
        column: 'text',
        delimiters: ['; ', ';', ' ', '\n'],
        direction: 'left',
        parts: 2,
      });
    });
  });

  it('previews a new column under a default name, which Tab accepts for editing (issue 164)', async () => {
    const user = userEvent.setup();
    open('find_replace', 'text');
    render(<DataEditorToolPanel />, { wrapper: TooltipProvider });

    await user.type(screen.getByLabelText('Find'), '_');
    await user.click(screen.getByLabelText('A new column, right of it'));
    await waitFor(() => {
      expect(useDataEditorToolStore.getState().request).toMatchObject({
        kind: 'replace',
        output_column: 'text replaced',
      });
    });
    expect(useDataEditorToolStore.getState().highlightColumns).toEqual(['text replaced']);

    const name = screen.getByLabelText('New column name');
    expect(name).toHaveAttribute('placeholder', 'text replaced');
    await user.click(name);
    await user.keyboard('{Tab}');
    expect(name).toHaveValue('text replaced');
    expect(name).toHaveFocus();
    await user.keyboard(' v2');
    expect(name).toHaveValue('text replaced v2');
    await waitFor(() => {
      expect(useDataEditorToolStore.getState().request).toMatchObject({
        output_column: 'text replaced v2',
      });
    });
  });

  it('shows why a preview failed and holds back Apply (issue 285)', async () => {
    const user = userEvent.setup();
    act(() => {
      useDataEditorToolStore.getState().open('find_replace', 'node-1', {
        nodeName: 'Speeches',
        columns: ['text'],
        column: 'text',
      });
    });
    render(<DataEditorToolPanel />, { wrapper: TooltipProvider });
    await user.type(screen.getByLabelText('Find'), '(');
    await waitFor(() => {
      expect(useDataEditorToolStore.getState().request).not.toBeNull();
    });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

    act(() => {
      useDataEditorToolStore
        .getState()
        .setPreviewError('The pattern is not a valid regular expression.');
    });
    expect(screen.getByRole('status')).toHaveTextContent('not a valid regular expression');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();

    act(() => {
      useDataEditorToolStore.getState().setPreviewError(null);
      useDataEditorToolStore.getState().setChangedRows(2);
    });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });
});
