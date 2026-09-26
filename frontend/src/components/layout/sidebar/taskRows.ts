import type { AnalysisKind } from '@/api';
import {
  analysisNavigationForKind,
  displayTabTitle,
} from '@/features/views/common/analysisNavigation';
import type { TaskItem } from '@/features/workspace/task-stream/taskProjection';

/**
 * Turns the task list into Tasks panel rows (issue 199).
 * Flow: file imports stay one row each. Analysis tasks are named after their
 * tool and tab ("Freq - 1"); a tab's successful tasks share one row whose
 * details list each step, while failed, cancelled, queued, and running tasks
 * keep their own row labelled with their step ("Conc - 2 · Run All"). Rows
 * sort with problems first, then work in progress, then finished work, newest
 * first within each group.
 */

export interface TaskTab {
  kind: AnalysisKind;
  name: string;
}

export type TaskRowTarget =
  | { kind: 'tab'; tabKind: AnalysisKind; tabId: string }
  | { kind: 'data-loader' };

interface TaskRowStep {
  task: TaskItem;
  /** "Preview", "Run", "Run All", or "Add to Project". */
  label: string;
  /** Names of the Data Blocks the step read. */
  blocks: string[];
}

export interface TaskRow {
  key: string;
  label: string;
  state: TaskItem['state'];
  /** The task whose progress, messages, and actions the row shows. */
  primary: TaskItem;
  /** Steps of a combined row (successful tasks of one tab); one entry otherwise. */
  steps: TaskRowStep[];
  target: TaskRowTarget | null;
}

const ANALYSIS_KINDS: readonly AnalysisKind[] = [
  'token_frequency',
  'concordance',
  'sequential',
  'topic_modeling',
  'quotation',
  'annotation',
];

/** Tool of a request kind such as `concordance_run_all`, when the tab is unknown. */
const kindFromRequest = (requestKind: string | null | undefined): AnalysisKind | null =>
  ANALYSIS_KINDS.find((kind) => requestKind === kind || requestKind?.startsWith(`${kind}_`)) ??
  null;

/** Plain-language step for an analysis request kind. */
const taskStepLabel = (requestKind: string | null | undefined): string => {
  if (!requestKind) return 'Unavailable';
  if (requestKind.endsWith('_run_all')) return 'Run All';
  if (requestKind.endsWith('_data_block_creation')) return 'Add to Project';
  if (requestKind === 'concordance' || requestKind === 'quotation' || requestKind === 'annotation')
    return 'Preview';
  return 'Run';
};

const PROBLEM_STATES = new Set(['failed', 'cancelled']);
const ACTIVE_STATES = new Set(['queued', 'running']);

const statePriority = (state: string): number =>
  PROBLEM_STATES.has(state) ? 0 : ACTIVE_STATES.has(state) ? 1 : state === 'successful' ? 2 : 3;

const timestamp = (task: TaskItem): number => {
  const value = Date.parse(task.finished_at ?? task.started_at ?? task.created_at ?? '');
  return Number.isNaN(value) ? 0 : value;
};

const importLabel = (task: TaskItem): string => {
  const typeLabel = task.task_type.replace(/_/g, ' ') || 'task';
  const label = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1);
  return task.name ? `${label}: ${task.name}` : label;
};

export function buildTaskRows(
  tasks: readonly TaskItem[],
  tabsById: ReadonlyMap<string, TaskTab>,
  nodeNameById: ReadonlyMap<string, string>,
): TaskRow[] {
  const rows: TaskRow[] = [];
  const successfulByTab = new Map<string, TaskItem[]>();

  const step = (task: TaskItem): TaskRowStep => ({
    task,
    label: taskStepLabel(task.resource_type === 'analysis' ? task.request_kind : null),
    blocks:
      task.resource_type === 'analysis'
        ? (task.node_ids ?? []).map((id) => nodeNameById.get(id) ?? id)
        : [],
  });

  const tabIdentity = (task: TaskItem & { resource_type: 'analysis' }) => {
    const tab = tabsById.get(task.tab_id);
    const kind = tab?.kind ?? kindFromRequest(task.request_kind ?? task.task_type);
    const tool = kind ? analysisNavigationForKind(kind).shortLabel : 'Analysis';
    return {
      name: tab ? `${tool} - ${displayTabTitle(tab.name)}` : tool,
      target: kind ? ({ kind: 'tab', tabKind: kind, tabId: task.tab_id } as const) : null,
    };
  };

  for (const task of tasks) {
    if (task.resource_type !== 'analysis') {
      rows.push({
        key: task.task_id,
        label: importLabel(task),
        state: task.state,
        primary: task,
        steps: [step(task)],
        target: { kind: 'data-loader' },
      });
      continue;
    }
    if (task.state === 'successful') {
      successfulByTab.set(task.tab_id, [...(successfulByTab.get(task.tab_id) ?? []), task]);
      continue;
    }
    const identity = tabIdentity(task);
    rows.push({
      key: task.task_id,
      label: `${identity.name} · ${taskStepLabel(task.request_kind)}`,
      state: task.state,
      primary: task,
      steps: [step(task)],
      target: identity.target,
    });
  }

  for (const [tabId, group] of successfulByTab) {
    const ordered = group.toSorted((left, right) => timestamp(right) - timestamp(left));
    const newest = ordered[0];
    if (newest?.resource_type !== 'analysis') continue;
    const identity = tabIdentity(newest);
    rows.push({
      key: `tab:${tabId}`,
      label: identity.name,
      state: 'successful',
      primary: newest,
      steps: ordered.map(step),
      target: identity.target,
    });
  }

  return rows.sort((left, right) => {
    const priority = statePriority(left.state) - statePriority(right.state);
    return priority !== 0 ? priority : timestamp(right.primary) - timestamp(left.primary);
  });
}
