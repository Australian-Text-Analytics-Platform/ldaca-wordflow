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
          reminder: { totalBytes: 680 * 1024 * 1024, fileCount: 1, large: true, manyFiles: false },
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

  it('advises a ZIP for thousands of files, without the shared-server note (issue 447)', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(
      <DataLoaderDialogs
        {...props({
          reminder: {
            totalBytes: 40 * 1024 * 1024,
            fileCount: 26163,
            large: false,
            manyFiles: true,
          },
          onAccept,
          onDecline: vi.fn(),
        })}
      />,
    );

    expect(screen.getByRole('alertdialog', { name: 'This upload has 26,163 files' })).toBeVisible();
    expect(
      screen.getByText('Compress the folder into a ZIP file and upload the ZIP instead.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/shared with other people/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Upload anyway' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('gives both reasons for thousands of files on a shared server', () => {
    render(
      <DataLoaderDialogs
        {...props({
          reminder: {
            totalBytes: 680 * 1024 * 1024,
            fileCount: 5000,
            large: true,
            manyFiles: true,
          },
          onAccept: vi.fn(),
          onDecline: vi.fn(),
        })}
      />,
    );

    expect(screen.getByRole('alertdialog', { name: 'This upload has 5,000 files' })).toBeVisible();
    expect(screen.getByText(/upload the ZIP instead/)).toBeInTheDocument();
    expect(screen.getByText(/shared with other people/)).toHaveTextContent('(680 MB)');
  });

  it('cancels', async () => {
    const user = userEvent.setup();
    const onDecline = vi.fn();
    render(
      <DataLoaderDialogs
        {...props({
          reminder: { totalBytes: 60 * 1024 * 1024, fileCount: 3, large: true, manyFiles: false },
          onAccept: vi.fn(),
          onDecline,
        })}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDecline).toHaveBeenCalled();
  });
});
