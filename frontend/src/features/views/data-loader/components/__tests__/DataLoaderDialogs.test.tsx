import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataLoaderDialogs } from '../DataLoaderDialogs';

vi.mock('../LdacaImportDialog', () => ({
  LdacaImportDialog: () => null,
}));

describe('DataLoaderDialogs ownership', () => {
  it('does not retain a no-workspace alert facade for the disabled FileTree action', () => {
    render(
      <DataLoaderDialogs
        workspaceNameAlert={{ message: null, onClose: vi.fn() }}
        folderNameAlert={{ message: null, onClose: vi.fn() }}
        deleteWorkspace={{
          target: null,
          deleting: false,
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
        }}
        ldacaImport={{} as never}
        createFolder={{
          open: false,
          onOpenChange: vi.fn(),
          parentPath: '',
          parentLabel: 'root',
          name: '',
          onNameChange: vi.fn(),
          creating: false,
          onCreate: vi.fn(),
        }}
        citation={{
          directory: null,
          path: null,
          content: null,
          loading: false,
          onClose: vi.fn(),
        }}
        uploadConflicts={{ paths: [], onClose: vi.fn() }}
      />,
    );

    expect(screen.queryByText('No Project selected')).not.toBeInTheDocument();
  });

  it('renders the specific project validation message supplied by the backend', () => {
    render(
      <DataLoaderDialogs
        workspaceNameAlert={{
          message: 'Invalid project name: name cannot contain control characters',
          onClose: vi.fn(),
        }}
        folderNameAlert={{ message: null, onClose: vi.fn() }}
        deleteWorkspace={{
          target: null,
          deleting: false,
          onCancel: vi.fn(),
          onConfirm: vi.fn(),
        }}
        ldacaImport={{} as never}
        createFolder={{
          open: false,
          onOpenChange: vi.fn(),
          parentPath: '',
          parentLabel: 'root',
          name: '',
          onNameChange: vi.fn(),
          creating: false,
          onCreate: vi.fn(),
        }}
        citation={{
          directory: null,
          path: null,
          content: null,
          loading: false,
          onClose: vi.fn(),
        }}
        uploadConflicts={{ paths: [], onClose: vi.fn() }}
      />,
    );

    expect(
      screen.getByText('Invalid project name: name cannot contain control characters'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Project names cannot include path separators or traversal sequences.'),
    ).not.toBeInTheDocument();
  });

  it('names the files a batch left out until the user closes the window', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DataLoaderDialogs
        workspaceNameAlert={{ message: null, onClose: vi.fn() }}
        folderNameAlert={{ message: null, onClose: vi.fn() }}
        deleteWorkspace={{ target: null, deleting: false, onCancel: vi.fn(), onConfirm: vi.fn() }}
        ldacaImport={{} as never}
        createFolder={{
          open: false,
          onOpenChange: vi.fn(),
          parentPath: '',
          parentLabel: 'root',
          name: '',
          onNameChange: vi.fn(),
          creating: false,
          onCreate: vi.fn(),
        }}
        citation={{ directory: null, path: null, content: null, loading: false, onClose: vi.fn() }}
        uploadConflicts={{ paths: [], onClose: vi.fn() }}
        batchAddReport={{
          report: {
            title: '1 JSON file was left out',
            summary: 'ocr_records was added to Project with the rows of 1 of 2 files.',
            items: [{ path: 'ocr/p2.json', reason: 'Not valid JSON (line 1)' }],
          },
          onClose,
        }}
      />,
    );

    const dialog = screen.getByRole('alertdialog', { name: '1 JSON file was left out' });
    expect(dialog).toHaveTextContent('ocr/p2.json — Not valid JSON (line 1)');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(onClose).toHaveBeenCalled();
  });
});
