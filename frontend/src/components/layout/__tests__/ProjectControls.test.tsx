import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

import { ProjectControlsView as ProjectControls } from '../ProjectControlsView';

describe('ProjectControls', () => {
  it('keeps only graph controls in the header', () => {
    render(
      <TooltipProvider>
        <ProjectControls />
      </TooltipProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Rename project' })).not.toBeInTheDocument();
    expect(screen.queryByText('Main Project')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project Graph', exact: true })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
