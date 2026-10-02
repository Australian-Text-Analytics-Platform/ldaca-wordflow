import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SidebarTasksSection from '../SidebarTasksSection';
import { buildTaskRows } from '../taskRows';
import {
  uploadProgressMessage,
  uploadToTask,
} from '@/features/workspace/task-stream/taskProjection';
import { type UploadTask, useUploadTasksStore } from '@/stores/uploadTasksStore';

const MB = 1024 * 1024;

const sectionProps = {
  isConnected: true,
  isConnecting: false,
  connectionError: null,
  onReconnect: vi.fn(),
  onStopUserFileImport: vi.fn(),
  onClearUserFileImport: vi.fn(),
  onClearUnavailableAnalysis: vi.fn(),
  stoppingImportId: null,
  clearingImportId: null,
  clearingAnalysisTabId: null,
};

const upload = (overrides: Partial<UploadTask> = {}): UploadTask => ({
  id: 'up-1',
  name: 'data.zip',
  destinationFolder: 'corpus',
  fileCount: 1,
  totalBytes: 460 * MB,
  sentBytes: 180 * MB,
  currentFile: 1,
  currentFileName: 'corpus/data.zip',
  completedFiles: 0,
  bytesPerSecond: 5.1 * MB,
  state: 'running',
  createdAt: '2026-10-02T05:38:15Z',
  finishedAt: null,
  error: null,
  errorDetail: null,
  ...overrides,
});

const startUpload = (cancel = vi.fn()) => {
  act(() => {
    useUploadTasksStore.getState().start({
      id: 'up-1',
      name: 'data.zip',
      destinationFolder: 'corpus',
      fileCount: 1,
      totalBytes: 460 * MB,
      cancel,
    });
  });
  return cancel;
};

describe('upload tasks (issue 260)', () => {
  beforeEach(() => {
    useUploadTasksStore.setState({ uploads: [] });
  });

  it('describes progress in plain units, speed and time left', () => {
    expect(uploadProgressMessage(upload())).toBe(
      '180 MB of 460 MB · 5.1 MB/s · under a minute left',
    );
    expect(uploadProgressMessage(upload({ sentBytes: 0, bytesPerSecond: 0.5 * MB }))).toBe(
      '0 B of 460 MB · 512 KB/s · about 15 min left',
    );
    expect(
      uploadProgressMessage(upload({ fileCount: 24, currentFile: 3, bytesPerSecond: null })),
    ).toBe('180 MB of 460 MB · file 3 of 24');
  });

  it('shows as a Loader task that opens the destination folder when done', () => {
    const running = buildTaskRows([uploadToTask(upload())], new Map(), new Map());
    expect(running[0]).toMatchObject({
      label: 'L - Upload: data.zip',
      state: 'running',
      target: { kind: 'data-loader' },
    });
    expect(running[0]?.primary.progress).toBeCloseTo(180 / 460);

    const done = buildTaskRows(
      [uploadToTask(upload({ state: 'successful', completedFiles: 1, sentBytes: 460 * MB }))],
      new Map(),
      new Map(),
    );
    expect(done[0]?.target).toEqual({ kind: 'data-loader', folder: 'corpus' });
    expect(done[0]?.primary.message).toBe('Uploaded 1 file (460 MB) to corpus');
  });

  it('tracks a running upload, stops it from the Tasks panel, then clears it', async () => {
    const user = userEvent.setup();
    const cancel = startUpload();
    act(() => {
      useUploadTasksStore.getState().progress('up-1', {
        sentBytes: 100 * MB,
        currentFile: 1,
        currentFileName: 'corpus/data.zip',
        completedFiles: 0,
      });
    });
    const tasks = () => useUploadTasksStore.getState().uploads.map(uploadToTask);
    const { rerender } = render(<SidebarTasksSection {...sectionProps} tasks={tasks()} />);

    await user.click(screen.getByRole('button', { name: /^Task: L - Upload: data\.zip\./ }));
    expect(screen.getByText(/^100 MB of 460 MB/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(cancel).toHaveBeenCalledTimes(1);

    act(() => {
      useUploadTasksStore.getState().markCancelled('up-1');
    });
    rerender(<SidebarTasksSection {...sectionProps} tasks={tasks()} />);
    expect(screen.getByText('Upload cancelled. The file was not kept.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(useUploadTasksStore.getState().uploads).toEqual([]);
  });

  it('keeps a failure message for the user', () => {
    startUpload();
    act(() => {
      useUploadTasksStore.getState().fail('up-1', 'corpus/data.zip: The upload stopped.');
    });
    const [task] = useUploadTasksStore.getState().uploads.map(uploadToTask);
    expect(task).toMatchObject({
      state: 'failed',
      message: 'corpus/data.zip: The upload stopped.',
    });
    // A running upload cannot be cleared away.
    startUpload();
    act(() => {
      useUploadTasksStore.getState().clear('up-1');
    });
    expect(useUploadTasksStore.getState().uploads.map((item) => item.state)).toEqual(['running']);
  });
});
