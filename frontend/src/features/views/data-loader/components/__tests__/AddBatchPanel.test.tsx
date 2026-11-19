import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expandSheets } from '../../utils/batchTables';
import { AddBatchPanel } from '../AddBatchPanel';

// Radix Select captures the pointer, which jsdom does not implement.
window.HTMLElement.prototype.hasPointerCapture = vi.fn();

// The help icon needs the app's TooltipProvider; these tests do not cover it.
vi.mock('@/components/help/HelpIcon', () => ({ default: () => null }));

const previews = vi.hoisted(
  () =>
    [] as {
      path: string | null;
      member: string | null;
      sheet?: string | null;
      recordPath?: string | null;
    }[],
);

vi.mock('../../hooks/useFilePreview', () => ({
  useFilePreview: (
    path: string | null,
    _open: boolean,
    member: string | null = null,
    sheet?: string | null,
    recordPath?: string | null,
  ) => {
    previews.push({
      path,
      member,
      ...(sheet === undefined ? {} : { sheet }),
      ...(recordPath === undefined ? {} : { recordPath }),
    });
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

// Every OCR file offers its text blocks first, then the boxes beside them.
const ocrRecordPaths = [
  {
    path: '/pages/parsing_res_list',
    label: 'pages › parsing_res_list',
    records: 168,
    fields: ['block_label', 'block_content'],
    field_count: 7,
  },
  {
    path: '/pages/layout_det_res/boxes',
    label: 'pages › layout_det_res › boxes',
    records: 170,
    fields: ['label', 'score'],
    field_count: 6,
  },
];

// A file built differently: its rows are under "entries".
const notesRecordPaths = [
  { path: '/entries', label: 'entries', records: 12, fields: ['text'], field_count: 1 },
];

vi.mock('../../hooks/useJsonRecordPaths', () => ({
  useJsonRecordPaths: (path: string | null, member: string | null, enabled: boolean) => ({
    paths: !enabled
      ? null
      : (member ?? path ?? '').endsWith('notes.json')
        ? notesRecordPaths
        : ocrRecordPaths,
    loading: false,
  }),
}));

const ocrFiles = [
  { id: 'ocr/p1.json', label: 'p1.json', path: 'ocr/p1.json' },
  { id: 'ocr/p2.json', label: 'p2.json', path: 'ocr/p2.json' },
];

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
    // No JSON file among them, so no place for rows.
    expect(onConfirmTables).toHaveBeenCalledWith([folderTables[1]], null);
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
    expect(onConfirmTables).toHaveBeenCalledWith(zipTables, null);
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
    expect(onConfirmTables).toHaveBeenCalledWith(
      [
        {
          id: 'survey.xlsx\u0000Codes',
          label: 'survey.xlsx › Codes',
          path: 'survey.xlsx',
          sheet: 'Codes',
        },
      ],
      null,
    );
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

  it('opens a folder of JSON files without texts on JSON records, read one way', async () => {
    const user = userEvent.setup();
    const onConfirmJsonRecords = vi.fn();
    render(
      <AddBatchPanel
        source={{ path: 'ocr', kind: 'folder' }}
        tableFiles={ocrFiles}
        textCount={0}
        onClose={vi.fn()}
        onConfirmTexts={vi.fn()}
        onConfirmTables={vi.fn()}
        onConfirmJsonRecords={onConfirmJsonRecords}
      />,
    );

    expect(screen.getByRole('tab', { name: 'JSON records as one Data Block (2)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // The first file's default place is previewed and applies to all.
    expect(previews.at(-1)).toEqual({
      path: 'ocr/p1.json',
      member: null,
      sheet: null,
      recordPath: '/pages/parsing_res_list',
    });
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();
    expect(
      screen.getByText(/Every JSON file in this window is read this way\./),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Rows from' }));
    await user.click(
      screen.getByRole('option', { name: 'pages › layout_det_res › boxes · 170 rows' }),
    );
    expect(previews.at(-1)?.recordPath).toBe('/pages/layout_det_res/boxes');

    await user.click(screen.getByRole('checkbox', { name: 'Add p2.json' }));
    await user.click(screen.getByRole('button', { name: 'Add to Project' }));
    expect(onConfirmJsonRecords).toHaveBeenCalledWith([ocrFiles[0]], '/pages/layout_det_res/boxes');
  });

  it('takes the default place from the first ticked JSON file, not the first listed', async () => {
    const user = userEvent.setup();
    const onConfirmJsonRecords = vi.fn();
    const notes = { id: 'ocr/notes.json', label: 'notes.json', path: 'ocr/notes.json' };
    render(
      <AddBatchPanel
        source={{ path: 'ocr', kind: 'folder' }}
        tableFiles={[notes, ...ocrFiles]}
        textCount={0}
        onClose={vi.fn()}
        onConfirmTexts={vi.fn()}
        onConfirmTables={vi.fn()}
        onConfirmJsonRecords={onConfirmJsonRecords}
      />,
    );

    expect(previews.at(-1)).toMatchObject({ path: 'ocr/notes.json', recordPath: '/entries' });

    // Without notes.json, its place would give the two OCR files no rows.
    await user.click(screen.getByRole('checkbox', { name: 'Add notes.json' }));
    expect(previews.at(-1)).toMatchObject({
      path: 'ocr/p1.json',
      recordPath: '/pages/parsing_res_list',
    });
    await user.click(screen.getByRole('button', { name: 'Add to Project' }));
    expect(onConfirmJsonRecords).toHaveBeenCalledWith(ocrFiles, '/pages/parsing_res_list');
  });

  it('keeps a place the user chose when the ticks change', async () => {
    const user = userEvent.setup();
    const onConfirmJsonRecords = vi.fn();
    const notes = { id: 'ocr/notes.json', label: 'notes.json', path: 'ocr/notes.json' };
    render(
      <AddBatchPanel
        source={{ path: 'ocr', kind: 'folder' }}
        tableFiles={[...ocrFiles, notes]}
        textCount={0}
        onClose={vi.fn()}
        onConfirmTexts={vi.fn()}
        onConfirmTables={vi.fn()}
        onConfirmJsonRecords={onConfirmJsonRecords}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Rows from' }));
    await user.click(
      screen.getByRole('option', { name: 'pages › layout_det_res › boxes · 170 rows' }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Add p1.json' }));
    await user.click(screen.getByRole('checkbox', { name: 'Add p2.json' }));
    await user.click(screen.getByRole('button', { name: 'Add to Project' }));
    expect(onConfirmJsonRecords).toHaveBeenCalledWith([notes], '/pages/layout_det_res/boxes');
  });

  it('keeps Texts first when the folder has texts, and offers JSON records', () => {
    render(
      <AddBatchPanel
        source={{ path: 'ocr', kind: 'folder' }}
        tableFiles={ocrFiles}
        textCount={3}
        onClose={vi.fn()}
        onConfirmTexts={vi.fn()}
        onConfirmTables={vi.fn()}
        onConfirmJsonRecords={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Texts as one Data Block (3)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'JSON records as one Data Block (2)' })).toBeEnabled();
  });

  it('reads every JSON table of a ZIP at one place in Tables mode', async () => {
    const user = userEvent.setup();
    const onConfirmTables = vi.fn();
    const tables = [...zipTables, { id: 'ocr/p1.json', label: 'ocr/p1.json', path: 'ocr/p1.json' }];
    render(
      <AddBatchPanel
        source={{ path: 'bundle.zip', kind: 'zip' }}
        tableFiles={tables}
        onClose={vi.fn()}
        onConfirmTexts={vi.fn()}
        onConfirmTables={onConfirmTables}
      />,
    );

    // Without a JSON records handler, only the two original modes show.
    expect(screen.queryByRole('tab', { name: /JSON records/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Tables as separate Data Blocks (3)' }));
    await user.click(screen.getByRole('button', { name: 'Preview ocr/p1.json' }));
    expect(previews.at(-1)).toEqual({
      path: 'bundle.zip',
      member: 'ocr/p1.json',
      sheet: null,
      recordPath: '/pages/parsing_res_list',
    });
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Add 3 Data Blocks' }));
    expect(onConfirmTables).toHaveBeenCalledWith(tables, '/pages/parsing_res_list');
  });
});
