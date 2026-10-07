import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expandSheets } from '../../utils/batchTables';
import { AddBatchPanel } from '../AddBatchPanel';

// The help icon needs the app's TooltipProvider; these tests do not cover it.
vi.mock('@/components/help/HelpIcon', () => ({ default: () => null }));

const previews = vi.hoisted(
  () => [] as { path: string | null; member: string | null; sheet?: string | null }[],
);

vi.mock('../../hooks/useFilePreview', () => ({
  useFilePreview: (
    path: string | null,
    _open: boolean,
    member: string | null = null,
    sheet?: string | null,
  ) => {
    previews.push(sheet === undefined ? { path, member } : { path, member, sheet });
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
  { id: 'reddit/comments.parquet', label: 'comments.parquet', path: 'reddit/comments.parquet' },
  { id: 'reddit/2020/stories.csv', label: '2020/stories.csv', path: 'reddit/2020/stories.csv' },
];

const zipTables = [
  { id: 'tables/metadata.csv', label: 'tables/metadata.csv', path: 'tables/metadata.csv' },
  { id: 'tables/people.parquet', label: 'tables/people.parquet', path: 'tables/people.parquet' },
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
    expect(previews.at(-1)).toEqual({ path: 'reddit/comments.parquet', member: null, sheet: null });
    // The preview names what it shows, with a hint (issue 323).
    expect(screen.getByText('Preview: comments.parquet')).toBeInTheDocument();
    expect(screen.getByText('Click a table in the list to preview it.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add 0 Data Blocks' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select none' }));
    await user.click(screen.getByRole('checkbox', { name: 'Add 2020/stories.csv' }));
    await user.click(screen.getByRole('button', { name: 'Preview 2020/stories.csv' }));
    expect(previews.at(-1)).toEqual({ path: 'reddit/2020/stories.csv', member: null, sheet: null });

    await user.click(screen.getByRole('button', { name: 'Add 1 Data Block' }));
    expect(onConfirmTables).toHaveBeenCalledWith([folderTables[1]]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('previews and adds ZIP table members through their archive', async () => {
    const user = userEvent.setup();
    const onConfirmTables = vi.fn();
    render(
      <AddBatchPanel
        source={{ path: 'corpus/bundle.zip', kind: 'zip' }}
        tableFiles={zipTables}
        onClose={vi.fn()}
        onConfirmTexts={vi.fn()}
        onConfirmTables={onConfirmTables}
      />,
    );

    expect(screen.getAllByText('Add ZIP: corpus/bundle.zip').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: 'Tables as separate Data Blocks (2)' }));
    await user.click(screen.getByRole('button', { name: 'Preview tables/people.parquet' }));
    expect(previews.at(-1)).toEqual({
      path: 'corpus/bundle.zip',
      member: 'tables/people.parquet',
      sheet: null,
    });

    await user.click(screen.getByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Add 2 Data Blocks' }));
    expect(onConfirmTables).toHaveBeenCalledWith(zipTables);
  });

  it('lists a workbook sheet by sheet and previews the chosen sheet (issue 323)', async () => {
    const user = userEvent.setup();
    const onConfirmTables = vi.fn();
    const sheets = expandSheets([{ path: 'survey.xlsx', label: 'survey.xlsx' }], () => [
      'Responses',
      'Codes',
    ]);
    render(
      <AddBatchPanel
        source={{ path: 'survey.xlsx', kind: 'workbook' }}
        tableFiles={sheets}
        onClose={vi.fn()}
        onConfirmTexts={vi.fn()}
        onConfirmTables={onConfirmTables}
      />,
    );

    expect(screen.getAllByText('Add Workbook: survey.xlsx').length).toBeGreaterThan(0);
    // No Texts tab for a workbook.
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(previews.at(-1)).toEqual({ path: 'survey.xlsx', member: null, sheet: 'Responses' });
    await user.click(screen.getByRole('button', { name: 'Preview survey.xlsx › Codes' }));
    expect(previews.at(-1)).toEqual({ path: 'survey.xlsx', member: null, sheet: 'Codes' });
    expect(screen.getByText('Preview: survey.xlsx › Codes')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Add survey.xlsx › Codes' }));
    await user.click(screen.getByRole('button', { name: 'Add 1 Data Block' }));
    expect(onConfirmTables).toHaveBeenCalledWith([
      {
        id: 'survey.xlsx\u0000Codes',
        label: 'survey.xlsx › Codes',
        path: 'survey.xlsx',
        sheet: 'Codes',
      },
    ]);
  });

  it('names the ZIPs inside that are not opened', () => {
    render(
      <AddBatchPanel
        source={{ path: 'corpus', kind: 'folder' }}
        tableFiles={folderTables}
        skippedArchives={['old/bundle.zip', 'more.zip']}
        onClose={vi.fn()}
        onConfirmTexts={vi.fn()}
        onConfirmTables={vi.fn()}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      '2 ZIP archives inside are not opened: old/bundle.zip, more.zip. Add each ZIP on its own.',
    );
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
