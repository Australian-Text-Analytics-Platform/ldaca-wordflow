import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { fireEvent, render as renderUi, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProjectDataTableView } from './ProjectDataTableView';
import type { ProjectDataTableViewModel } from './projectTableModel';

it('keeps the preview title and close control mounted while loading or showing an error', () => {
  const close = vi.fn();
  const model: ProjectDataTableViewModel = {
    selectedNode: { id: 'a' },
    header: {
      nodeLabel: 'a',
      isEmptyTable: false,
      canUndo: false,
    },
    nodeActions: { onRename: vi.fn(), onClose: close },
    loading: { nodeData: true },
    table: { data: [], columns: [], columnFields: {}, nodeId: 'a', pageError: null },
  };
  const ui = () => (
    <TooltipProvider>
      <ProjectDataTableView model={model} />
    </TooltipProvider>
  );
  const view = render(ui());
  expect(screen.getByText('Loading data block…')).toBeVisible();
  const title = screen.getByTestId('project-data-node-label');
  expect(title).toHaveTextContent('a');
  expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /rename/i })).toBeVisible();
  model.loading.nodeData = false;
  model.table.pageError = new Error('source unavailable');
  view.rerender(ui());
  expect(screen.getByTestId('project-data-node-label')).toBe(title);
  fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
  expect(close).toHaveBeenCalledOnce();
});

function render(ui: ReactElement) {
  const client = new QueryClient();
  return renderUi(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
