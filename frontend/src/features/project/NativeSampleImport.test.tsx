import * as filesApi from '@/features/project/filesApi';
import { useSelectionStore } from '@/stores/selectionStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { DataLoaderWorkspace } from './DataLoaderWorkspace';
import { useProjectPreview } from './previewState';
vi.mock('@/features/project/filesApi', () => ({
  sampleCatalogue: vi.fn(),
  importSamples: vi.fn(),
}));
vi.mock('@/components/help/HelpIcon', () => ({ default: () => null }));

const first = 'ADO/tweets.parquet';
const second = 'ADO/gender.parquet';
const third = 'SCL/articles.parquet';
async function openSamples() {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DataLoaderWorkspace base="http://native" active onActivate={vi.fn()} />
    </QueryClientProvider>,
  );
  expect(filesApi.sampleCatalogue).not.toHaveBeenCalled();
  await user.click(screen.getByRole('tab', { name: 'Samples' }));
  await screen.findByRole('checkbox', { name: 'Tweets' });
  return user;
}

describe('native sample imports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectPreview.setState({ active: 'existing' });
    useSelectionStore.getState().replaceSelectedNodes(['selected']);
    vi.mocked(filesApi.sampleCatalogue).mockResolvedValue({
      commit: 'a'.repeat(40),
      collections: [
        {
          id: 'ADO',
          name: 'Tweets',
          description: 'Tweets and metadata',
          total_size_bytes: 200,
          files: [{ path: first }, { path: second }, { path: 'ADO/README.md' }],
        },
        {
          id: 'SCL',
          name: 'Honi Soit',
          description: 'Articles',
          total_size_bytes: 100,
          files: [{ path: third }],
        },
      ],
    });
    vi.mocked(filesApi.importSamples).mockResolvedValue({
      commit: 'a'.repeat(40),
      table_names: ['gender', 'tweets'],
    });
  });

  it('expands files, reflects partial selection, and toggles all or none without changing other projects', async () => {
    const user = await openSamples();
    const group = screen.getByRole('checkbox', { name: 'Tweets' });
    expect(screen.queryByText('Remote')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'tweets.parquet' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show files in Tweets' }));
    expect(screen.queryByText('README.md')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'tweets.parquet' }));
    expect(group).toBePartiallyChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Honi Soit' }));
    await user.click(group);
    expect(group).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'gender.parquet' })).toBeChecked();
    await user.click(group);
    expect(group).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'tweets.parquet' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Honi Soit' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Show files in Tweets' }));
    expect(screen.getByText('1 file selected')).toBeVisible();
  });

  it.each([true, false])('submits only the selected files with as_views=%s', async (asViews) => {
    const user = await openSamples();
    const mode = screen.getByRole('checkbox', { name: 'Import as views' });
    expect(mode).toBeChecked();
    if (!asViews) await user.click(mode);
    expect(screen.getByText(asViews ? /Internet access is required/ : /offline use/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Show files in Tweets' }));
    await user.click(screen.getByRole('checkbox', { name: 'gender.parquet' }));
    await user.click(screen.getByRole('button', { name: 'Import selected' }));
    await waitFor(() =>
      expect(filesApi.importSamples).toHaveBeenCalledExactlyOnceWith('http://native', {
        file_paths: [second],
        as_views: asViews,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(useProjectPreview.getState()).toMatchObject({
        active: 'existing',
      }),
    );
    expect(useSelectionStore.getState().selectedNodeIds).toEqual(['selected']);
  });

  it('keeps the selected files after an import failure and retries beside the form', async () => {
    vi.mocked(filesApi.importSamples).mockRejectedValueOnce(
      new Error('Original engine diagnostic'),
    );
    const user = await openSamples();
    await user.click(screen.getByRole('checkbox', { name: 'Tweets' }));
    await user.click(screen.getByRole('button', { name: 'Import selected' }));
    const error = await screen.findByRole('alert', { name: 'Could not import samples' });
    expect(error).toHaveTextContent('Original engine diagnostic');
    expect(screen.getByRole('checkbox', { name: 'Tweets' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(filesApi.importSamples).toHaveBeenCalledTimes(2);
    expect(filesApi.importSamples).toHaveBeenLastCalledWith('http://native', {
      file_paths: [first, second],
      as_views: true,
    });
    expect(screen.getByRole('button', { name: 'Import selected' })).toBeDisabled();
  });

  it('disables import with no selected files', async () => {
    await openSamples();
    expect(screen.getByRole('button', { name: 'Import selected' })).toBeDisabled();
  });

  it('can switch sources during an import without abandoning its result', async () => {
    const result = Promise.withResolvers<Awaited<ReturnType<typeof filesApi.importSamples>>>();
    vi.mocked(filesApi.importSamples).mockReturnValue(result.promise);
    const user = await openSamples();
    await user.click(screen.getByRole('checkbox', { name: 'Tweets' }));
    await user.click(screen.getByRole('button', { name: 'Import selected' }));
    expect(screen.getByRole('button', { name: 'Importing…' })).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: 'Local files' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Samples' })).toBeEnabled();
    await user.click(screen.getByRole('tab', { name: 'Samples' }));
    expect(screen.getByRole('button', { name: 'Importing…' })).toBeDisabled();
    expect(useProjectPreview.getState().active).toBe('existing');
    result.resolve({ commit: 'a'.repeat(40), table_names: ['gender', 'tweets'] });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Import selected' })).toBeDisabled(),
    );
    expect(filesApi.importSamples).toHaveBeenCalledTimes(1);
    expect(useProjectPreview.getState()).toMatchObject({ active: 'existing' });
    expect(useSelectionStore.getState().selectedNodeIds).toEqual(['selected']);
  });
});
