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
  browseLdaca: vi.fn(async () => []),
  sampleCatalogue: vi.fn(),
}));
vi.mock('@/components/help/HelpIcon', () => ({ default: () => null }));
beforeEach(() => vi.clearAllMocks());
it('searches with a session token, retains results and drafts across tabs, and imports without opening previews', async () => {
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
  await waitFor(() => expect(filesApi.browseLdaca).toHaveBeenCalledOnce());
  expect(screen.queryByText('Staff Picks')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Access token/ }));
  await user.clear(screen.getByLabelText('LDaCA access token'));
  await user.type(screen.getByLabelText('LDaCA access token'), 'session-token');
  await user.type(screen.getByRole('textbox', { name: 'Search', exact: true }), 'corpus{Enter}');
  await screen.findByRole('article', { name: 'Example corpus' });
  expect(filesApi.searchLdaca).toHaveBeenCalledExactlyOnceWith(
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
  expect(filesApi.importLdaca).toHaveBeenCalledExactlyOnceWith(
    'http://project',
    'record',
    'session-token',
    false,
  );
  expect(screen.getByRole('button', { name: 'Importing…' })).toBeDisabled();
  await user.click(screen.getByRole('tab', { name: 'Local files' }));
  result.resolve({ table_names: ['documents', 'metadata'], replaced_paths: [] });
  await user.click(screen.getByRole('tab', { name: 'LDaCA' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled());
  expect(screen.getByRole('article', { name: 'Example corpus' })).toBeVisible();
  expect(useProjectPreview.getState()).toMatchObject({ active: 'existing' });
  expect(useSelectionStore.getState().selectedNodeIds).toEqual(['selected']);
  expect(filesApi.sampleCatalogue).not.toHaveBeenCalled();
});

it('browses on opening, filters locally and imports restricted public metadata with original errors and encoding reports', async () => {
  const user = userEvent.setup();
  vi.mocked(filesApi.browseLdaca).mockResolvedValueOnce([
    {
      id: 'restricted',
      title: 'Restricted interview',
      importable: false,
      access: ['Research group'],
    },
    { id: 'public', title: 'Public corpus', importable: true },
  ]);
  vi.mocked(filesApi.importLdaca)
    .mockRejectedValueOnce(new Error('Portal metadata diagnostic'))
    .mockResolvedValueOnce({ table_names: ['metadata'], replaced_paths: ['member: text.txt'] });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DataLoaderWorkspace base="http://project" active onActivate={vi.fn()} />
    </QueryClientProvider>,
  );
  expect(filesApi.browseLdaca).not.toHaveBeenCalled();
  await user.click(screen.getByRole('tab', { name: 'LDaCA' }));
  const record = await screen.findByRole('article', { name: 'Restricted interview' });
  await user.type(screen.getByRole('textbox', { name: 'Filter collections' }), 'interview');
  expect(screen.queryByRole('article', { name: 'Public corpus' })).not.toBeInTheDocument();
  expect(filesApi.searchLdaca).not.toHaveBeenCalled();
  expect(within(record).getByRole('button', { name: 'Import', exact: true })).toBeDisabled();
  await user.click(within(record).getByRole('button', { name: 'Import metadata only' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Portal metadata diagnostic');
  expect(vi.mocked(filesApi.importLdaca).mock.calls.at(-1)?.[3]).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText(/Their rows were retained/)).toBeVisible();
  await user.click(screen.getByText('Affected files'));
  expect(screen.getByText('member: text.txt')).toBeVisible();
});
