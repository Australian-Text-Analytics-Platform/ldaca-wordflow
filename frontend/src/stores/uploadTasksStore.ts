/**
 * Uploads in progress or recently finished, for the Tasks panel (issue 260).
 *
 * Uploads run in the browser, so unlike imports and analyses they have no
 * server resource: this store is their only record. It lives outside the Data
 * Loader so an upload keeps its progress while the user works elsewhere. It is
 * not persisted; a reload ends any upload (the page warns first).
 */
import { create } from 'zustand';

type UploadTaskState = 'running' | 'successful' | 'failed' | 'cancelled';

export interface UploadTask {
  id: string;
  /** "data.zip", or "24 files" for a multi-file or folder upload. */
  name: string;
  /** Folder the files go to ('' for the top level). */
  destinationFolder: string;
  fileCount: number;
  totalBytes: number;
  sentBytes: number;
  /** 1-based index and name of the file being sent. */
  currentFile: number;
  currentFileName: string;
  completedFiles: number;
  bytesPerSecond: number | null;
  state: UploadTaskState;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
  errorDetail: string | null;
}

interface UploadTasksState {
  uploads: UploadTask[];
  start: (input: {
    id: string;
    name: string;
    destinationFolder: string;
    fileCount: number;
    totalBytes: number;
    cancel: () => void;
  }) => void;
  progress: (
    id: string,
    patch: Pick<UploadTask, 'sentBytes' | 'currentFile' | 'currentFileName' | 'completedFiles'>,
  ) => void;
  succeed: (id: string, completedFiles: number) => void;
  fail: (id: string, error: string, detail?: string | null) => void;
  markCancelled: (id: string) => void;
  /** Stops a running upload; its pipeline then reports cancelled. */
  cancel: (id: string) => void;
  /** Removes a finished upload from the Tasks panel. */
  clear: (id: string) => void;
}

const SPEED_WINDOW_MS = 5_000;
const cancels = new Map<string, () => void>();
const samples = new Map<string, { at: number; bytes: number }[]>();

/** Bytes per second over the last few seconds, or null until there is enough to say. */
const movingSpeed = (id: string, bytes: number, at: number): number | null => {
  const recent = [...(samples.get(id) ?? []), { at, bytes }].filter(
    (sample) => at - sample.at <= SPEED_WINDOW_MS,
  );
  samples.set(id, recent);
  const first = recent[0];
  if (!first || at - first.at < 500) return null;
  return ((bytes - first.bytes) * 1000) / (at - first.at);
};

const finished = (uploads: UploadTask[], id: string, patch: Partial<UploadTask>): UploadTask[] => {
  cancels.delete(id);
  samples.delete(id);
  return uploads.map((upload) =>
    upload.id === id && upload.state === 'running'
      ? { ...upload, ...patch, bytesPerSecond: null, finishedAt: new Date().toISOString() }
      : upload,
  );
};

export const useUploadTasksStore = create<UploadTasksState>()((set) => ({
  uploads: [],
  start: ({ id, name, destinationFolder, fileCount, totalBytes, cancel }) => {
    cancels.set(id, cancel);
    samples.set(id, [{ at: Date.now(), bytes: 0 }]);
    set((state) => ({
      uploads: [
        ...state.uploads,
        {
          id,
          name,
          destinationFolder,
          fileCount,
          totalBytes,
          sentBytes: 0,
          currentFile: 1,
          currentFileName: '',
          completedFiles: 0,
          bytesPerSecond: null,
          state: 'running',
          createdAt: new Date().toISOString(),
          finishedAt: null,
          error: null,
          errorDetail: null,
        },
      ],
    }));
  },
  progress: (id, patch) => {
    const speed = movingSpeed(id, patch.sentBytes, Date.now());
    set((state) => ({
      uploads: state.uploads.map((upload) =>
        upload.id === id && upload.state === 'running'
          ? { ...upload, ...patch, bytesPerSecond: speed ?? upload.bytesPerSecond }
          : upload,
      ),
    }));
  },
  succeed: (id, completedFiles) => {
    set((state) => ({
      uploads: finished(state.uploads, id, {
        state: 'successful',
        completedFiles,
        sentBytes: state.uploads.find((upload) => upload.id === id)?.totalBytes ?? 0,
      }),
    }));
  },
  fail: (id, error, detail = null) => {
    set((state) => ({
      uploads: finished(state.uploads, id, { state: 'failed', error, errorDetail: detail }),
    }));
  },
  markCancelled: (id) => {
    set((state) => ({ uploads: finished(state.uploads, id, { state: 'cancelled' }) }));
  },
  cancel: (id) => {
    cancels.get(id)?.();
  },
  clear: (id) => {
    set((state) => ({
      uploads: state.uploads.filter((upload) => upload.id !== id || upload.state === 'running'),
    }));
  },
}));

/** True while any upload is still sending: reloading or closing the page would end it. */
export const hasRunningUpload = (uploads: readonly UploadTask[]): boolean =>
  uploads.some((upload) => upload.state === 'running');
