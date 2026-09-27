import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

import { WorkspaceDataHeader } from '../WorkspaceDataHeader';

describe('WorkspaceDataHeader', () => {
  it('leaves the title and renaming to the tab strip (issue 206)', () => {
    render(
      <TooltipProvider>
        <WorkspaceDataHeader
          info={{
            nodeLabel: 'sample_data/ADO/qldelection2020_candidate_tweets_conc',
            tabPosition: 1,
            totalTabs: 1,
            isEmptyTable: false,
            canUndo: false,
            canRedo: false,
          }}
        />
      </TooltipProvider>,
    );

    expect(screen.queryByText('Data Editor')).not.toBeInTheDocument();
    expect(
      screen.queryByText('sample_data/ADO/qldelection2020_candidate_tweets_conc'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
  });

  it('drives Undo and Redo disabled state solely from backend flags', () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(
      <TooltipProvider>
        <WorkspaceDataHeader
          info={{
            nodeLabel: 'Corpus',
            tabPosition: 1,
            totalTabs: 1,
            isEmptyTable: false,
            canUndo: true,
            canRedo: false,
          }}
          onUndo={onUndo}
          onRedo={onRedo}
        />
      </TooltipProvider>,
    );

    const undo = screen.getByRole('button', { name: 'Undo Data Block edit' });
    const redo = screen.getByRole('button', { name: 'Redo Data Block edit' });
    expect(undo).toBeEnabled();
    expect(redo).toBeDisabled();
    undo.click();
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).not.toHaveBeenCalled();
  });
});
