import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

import { ProjectDataHeader } from '../ProjectDataHeader';

describe('ProjectDataHeader', () => {
  it('omits the pane title, help icon and separator', () => {
    render(
      <TooltipProvider>
        <ProjectDataHeader
          onClose={vi.fn()}
          info={{
            nodeLabel: 'sample_data/ADO/qldelection2020_candidate_tweets_conc',
            isEmptyTable: false,
            canUndo: false,
          }}
        />
      </TooltipProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Data Viewer' })).not.toBeInTheDocument();
    expect(screen.queryByText('Data View', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('|', { exact: true })).not.toBeInTheDocument();
  });

  it('keeps the selected node name in a leading-fade single-line wrapper', () => {
    const longName = 'reddit/reddit_comments_topic_sampled_fr_0_1_rs_0_topic_meanings';

    render(
      <TooltipProvider>
        <ProjectDataHeader
          onClose={vi.fn()}
          info={{
            nodeLabel: longName,
            isEmptyTable: false,
            canUndo: false,
          }}
          onRename={vi.fn()}
        />
      </TooltipProvider>,
    );

    const nodeName = screen.getByText(longName);
    expect(nodeName).toBeInTheDocument();
    expect(screen.getByTestId('project-data-node-label')).toHaveClass('overflow-hidden');
    expect(screen.getByTestId('project-data-node-label-fade')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename node' })).toBeInTheDocument();
  });

  it('drives Undo and Redo disabled state solely from backend flags', () => {
    const onUndo = vi.fn();
    render(
      <TooltipProvider>
        <ProjectDataHeader
          onClose={vi.fn()}
          info={{
            nodeLabel: 'Corpus',
            isEmptyTable: false,
            canUndo: true,
          }}
          onUndo={onUndo}
        />
      </TooltipProvider>,
    );

    const undo = screen.getByRole('button', { name: 'Undo Data Block edit' });
    const redo = screen.getByRole('button', { name: 'Redo Data Block edit' });
    expect(undo).toBeEnabled();
    expect(redo).toBeDisabled();
    undo.click();
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
