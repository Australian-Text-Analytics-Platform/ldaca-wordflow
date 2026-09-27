import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { DataLoaderWorkspace } from './DataLoaderWorkspace';
import { useProjectPreview } from './previewState';
import { useSelectionStore } from '@/stores/selectionStore';
import * as api from './api';
vi.mock('./api', () => ({ importLdaca: vi.fn(), searchLdaca: vi.fn(), sampleCatalogue: vi.fn() }));
vi.mock('@/components/help/HelpIcon', () => ({ default: () => null }));
beforeEach(() => vi.clearAllMocks());
it('searches with a session token, retains results and drafts across tabs, and imports without opening previews', async () => {
  const user = userEvent.setup();
  useProjectPreview.setState({ active: 'existing' });
  useSelectionStore.getState().replaceSelectedNodes(['selected']);
  vi.mocked(api.searchLdaca).mockResolvedValue([
    {
      id: 'record',
      title: 'Example corpus',
      importable: true,
      description: 'Full collection description',
      license: 'CC BY',
      collections: ['Corpus'],
      file_formats: ['text/plain'],
    },
  ]);
  const result = Promise.withResolvers<Awaited<ReturnType<typeof api.importLdaca>>>();
  vi.mocked(api.importLdaca).mockReturnValue(result.promise);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DataLoaderWorkspace base="http://project" active onActivate={vi.fn()} />
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole('tab', { name: 'LDaCA' }));
  expect(screen.getByText(/Search by keyword or collection ID/)).toBeVisible();
  expect(screen.queryByText('Staff Picks')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Access token/ }));
  await user.type(screen.getByLabelText('Portal token'), 'session-token');
  await user.type(screen.getByRole('textbox', { name: 'Search', exact: true }), 'corpus{Enter}');
  await screen.findByRole('article', { name: 'Example corpus' });
  expect(api.searchLdaca).toHaveBeenCalledExactlyOnceWith(
    'http://project',
    'keyword',
    'corpus',
    'session-token',
  );
  expect(screen.getByText('Licence: CC BY')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Details' }));
  expect(screen.getByText('record')).toBeVisible();
  await user.click(screen.getByRole('tab', { name: 'Local files' }));
  await user.click(screen.getByRole('tab', { name: 'LDaCA' }));
  expect(screen.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('corpus');
  await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Import' }));
  expect(api.importLdaca).toHaveBeenCalledExactlyOnceWith(
    'http://project',
    'record',
    'session-token',
  );
  expect(screen.getByRole('button', { name: 'Importing…' })).toBeDisabled();
  await user.click(screen.getByRole('tab', { name: 'Local files' }));
  result.resolve({ table_names: ['documents', 'metadata'] });
  await user.click(screen.getByRole('tab', { name: 'LDaCA' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled());
  expect(screen.getByRole('article', { name: 'Example corpus' })).toBeVisible();
  expect(useProjectPreview.getState()).toMatchObject({ active: 'existing' });
  expect(useSelectionStore.getState().selectedNodeIds).toEqual(['selected']);
  expect(api.sampleCatalogue).not.toHaveBeenCalled();
});
