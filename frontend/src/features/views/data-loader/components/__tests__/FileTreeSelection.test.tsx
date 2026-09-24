import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FileTreeNode } from '../../types';
import { FileTree } from '../FileTree';

const nodes: FileTreeNode[] = [
  {
    type: 'directory',
    name: 'speeches',
    path: 'speeches',
    size: 0,
    children: [
      { type: 'file', name: 'a.txt', path: 'speeches/a.txt', size: 1 },
      {
        type: 'directory',
        name: '2020',
        path: 'speeches/2020',
        size: 0,
        children: [{ type: 'file', name: 'b.txt', path: 'speeches/2020/b.txt', size: 1 }],
      },
    ],
  },
  { type: 'directory', name: 'archive', path: 'archive', size: 0, children: [] },
  { type: 'file', name: 'one.csv', path: 'one.csv', size: 1 },
  { type: 'file', name: 'two.csv', path: 'two.csv', size: 1 },
  { type: 'file', name: 'three.csv', path: 'three.csv', size: 1 },
];

function mountTree(overrides: Partial<Parameters<typeof FileTree>[0]> = {}) {
  const props = {
    nodes,
    selectedFile: null,
    loadingFiles: false,
    hasWorkspaceSelected: true,
    workspaceId: 'workspace-1',
    onPreviewFile: vi.fn(),
    onAddFile: vi.fn(),
    onSelectFile: vi.fn(),
    onDownloadFile: vi.fn(),
    onDeleteFile: vi.fn(),
    onCreateFolderInside: vi.fn(),
    onOpenCitation: vi.fn(),
    onMoveFile: vi.fn(),
    onMoveMany: vi.fn(),
    onDeleteMany: vi.fn(),
    ...overrides,
  };
  render(<FileTree {...props} />);
  return props;
}

function dataTransfer() {
  return {
    effectAllowed: 'move',
    dropEffect: 'move',
    setData: vi.fn(),
    getData: vi.fn(() => ''),
    types: ['application/x-ldaca-file-path', 'text/plain'],
  };
}

describe('FileTree folder moves (#137)', () => {
  it('drags a whole folder into another folder or back to the root', async () => {
    const callbacks = mountTree();
    const transfer = dataTransfer();

    fireEvent.dragStart(screen.getByTestId('folder-row-speeches/2020'), { dataTransfer: transfer });
    fireEvent.dragOver(screen.getByTestId('folder-row-archive'), { dataTransfer: transfer });
    fireEvent.drop(screen.getByTestId('folder-row-archive'), { dataTransfer: transfer });
    await waitFor(() => {
      expect(callbacks.onMoveFile).toHaveBeenCalledWith('speeches/2020', 'archive');
    });

    fireEvent.dragStart(screen.getByTestId('folder-row-speeches/2020'), { dataTransfer: transfer });
    fireEvent.drop(screen.getByRole('tree', { name: 'Files' }), { dataTransfer: transfer });
    await waitFor(() => {
      expect(callbacks.onMoveFile).toHaveBeenCalledWith('speeches/2020', '');
    });
  });

  it('never drops a folder into itself or its subfolders', () => {
    const callbacks = mountTree();
    const transfer = dataTransfer();

    fireEvent.dragStart(screen.getByTestId('folder-row-speeches'), { dataTransfer: transfer });
    fireEvent.drop(screen.getByTestId('folder-row-speeches/2020'), { dataTransfer: transfer });
    fireEvent.drop(screen.getByTestId('file-row-speeches/a.txt'), { dataTransfer: transfer });

    expect(callbacks.onMoveFile).not.toHaveBeenCalled();
    expect(callbacks.onMoveMany).not.toHaveBeenCalled();
  });
});

describe('FileTree multi-select (#138)', () => {
  it('selects everything at the root and deletes it after a counted confirmation', async () => {
    const user = userEvent.setup();
    const callbacks = mountTree();

    await user.click(screen.getByRole('checkbox', { name: 'Select all at root' }));
    expect(screen.getByText('5 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete 5 files and 2 folders?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(callbacks.onDeleteMany).toHaveBeenCalledWith([
      'archive',
      'one.csv',
      'speeches',
      'three.csv',
      'two.csv',
    ]);
  });

  it('extends with Shift-click, toggles with Ctrl-click, and clears with Escape', async () => {
    const user = userEvent.setup();
    mountTree();

    await user.click(screen.getByRole('checkbox', { name: 'Select one.csv' }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('checkbox', { name: 'Select three.csv' }));
    await user.keyboard('{/Shift}');
    expect(screen.getByText('3 selected')).toBeInTheDocument();

    await user.keyboard('{Control>}');
    await user.click(screen.getByTestId('file-row-two.csv'));
    await user.keyboard('{/Control}');
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
  });

  it('drags a selection together and skips entries already in the target', async () => {
    const user = userEvent.setup();
    const callbacks = mountTree();

    await user.click(screen.getByRole('checkbox', { name: 'Select one.csv' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select two.csv' }));
    const transfer = dataTransfer();
    fireEvent.dragStart(screen.getByTestId('file-row-one.csv'), { dataTransfer: transfer });
    fireEvent.drop(screen.getByTestId('folder-row-archive'), { dataTransfer: transfer });

    await waitFor(() => {
      expect(callbacks.onMoveMany).toHaveBeenCalledWith(['one.csv', 'two.csv'], 'archive');
    });
  });

  it('offers select all inside an open folder while selecting', async () => {
    const user = userEvent.setup();
    mountTree();

    await user.click(screen.getByRole('checkbox', { name: 'Select one.csv' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select all in speeches' }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('downloads the selection as one ZIP', async () => {
    const user = userEvent.setup();
    const callbacks = mountTree({ onDownloadMany: vi.fn() });

    await user.click(screen.getByRole('checkbox', { name: 'Select speeches' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select one.csv' }));
    await user.click(screen.getByRole('button', { name: 'Download' }));

    expect(callbacks.onDownloadMany).toHaveBeenCalledWith(['one.csv', 'speeches']);
  });
});
