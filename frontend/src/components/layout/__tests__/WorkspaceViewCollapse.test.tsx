import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceView from '../WorkspaceView';

vi.mock('@/features/workspace/graph-view', () => ({ WorkspaceGraphFeature: () => null }));
vi.mock('@/features/workspace/data-view', () => ({ WorkspaceDataTableFeature: () => null }));
vi.mock('@/features/workspace/data-view/components/DataEditorToolPanel', () => ({
  DataEditorToolPanel: () => null,
}));

describe('collapsed Project panel (issue 390)', () => {
  it('offers a side button and, for stacked layouts, a bottom bar that expand it', async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();
    render(<WorkspaceView collapsed onToggleCollapse={toggle} />);

    const side = screen.getByRole('button', { name: 'Expand right panel' });
    const bar = screen.getByRole('button', { name: 'Show Project Graph and Data Editor' });
    // CSS shows one or the other: the side button side by side, the bar when stacked.
    expect(side).toHaveClass('max-md:hidden');
    expect(bar).toHaveClass('hidden', 'max-md:flex');

    await user.click(bar);
    expect(toggle).toHaveBeenCalledOnce();
  });
});
