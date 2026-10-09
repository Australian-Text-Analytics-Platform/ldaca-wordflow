import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, Utf8 } from 'apache-arrow';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { useProjectPreview } from '../previewState';
import { DataEditorPanel } from './DataEditorPanel';
const api = vi.hoisted(() => ({ nodeSchema: vi.fn(), changeColumn: vi.fn() }));
vi.mock('@/features/project/api', async (original) => ({ ...(await original()), ...api }));
vi.mock('@/features/tools/preprocessing/hooks/usePreprocessingPreview', () => ({
  usePreprocessingPreview: () => ({ data: [], refresh: vi.fn() }),
}));
function Harness() {
  const editor = useProjectPreview((state) => state.editor);
  return editor ? (
    <DataEditorPanel key={editor.tool} base="project" session={editor} nodes={[]} />
  ) : (
    <p>Graph</p>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  api.nodeSchema.mockResolvedValue([{ name: 'Body', field: new Field('Body', new Utf8()) }]);
  useProjectPreview.getState().edit('source', 'replace', 'Body');
});
const mount = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Harness />
    </QueryClientProvider>,
  );
it('keeps a failed draft editable and closes only after successful Apply', async () => {
  api.changeColumn
    .mockRejectedValueOnce(new Error('Constraint Error: original diagnostic'))
    .mockResolvedValueOnce(undefined);
  mount();
  await screen.findByRole('option', { name: 'Body' });
  fireEvent.change(screen.getByLabelText('Find text'), { target: { value: '.' } });
  fireEvent.change(screen.getByLabelText('Replace with'), { target: { value: '$1' } });
  await userEvent.click(screen.getByRole('button', { name: 'Apply', exact: true }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('original diagnostic'));
  expect(screen.getByLabelText('Find text')).toHaveValue('.');
  expect(screen.getByLabelText('Find text')).toBeEnabled();
  expect(api.changeColumn).toHaveBeenLastCalledWith(
    'project',
    'source',
    expect.objectContaining({
      operation: 'transform_many',
      columns: [
        expect.objectContaining({
          column: 'Body',
          replace: true,
          expression: expect.stringContaining("'.', '$1', FALSE"),
        }),
      ],
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Retry', exact: true }));
  expect(await screen.findByText('Graph')).toBeVisible();
  expect(useProjectPreview.getState().active).toBe('source');
});
it('prevents duplicate submission and an old success cannot close a different form', async () => {
  let finish!: () => void;
  api.changeColumn.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  mount();
  await screen.findByRole('option', { name: 'Body' });
  fireEvent.change(screen.getByLabelText('Find text'), { target: { value: 'x' } });
  const apply = screen.getByRole('button', { name: 'Apply', exact: true });
  fireEvent.click(apply);
  fireEvent.click(apply);
  await waitFor(() => expect(api.changeColumn).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText('Find text')).toBeDisabled();
  act(() => useProjectPreview.getState().edit('other', 'count', 'Body'));
  await act(async () => finish());
  expect(useProjectPreview.getState().editor).toMatchObject({ target: 'other', tool: 'count' });
});
it('warns about permanent multi-column Table deletion and preserves the form on cancellation', async () => {
  act(() => useProjectPreview.getState().edit('source', 'delete', 'Body'));
  const session = useProjectPreview.getState().editor!;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DataEditorPanel
        base="project"
        session={session}
        nodes={[
          {
            table_name: 'source',
            kind: 'table',
            visible: true,
            color: null,
            document_column: null,
            column_count: 1,
            can_undo: false,
          },
        ]}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText(/permanently deletes/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(api.changeColumn).not.toHaveBeenCalled();
  expect(useProjectPreview.getState().editor).toBeNull();
});
