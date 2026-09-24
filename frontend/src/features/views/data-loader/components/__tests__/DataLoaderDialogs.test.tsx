import { render, screen } from '@testing-library/react';
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

    expect(screen.queryByText('No project selected')).not.toBeInTheDocument();
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
});
