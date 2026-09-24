import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddBatchPanel } from '../AddBatchPanel';

const previews = vi.hoisted(() => [] as { path: string | null; member: string | null }[]);

vi.mock('../../hooks/useFilePreview', () => ({
  useFilePreview: (path: string | null, _open: boolean, member: string | null = null) => {
    previews.push({ path, member });
    return {
      columns: [],
      error: null,
      fileType: null,
      loading: false,
      previewData: [],
      selectedSheet: null,
      setSelectedSheet: vi.fn(),
      sheetNames: null,
    };
  },
}));

const folderTables = [
  { id: 'reddit/comments.parquet', label: 'comments.parquet' },
  { id: 'reddit/2020/stories.csv', label: '2020/stories.csv' },
];

describe('AddBatchPanel', () => {
  beforeEach(() => {
    previews.length = 0;
  });

  it('adds a folder texts as one Data Block by default', async () => {
    const user = userEvent.setup();
    const onConfirmTexts = vi.fn();
    render(
      <AddBatchPanel
        source={{ path: 'reddit', kind: 'folder' }}
        tableFiles={folderTables}
        onClose={vi.fn()}
        onConfirmTexts={onConfirmTexts}
        onConfirmTables={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Add Folder: reddit').length).toBeGreaterThan(0);
    expect(previews.at(-1)).toEqual({ path: 'reddit', member: null });
    await user.click(screen.getByRole('button', { name: 'Add to Project' }));
    expect(onConfirmTexts).toHaveBeenCalledTimes(1);
  });

  it('adds selected folder tables as separate Data Blocks with select all and none', async () => {
    const user = userEvent.setup();
    const onConfirmTables = vi.fn();
    const onClose = vi.fn();
    render(
      <AddBatchPanel
        source={{ path: 'reddit', kind: 'folder' }}
        tableFiles={folderTables}
        onClose={onClose}
        onConfirmTexts={vi.fn()}
        onConfirmTables={onConfirmTables}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Tables as separate Data Blocks (2)' }));
    expect(previews.at(-1)).toEqual({ path: 'reddit/comments.parquet', member: null });
    expect(screen.getByRole('button', { name: 'Add 0 Data Blocks' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select none' }));
    await user.click(screen.getByRole('checkbox', { name: 'Add 2020/stories.csv' }));
    await user.click(screen.getByRole('button', { name: 'Preview 2020/stories.csv' }));
    expect(previews.at(-1)).toEqual({ path: 'reddit/2020/stories.csv', member: null });

    await user.click(screen.getByRole('button', { name: 'Add 1 Data Block' }));
    expect(onConfirmTables).toHaveBeenCalledWith(['reddit/2020/stories.csv']);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('previews and adds ZIP table members through their archive', async () => {
    const user = userEvent.setup();
    const onConfirmTables = vi.fn();
    render(
      <AddBatchPanel
        source={{ path: 'corpus/bundle.zip', kind: 'zip' }}
        tableFiles={[
          { id: 'tables/metadata.csv', label: 'tables/metadata.csv' },
          { id: 'tables/people.parquet', label: 'tables/people.parquet' },
        ]}
        onClose={vi.fn()}
        onConfirmTexts={vi.fn()}
        onConfirmTables={onConfirmTables}
      />,
    );

    expect(screen.getAllByText('Add ZIP: corpus/bundle.zip').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: 'Tables as separate Data Blocks (2)' }));
    await user.click(screen.getByRole('button', { name: 'Preview tables/people.parquet' }));
    expect(previews.at(-1)).toEqual({ path: 'corpus/bundle.zip', member: 'tables/people.parquet' });

    await user.click(screen.getByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Add 2 Data Blocks' }));
    expect(onConfirmTables).toHaveBeenCalledWith(['tables/metadata.csv', 'tables/people.parquet']);
  });

  it('disables Tables mode while ZIP members load or when there are none', () => {
    const { rerender } = render(
      <AddBatchPanel
        source={{ path: 'bundle.zip', kind: 'zip' }}
        tableFiles={[]}
        tablesLoading
        onClose={vi.fn()}
        onConfirmTexts={vi.fn()}
        onConfirmTables={vi.fn()}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Tables as separate Data Blocks (…)' })).toBeDisabled();

    rerender(
      <AddBatchPanel
        source={{ path: 'texts', kind: 'folder' }}
        tableFiles={[]}
        onClose={vi.fn()}
        onConfirmTexts={vi.fn()}
        onConfirmTables={vi.fn()}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Tables as separate Data Blocks (0)' })).toBeDisabled();
  });
});
