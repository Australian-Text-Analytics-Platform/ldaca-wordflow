import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataLoaderDialogs, type DataLoaderDialogsProps } from '../DataLoaderDialogs';

vi.mock('../LdacaImportDialog', () => ({
  LdacaImportDialog: () => null,
}));

const props = (largeUpload: DataLoaderDialogsProps['largeUpload']): DataLoaderDialogsProps => ({
  workspaceNameAlert: { message: null, onClose: vi.fn() },
  folderNameAlert: { message: null, onClose: vi.fn() },
  deleteWorkspace: { target: null, deleting: false, onCancel: vi.fn(), onConfirm: vi.fn() },
  ldacaImport: {} as never,
  createFolder: {
    open: false,
    onOpenChange: vi.fn(),
    parentPath: '',
    parentLabel: 'root',
    name: '',
    onNameChange: vi.fn(),
    creating: false,
    onCreate: vi.fn(),
  },
  citation: { directory: null, path: null, content: null, loading: false, onClose: vi.fn() },
  uploadConflicts: { paths: [], onClose: vi.fn() },
  largeUpload,
});

describe('large upload reminder dialog (issue 260)', () => {
  it('explains the shared server and offers the desktop app, then proceeds on request', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    render(
      <DataLoaderDialogs
        {...props({
          reminder: { totalBytes: 680 * 1024 * 1024, fileCount: 1 },
          onAccept,
          onDecline,
        })}
      />,
    );

    expect(
      screen.getByRole('alertdialog', { name: 'This is a large upload (680 MB)' }),
    ).toBeVisible();
    expect(screen.getByText(/shared with other people/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wordflow desktop app' })).toHaveAttribute(
      'href',
      'https://sih.tools/wordflow',
    );
    await user.click(screen.getByRole('button', { name: 'Upload anyway' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('cancels', async () => {
    const user = userEvent.setup();
    const onDecline = vi.fn();
    render(
      <DataLoaderDialogs
        {...props({
          reminder: { totalBytes: 60 * 1024 * 1024, fileCount: 3 },
          onAccept: vi.fn(),
          onDecline,
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDecline).toHaveBeenCalled();
  });
});
