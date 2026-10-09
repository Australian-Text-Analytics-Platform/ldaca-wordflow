import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { request } from '@/api/client';
import { uploadFile } from './api';
import { startUpload, UploadCards, useUploads } from './uploads';
vi.mock('./api', () => ({ uploadFile: vi.fn() }));
vi.mock('@/api/client', () => ({ request: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  useUploads.setState({ cards: [], revision: 0, visibleLibraries: {} });
  vi.mocked(request).mockResolvedValue({ json: async () => [] } as never);
});
it('retains byte progress and Finishing until acknowledgement after its file panel unmounts', async () => {
  let finish!: (value: Awaited<ReturnType<typeof uploadFile>>) => void;
  vi.mocked(uploadFile).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const file = new File(['abcdef'], 'data.csv');
  const embedded = render(<UploadCards library="data" />);
  let done!: ReturnType<typeof startUpload>;
  act(() => {
    done = startUpload('/host', 'data', file, 'corpus');
  });
  const progress = vi.mocked(uploadFile).mock.calls[0]?.[4];
  act(() => progress?.(3, 6));
  expect(screen.getByText('3 / 6 bytes')).toBeVisible();
  embedded.unmount();
  const global = render(<UploadCards />);
  act(() => progress?.(6, 6));
  expect(screen.getByText('Finishing…')).toBeVisible();
  expect(vi.mocked(uploadFile).mock.calls[0]?.[3]?.aborted).toBe(false);
  await act(async () => {
    finish({ name: 'corpus/data.csv', size: 6, modified: null, is_directory: false });
    await done;
  });
  expect(screen.getByText('Uploaded')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Cancel upload' })).not.toBeInTheDocument();
  global.unmount();
});
it('keeps uncertain cancellation visible and refreshes the destination without claiming rollback', async () => {
  vi.mocked(uploadFile).mockImplementation(
    (_base, _library, _file, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('cancel', 'AbortError')));
      }),
  );
  const user = userEvent.setup();
  render(<UploadCards />);
  act(() => {
    void startUpload('/host', 'data', new File(['abc'], 'data.csv'));
  });
  await user.click(screen.getByRole('button', { name: 'Cancel upload' }));
  expect(await screen.findByText('Cancellation unconfirmed')).toBeVisible();
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith('/host', '/api/server/files/{library}', 'get', {
      path: { library: 'data' },
    }),
  );
  expect(screen.getByRole('button', { name: 'Refresh destination' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Refresh destination' }));
  expect(screen.getByText('Cancellation unconfirmed')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByRole('complementary', { name: 'Uploads' })).not.toBeInTheDocument();
});
it('retains original upload failures with Retry and the destination folder', async () => {
  vi.mocked(uploadFile)
    .mockRejectedValueOnce(new Error('Original engine detail'))
    .mockResolvedValueOnce({
      name: 'folder/data.csv',
      size: 3,
      modified: null,
      is_directory: false,
    });
  const user = userEvent.setup();
  render(<UploadCards />);
  await act(async () => {
    await startUpload('/host', 'data', new File(['abc'], 'data.csv'), 'folder');
  });
  expect(screen.getByRole('alert')).toHaveTextContent('Original engine detail');
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('Uploaded')).toBeVisible();
  expect(vi.mocked(uploadFile).mock.calls[1]?.[5]).toBe('folder/data.csv');
});
