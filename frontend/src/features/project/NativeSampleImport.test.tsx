import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataLoaderWorkspace } from './DataLoaderWorkspace';
import * as api from './api';
import { useProjectPreview } from './previewState';
import { useSelectionStore } from '@/stores/selectionStore';
vi.mock('./api', () => ({ sampleCatalogue: vi.fn(), importSamples: vi.fn() }));
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
  expect(api.sampleCatalogue).not.toHaveBeenCalled();
  await user.click(screen.getByRole('tab', { name: 'Samples' }));
  await screen.findByRole('checkbox', { name: 'Tweets' });
  return user;
}

describe('native sample imports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectPreview.setState({ active: 'existing' });
    useSelectionStore.getState().replaceSelectedNodes(['selected']);
    vi.mocked(api.sampleCatalogue).mockResolvedValue({
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
    vi.mocked(api.importSamples).mockResolvedValue({
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
      expect(api.importSamples).toHaveBeenCalledExactlyOnceWith('http://native', {
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

  it('disables import with no selected files', async () => {
    await openSamples();
    expect(screen.getByRole('button', { name: 'Import selected' })).toBeDisabled();
  });

  it('can switch sources during an import without abandoning its result', async () => {
    const result = Promise.withResolvers<Awaited<ReturnType<typeof api.importSamples>>>();
    vi.mocked(api.importSamples).mockReturnValue(result.promise);
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
    expect(api.importSamples).toHaveBeenCalledTimes(1);
    expect(useProjectPreview.getState()).toMatchObject({ active: 'existing' });
    expect(useSelectionStore.getState().selectedNodeIds).toEqual(['selected']);
  });
});
