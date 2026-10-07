import { describe, expect, it } from 'vitest';
import { findDirectory, tableFilesInDirectory } from '../fileTreeHelpers';
import type { FileTreeNode } from '../../types';

const tree: FileTreeNode[] = [
  {
    type: 'directory',
    name: 'reddit',
    path: 'reddit',
    size: 0,
    children: [
      { type: 'file', name: 'README.md', path: 'reddit/README.md', size: 1 },
      { type: 'file', name: 'b.PARQUET', path: 'reddit/b.PARQUET', size: 1 },
      {
        type: 'directory',
        name: '2020',
        path: 'reddit/2020',
        size: 0,
        children: [
          { type: 'file', name: 'a.xlsx', path: 'reddit/2020/a.xlsx', size: 1 },
          { type: 'file', name: 'notes.txt', path: 'reddit/2020/notes.txt', size: 1 },
          { type: 'file', name: 'old.zip', path: 'reddit/2020/old.zip', size: 1 },
          { type: 'file', name: '._old.zip', path: 'reddit/2020/._old.zip', size: 1 },
        ],
      },
    ],
  },
];

describe('table files in a folder', () => {
  it('lists every table file recursively in path order, skipping texts', () => {
    const folder = findDirectory(tree, 'reddit');
    expect(folder).not.toBeNull();
    expect(tableFilesInDirectory(folder!).map((file) => file.path)).toEqual([
      'reddit/2020/a.xlsx',
      'reddit/b.PARQUET',
    ]);
    expect(findDirectory(tree, 'reddit/2020')?.name).toBe('2020');
    expect(findDirectory(tree, 'missing')).toBeNull();
  });
});

describe('selection helpers', () => {
  it('keeps only the outermost selected paths', async () => {
    const { selectionRoots } = await import('../fileTreeHelpers');
    expect(selectionRoots(['a/b.txt', 'a', 'c.txt', 'a/d'])).toEqual(['a', 'c.txt']);
  });

  it('rejects moves into a selected folder or where nothing would change', async () => {
    const { canMoveInto } = await import('../fileTreeHelpers');
    expect(canMoveInto(['a'], 'a/sub')).toBe(false);
    expect(canMoveInto(['a'], 'a')).toBe(false);
    expect(canMoveInto(['a/x.txt'], 'a')).toBe(false);
    expect(canMoveInto(['a/x.txt', 'b.txt'], 'a')).toBe(true);
    expect(canMoveInto(['a'], '')).toBe(false);
    expect(canMoveInto(['a/sub'], '')).toBe(true);
  });
});

describe('Add selected (issue 309)', () => {
  it('collects text and table files from chosen files and folders, once each', async () => {
    const { filesInSelection } = await import('../fileTreeHelpers');
    const picked = filesInSelection(tree, [
      'reddit/2020',
      'reddit/2020/notes.txt',
      'reddit/README.md',
    ]);
    expect(picked.texts.map((file) => file.path)).toEqual([
      'reddit/2020/notes.txt',
      'reddit/README.md',
    ]);
    expect(picked.tables.map((file) => file.path)).toEqual(['reddit/2020/a.xlsx']);
    // ZIPs are named, not opened (issue 323); hidden ones are left out.
    expect(picked.archives.map((file) => file.path)).toEqual(['reddit/2020/old.zip']);
  });

  it('finds ZIPs in subfolders and knows workbook formats (issue 323)', async () => {
    const { archivesInDirectory, isWorkbookPath } = await import('../fileTreeHelpers');
    const folder = findDirectory(tree, 'reddit');
    expect(archivesInDirectory(folder!).map((file) => file.path)).toEqual(['reddit/2020/old.zip']);
    expect(['a.xlsx', 'b.XLS', 'c.xlsm', 'd.xlsb', 'e.ods', 'f.csv'].map(isWorkbookPath)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it('names the folder that contains the whole selection', async () => {
    const { commonFolder } = await import('../fileTreeHelpers');
    expect(commonFolder(['reddit/2020/a.xlsx', 'reddit/README.md'])).toBe('reddit');
    expect(commonFolder(['reddit/2020/a.xlsx', 'reddit/2020/notes.txt'])).toBe('reddit/2020');
    expect(commonFolder(['reddit', 'other.txt'])).toBe('');
  });
});
