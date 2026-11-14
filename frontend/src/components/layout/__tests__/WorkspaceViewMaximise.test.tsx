import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDataEditorToolStore } from '@/features/workspace/data-view/dataEditorToolStore';
import { useLayoutFocusStore } from '@/stores/layoutFocusStore';
import WorkspaceView from '../WorkspaceView';

vi.mock('@/features/workspace/graph-view', () => ({
  WorkspaceGraphFeature: () => <div>Project Graph</div>,
}));
vi.mock('@/features/workspace/data-view', () => ({
  WorkspaceDataTableFeature: () => <div>Data Editor table</div>,
}));
vi.mock('@/features/workspace/data-view/components/DataEditorToolPanel', () => ({
  DataEditorToolPanel: () => <div>Find and replace form</div>,
}));
vi.mock('../WorkspaceControls', () => ({ WorkspaceControls: () => null }));

afterEach(() => {
  useLayoutFocusStore.setState({ maximised: null });
  useDataEditorToolStore.setState({ tool: null, graphVisible: false });
  window.localStorage.clear();
});

describe('maximised Data Editor', () => {
  it('hides the graph and its handle, and gives the table the column', () => {
    window.localStorage.setItem('ldaca.layout.workspaceGraphRatio', '0.4');
    useLayoutFocusStore.setState({ maximised: 'data-editor' });
    render(<WorkspaceView />);
    expect(screen.getByTestId('workspace-graph-card')).toHaveClass('hidden!');
    expect(screen.getByRole('separator', { name: 'Resize graph and data panels' })).toHaveClass(
      'hidden!',
    );
    const table = screen.getByTestId('workspace-table-card');
    expect(table).toHaveClass('flex-1');
    expect(table.style.height).toBe('');
    // The remembered ratio is not touched.
    expect(window.localStorage.getItem('ldaca.layout.workspaceGraphRatio')).toBe('0.4');
  });

  it('keeps an open column tool beside the table, in place of the graph', () => {
    useDataEditorToolStore.setState({ tool: 'find_replace', graphVisible: true });
    useLayoutFocusStore.setState({ maximised: 'data-editor' });
    render(<WorkspaceView />);
    expect(screen.getByTestId('workspace-graph-card')).not.toHaveClass('hidden!');
    expect(screen.getByText('Find and replace form')).toBeInTheDocument();
    // The graph and its Back to bar are hidden, not removed.
    expect(screen.getByTestId('workspace-graph-pane')).toHaveClass('hidden');
    expect(screen.getByRole('separator', { name: 'Resize graph and data panels' })).not.toHaveClass(
      'hidden!',
    );
  });

  it('lays out the graph above the table in the normal layout', () => {
    render(<WorkspaceView />);
    expect(screen.getByTestId('workspace-graph-card')).not.toHaveClass('hidden!');
    expect(screen.getByTestId('workspace-table-card').style.height).not.toBe('');
  });
});
