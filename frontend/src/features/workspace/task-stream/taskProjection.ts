import type {
  Analysis,
  ProgressDetail,
  UnavailableAnalysis,
  UnavailableUserFileImport,
  UserFileImport,
} from '@/api';
import { formatBytes } from '@/features/views/data-loader/utils/format';
import type { UploadTask } from '@/stores/uploadTasksStore';

type TaskState = 'queued' | 'running' | 'successful' | 'failed' | 'cancelled';

interface TaskItemBase {
  task_id: string;
  task_type: string;
  name?: string;
  state: TaskState;
  progress?: number;
  progress_message?: string;
  /** Step, counts and processor use of a slow run (issue 350). */
  progress_detail?: ProgressDetail | null;
  message?: string;
  created_at?: string;
  updated_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
  error?: string | null;
  /** The failure's diagnostic, shown under Details (issue 205). */
  error_detail?: string | null;
}

interface AnalysisTaskItem extends TaskItemBase {
  resource_type: 'analysis';
  workspace_id: string;
  tab_id: string;
  /** The analysis request kind, for example `concordance_run_all`; null when unavailable. */
  request_kind?: string | null;
  /** Data Blocks the request reads, for task details (issue 199). */
  node_ids?: string[];
  /** Set on a Run All's per-block analyses, which the Tasks panel folds under their parent. */
  parent_analysis_id?: string | null;
}

interface UserFileImportTaskItem extends TaskItemBase {
  resource_type: 'user_file_import';
  /** Where a finished import put its files, and how many (issue 235). */
  outcome?: { destination_path: string; file_count: number; bytes_written: number } | null;
}

/** A browser upload (issue 260); it has no server resource, only the upload store. */
interface UploadTaskItem extends TaskItemBase {
  resource_type: 'upload';
  outcome?: { destination_path: string; file_count: number; bytes_written: number } | null;
}

export type TaskItem = AnalysisTaskItem | UserFileImportTaskItem | UploadTaskItem;

const PENDING_TASK_STATES: ReadonlySet<string> = new Set(['queued']);
const RUNNING_TASK_STATES: ReadonlySet<string> = new Set(['running']);

export const isPendingTaskState = (state: string | null | undefined): boolean =>
  Boolean(state && PENDING_TASK_STATES.has(state));

export const isRunningTaskState = (state: string | null | undefined): boolean =>
  Boolean(state && RUNNING_TASK_STATES.has(state));

const toTaskState = (state: Analysis['state']): TaskState =>
  state === 'succeeded' ? 'successful' : state;

/** Collects the Data Block ids an analysis request reads, however it nests them. */
const requestNodeIds = (request: unknown): string[] => {
  if (!request || typeof request !== 'object') return [];
  const record = request as Record<string, unknown>;
  const direct = Array.isArray(record.node_ids)
    ? record.node_ids
    : typeof record.node_id === 'string'
      ? [record.node_id]
      : [];
  const ids = direct.filter((id): id is string => typeof id === 'string');
  if (ids.length > 0) return ids;
  if (record.source) return requestNodeIds(record.source);
  if (Array.isArray(record.sources)) {
    return [...new Set(record.sources.flatMap((source) => requestNodeIds(source)))];
  }
  return [];
};

const failureMessage = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const message = (value as { message?: unknown }).message;
  return typeof message === 'string' ? message : undefined;
};

const failureDiagnostic = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null;
  const diagnostic = (value as { diagnostic?: unknown }).diagnostic;
  return typeof diagnostic === 'string' ? diagnostic : null;
};

export const analysisToTask = (
  resource: Analysis | UnavailableAnalysis,
  workspaceId: string,
): TaskItem => {
  if (resource.availability === 'available') {
    const progress = 'progress' in resource ? resource.progress : null;
    return {
      resource_type: 'analysis',
      task_id: resource.id,
      task_type: resource.request.kind,
      workspace_id: workspaceId,
      tab_id: resource.tab_id,
      request_kind: resource.request.kind,
      node_ids: requestNodeIds(resource.request),
      parent_analysis_id:
        resource.execution_scope === 'supporting' ? (resource.parent_analysis_id ?? null) : null,
      state: toTaskState(resource.state),
      progress: progress?.fraction ?? undefined,
      progress_message: progress?.message ?? undefined,
      progress_detail: progress?.detail ?? null,
      message: failureMessage(resource.error) ?? progress?.message ?? undefined,
      created_at: resource.created_at,
      started_at: resource.started_at,
      finished_at: resource.finished_at,
      error: failureMessage(resource.error) ?? null,
      error_detail: failureDiagnostic(resource.error),
    };
  }

  return {
    resource_type: 'analysis',
    task_id: resource.id,
    task_type: 'analysis_unavailable',
    workspace_id: workspaceId,
    tab_id: resource.tab_id,
    request_kind: null,
    node_ids: [],
    state: 'failed',
    message: resource.warning,
    error: resource.reason,
  };
};

const plural = (count: number, one: string) =>
  `${count.toLocaleString()} ${one}${count === 1 ? '' : 's'}`;

/** "Imported 12 files (48 MB) to sample_data/ADO/reddit" (issue 235). */
export const importOutcomeMessage = (outcome: {
  destination_path: string;
  file_count: number;
  bytes_written: number;
}): string =>
  `Imported ${plural(outcome.file_count, 'file')} (${formatBytes(outcome.bytes_written)}) to ${outcome.destination_path}`;

export const importToTask = (resource: UserFileImport | UnavailableUserFileImport): TaskItem => {
  if (resource.availability === 'unavailable') {
    return {
      resource_type: 'user_file_import',
      task_id: resource.id,
      task_type: 'user_file_import_unavailable',
      state: 'failed',
      message: resource.warning,
      error: resource.reason,
    };
  }
  const progress = resource.progress;
  const outcome =
    resource.state === 'succeeded' && resource.result
      ? {
          destination_path: resource.result.destination_path,
          file_count: resource.result.file_count,
          bytes_written: resource.result.bytes_written,
        }
      : null;
  return {
    resource_type: 'user_file_import',
    task_id: resource.id,
    task_type: resource.request.kind === 'sample' ? 'sample_import' : 'data_portal_import',
    state: toTaskState(resource.state),
    progress: progress.fraction ?? undefined,
    progress_message: progress.message ?? undefined,
    progress_detail: progress.detail ?? null,
    // A finished import says what it did, in plain words (issue 235).
    message:
      failureMessage(resource.error) ??
      (outcome ? importOutcomeMessage(outcome) : undefined) ??
      progress.message ??
      undefined,
    outcome,
    created_at: resource.created_at,
    started_at: resource.started_at,
    finished_at: resource.finished_at,
    error: failureMessage(resource.error) ?? null,
    error_detail: failureDiagnostic(resource.error),
  };
};

/** "about 1 min left", from bytes still to send at the current speed. */
const timeLeft = (bytes: number, perSecond: number): string => {
  const seconds = bytes / perSecond;
  if (seconds < 60) return 'under a minute left';
  const minutes = Math.round(seconds / 60);
  return minutes < 60
    ? `about ${String(minutes)} min left`
    : `about ${(seconds / 3600).toFixed(1)} h left`;
};

/** "180 MB of 460 MB · 5.1 MB/s · about 1 min left", plus "file 3 of 24" for several files. */
export const uploadProgressMessage = (upload: UploadTask): string => {
  const sent = upload.sentBytes > 0 ? formatBytes(upload.sentBytes) : '0 B';
  const parts = [`${sent} of ${formatBytes(upload.totalBytes)}`];
  if (upload.bytesPerSecond && upload.bytesPerSecond > 0) {
    parts.push(`${formatBytes(upload.bytesPerSecond)}/s`);
    parts.push(timeLeft(Math.max(0, upload.totalBytes - upload.sentBytes), upload.bytesPerSecond));
  }
  if (upload.fileCount > 1) {
    parts.push(`file ${String(upload.currentFile)} of ${String(upload.fileCount)}`);
  }
  return parts.join(' · ');
};

export const uploadToTask = (upload: UploadTask): TaskItem => {
  const outcome =
    upload.state === 'successful'
      ? {
          destination_path: upload.destinationFolder,
          file_count: upload.completedFiles,
          bytes_written: upload.totalBytes,
        }
      : null;
  const where = upload.destinationFolder ? ` to ${upload.destinationFolder}` : '';
  const message =
    upload.state === 'running'
      ? undefined
      : upload.state === 'successful'
        ? `Uploaded ${plural(upload.completedFiles, 'file')} (${formatBytes(upload.totalBytes)})${where}`
        : upload.state === 'cancelled'
          ? upload.fileCount === 1
            ? 'Upload cancelled. The file was not kept.'
            : `Upload cancelled after ${String(upload.completedFiles)} of ${String(upload.fileCount)} files. Files not fully sent were not kept.`
          : (upload.error ?? undefined);
  return {
    resource_type: 'upload',
    task_id: upload.id,
    task_type: 'upload',
    name: upload.name,
    state: upload.state,
    progress: upload.totalBytes > 0 ? upload.sentBytes / upload.totalBytes : undefined,
    progress_message: upload.state === 'running' ? uploadProgressMessage(upload) : undefined,
    message,
    outcome,
    created_at: upload.createdAt,
    started_at: upload.createdAt,
    finished_at: upload.finishedAt,
    error: upload.error,
    error_detail: upload.errorDetail,
  };
};

const taskTimestamp = (task: TaskItem): number => {
  const value = Date.parse(task.finished_at ?? task.started_at ?? task.created_at ?? '');
  return Number.isNaN(value) ? 0 : value;
};

export const sortTasks = (tasks: TaskItem[]): TaskItem[] =>
  tasks.toSorted((left, right) => taskTimestamp(right) - taskTimestamp(left));
