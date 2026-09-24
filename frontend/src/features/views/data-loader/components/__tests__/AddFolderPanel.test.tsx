import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddFolderPanel } from '../AddFolderPanel';

const previewTargets = vi.hoisted(() => [] as (string | null)[]);

vi.mock('../../hooks/useFilePreview', () => ({
  useFilePreview: (filename: string | null) => {
    previewTargets.push(filename);
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

const tableFiles = [
  { type: 'file' as const, name: 'comments.parquet', path: 'reddit/comments.parquet', size: 10 },
  { type: 'file' as const, name: 'stories.csv', path: 'reddit/2020/stories.csv', size: 5 },
];

describe('AddFolderPanel', () => {
  beforeEach(() => {
    previewTargets.length = 0;
  });

  it('adds the folder texts as one Data Block by default', async () => {
    const user = userEvent.setup();
    const onConfirmTexts = vi.fn();
    render(
      <AddFolderPanel
        folderPath="reddit"
        tableFiles={tableFiles}
        onClose={vi.fn()}
        onConfirmTexts={onConfirmTexts}
        onConfirmTables={vi.fn()}
      />,
    );

    expect(previewTargets.at(-1)).toBe('reddit');
    await user.click(screen.getByRole('button', { name: 'Add to Project' }));
    expect(onConfirmTexts).toHaveBeenCalledTimes(1);
  });

  it('adds selected table files as separate Data Blocks with select all and none', async () => {
    const user = userEvent.setup();
    const onConfirmTables = vi.fn();
    const onClose = vi.fn();
    render(
      <AddFolderPanel
        folderPath="reddit"
        tableFiles={tableFiles}
        onClose={onClose}
        onConfirmTexts={vi.fn()}
        onConfirmTables={onConfirmTables}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Tables as separate Data Blocks (2)' }));
    expect(previewTargets.at(-1)).toBe('reddit/comments.parquet');
    expect(screen.getByRole('button', { name: 'Add 0 Data Blocks' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select none' }));
    await user.click(screen.getByRole('checkbox', { name: 'Add 2020/stories.csv' }));
    await user.click(screen.getByRole('button', { name: 'Preview 2020/stories.csv' }));
    expect(previewTargets.at(-1)).toBe('reddit/2020/stories.csv');

    await user.click(screen.getByRole('button', { name: 'Add 1 Data Block' }));
    expect(onConfirmTables).toHaveBeenCalledWith(['reddit/2020/stories.csv']);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('disables Tables mode for a folder without table files', () => {
    render(
      <AddFolderPanel
        folderPath="texts"
        tableFiles={[]}
        onClose={vi.fn()}
        onConfirmTexts={vi.fn()}
        onConfirmTables={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Tables as separate Data Blocks (0)' })).toBeDisabled();
  });
});
