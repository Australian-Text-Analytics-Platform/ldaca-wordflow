import * as filesApi from '@/features/project/filesApi';
import { useSelectionStore } from '@/stores/selectionStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { DataLoaderWorkspace } from './DataLoaderWorkspace';
import { useProjectPreview } from './previewState';
vi.mock('@/features/project/filesApi', () => ({
  importLdaca: vi.fn(),
  searchLdaca: vi.fn(),
  sampleCatalogue: vi.fn(),
}));
vi.mock('@/features/settings/portalApi', () => ({
  portalInfo: vi.fn(async () => ({ has_credential: true, credential_mode: 'session' })),
}));
vi.mock('@/components/help/HelpIcon', () => ({ default: () => null }));
beforeEach(() => vi.clearAllMocks());
it('uses centrally configured access, retains results and drafts across tabs, and imports without opening previews', async () => {
  const user = userEvent.setup();
  useProjectPreview.setState({ active: 'existing' });
  useSelectionStore.getState().replaceSelectedNodes(['selected']);
  vi.mocked(filesApi.searchLdaca).mockResolvedValue([
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
  const result = Promise.withResolvers<Awaited<ReturnType<typeof filesApi.importLdaca>>>();
  vi.mocked(filesApi.importLdaca).mockReturnValue(result.promise);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DataLoaderWorkspace base="http://project" active onActivate={vi.fn()} />
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole('tab', { name: 'LDaCA' }));
  expect(screen.getByText(/Search by keyword or collection ID/)).toBeVisible();
  expect(screen.queryByText('Staff Picks')).not.toBeInTheDocument();
  expect(await screen.findByText('Portal token configured')).toBeVisible();
  expect(screen.queryByLabelText('Portal token')).not.toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: 'Search', exact: true }), 'corpus{Enter}');
  await screen.findByRole('article', { name: 'Example corpus' });
  expect(filesApi.searchLdaca).toHaveBeenCalledExactlyOnceWith(
    'http://project',
    'keyword',
    'corpus',
  );
  expect(screen.getByText('Licence: CC BY')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Details' }));
  expect(screen.getByText('record')).toBeVisible();
  await user.click(screen.getByRole('tab', { name: 'Local files' }));
  await user.click(screen.getByRole('tab', { name: 'LDaCA' }));
  expect(screen.getByRole('textbox', { name: 'Search', exact: true })).toHaveValue('corpus');
  await user.click(within(screen.getByRole('article')).getByRole('button', { name: 'Import' }));
  expect(filesApi.importLdaca).toHaveBeenCalledExactlyOnceWith('http://project', 'record');
  expect(screen.getByRole('button', { name: 'Importing…' })).toBeDisabled();
  await user.click(screen.getByRole('tab', { name: 'Local files' }));
  result.resolve({ table_names: ['documents', 'metadata'] });
  await user.click(screen.getByRole('tab', { name: 'LDaCA' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled());
  expect(screen.getByRole('article', { name: 'Example corpus' })).toBeVisible();
  expect(useProjectPreview.getState()).toMatchObject({ active: 'existing' });
  expect(useSelectionStore.getState().selectedNodeIds).toEqual(['selected']);
  expect(filesApi.sampleCatalogue).not.toHaveBeenCalled();
});
