/**
 * Unified download helper that emits user-visible toast notifications and,
 * when running inside the Tauri desktop app, opens a native Save As dialog
 * before writing the file.
 *
 * Browser/web: falls back to the standard `<a download>` mechanism so the
 * browser's own download UI handles progress and the destination folder.
 */
import { toast } from 'sonner';
import { isTauri } from '@/lib/isTauri';

export const safeDownloadStem = (value: string, fallback: string): string =>
  (value.trim() || fallback).replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || fallback;

/** Uses native browser download UI for web builds where destination/progress are already visible. */
/**
 * Called by: saveBlob in this library module.
 */
const browserDownload = (blob: Blob, filename: string) => {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    window.setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }
};

/**
 * Reduce a path-like filename to its basename. The backend may return paths
 * with slashes (e.g. `sample_data/ADO/reddit/reddit_comments.csv`); browsers
 * strip these for `<a download>`, while the native command accepts only one
 * safe filename rather than a caller-controlled filesystem path.
 */
/** Called by: saveBlob in this library module. */
const toBasename = (filename: string): string => {
  const trimmed = filename.replace(/[/\\]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
};

export interface SaveBlobOptions {
  /** When true, suppress toasts even in Tauri (e.g. for caller-controlled flows). */
  silent?: boolean;
}

interface BrowserDownload {
  blob: Blob;
  filename?: string;
  omittedTabCount?: number;
  omittedAnalysisCount?: number;
}

type BrowserDownloadLoader = () => Promise<BrowserDownload>;

interface DataBlockDownload {
  projectId: string;
  nodeIds: string[];
  format: string;
  filename: string;
  loadBrowserDownload: BrowserDownloadLoader;
  options?: SaveBlobOptions;
}

type NativeDownloadCommand = 'save_generated_bytes';

export interface DownloadOmissions {
  omittedTabCount: number;
  omittedAnalysisCount: number;
}

const invokeNativeDownload = async <Result>(
  command: NativeDownloadCommand,
  args: Record<string, unknown>,
): Promise<Result> => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<Result>(command, args);
};

const showNativeDownloadSuccess = (fullPath: string, silent: boolean) => {
  if (silent) return;
  toast.success(`Saved ${toBasename(fullPath)}`, {
    description: fullPath,
    action: {
      label: 'Show in folder',
      onClick: () => {
        void import('@tauri-apps/plugin-opener')
          .then(({ revealItemInDir }) => revealItemInDir(fullPath))
          .catch(() => {
            // Reveal failures do not invalidate the already installed file.
          });
      },
    },
  });
};

const reportDownloadFailure = (filename: string, error: unknown, silent: boolean) => {
  if (silent) return;
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  toast.error(`Failed to download ${toBasename(filename)}`, { description: message });
};

const saveNativeDownload = async (
  command: NativeDownloadCommand,
  args: Record<string, unknown>,
  filename: string,
  silent: boolean,
): Promise<boolean> => {
  try {
    const fullPath = await invokeNativeDownload<string | null>(command, args);
    if (fullPath === null) return false;
    showNativeDownloadSuccess(fullPath, silent);
    return true;
  } catch (error) {
    reportDownloadFailure(filename, error, silent);
    throw error;
  }
};

/** Browser server downloads use the browser's own destination and progress UI. */
export const saveBackendDownload = async (
  _apiPath: string,
  filename: string,
  loadBrowserDownload: BrowserDownloadLoader,
  _options: SaveBlobOptions = {},
): Promise<DownloadOmissions | null> => {
  const download = await loadBrowserDownload();
  browserDownload(download.blob, toBasename(download.filename ?? filename));
  return {
    omittedTabCount: download.omittedTabCount ?? 0,
    omittedAnalysisCount: download.omittedAnalysisCount ?? 0,
  };
};
export const saveDataBlockDownload = async ({
  filename,
  loadBrowserDownload,
}: DataBlockDownload): Promise<boolean> => {
  const download = await loadBrowserDownload();
  browserDownload(download.blob, toBasename(download.filename ?? filename));
  return true;
};

/**
 * Save a blob, notifying the user where it landed. In Tauri we prompt for the
 * destination and surface a toast with a "Show in folder" action. In regular
 * browsers we delegate to the native `<a download>` mechanism, which already
 * shows progress and the destination in the browser chrome — no toast needed.
 */
/**
 * Used by: client-generated chart, table, Token Frequency, and Topic Modeling
 * exports. Backend resources use the streaming helpers above.
 */
export const saveBlob = async (
  blob: Blob,
  filename: string,
  options: SaveBlobOptions = {},
): Promise<boolean> => {
  const { silent = false } = options;

  if (!isTauri()) {
    browserDownload(blob, filename);
    return true;
  }

  const safeFilename = toBasename(filename);
  return saveNativeDownload(
    'save_generated_bytes',
    { filename: safeFilename, bytes: new Uint8Array(await blob.arrayBuffer()) },
    safeFilename,
    silent,
  );
};
