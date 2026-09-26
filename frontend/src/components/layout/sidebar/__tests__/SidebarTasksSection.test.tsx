import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import SidebarTasksSection from '../SidebarTasksSection';
import type { TaskTab } from '../taskRows';
import type { TaskItem } from '@/features/workspace/task-stream/taskProjection';

/** Default connection props shared by task-section tests. */
const baseProps = {
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

const tabs = new Map<string, TaskTab>([
  ['freq-tab', { kind: 'token_frequency', name: 'Analysis 1' }],
  ['topic-tab', { kind: 'topic_modeling', name: 'JP vs AUS' }],
  ['conc-tab', { kind: 'concordance', name: '2' }],
]);
const nodeNames = new Map([['node-1', 'qldelection2020']]);

/** Builds an analysis task in the given tab. */
const analysisTask = (overrides: Partial<TaskItem> & { task_id: string; tab_id: string }) =>
  ({
    resource_type: 'analysis',
    task_type: 'token_frequency',
    request_kind: 'token_frequency',
    workspace_id: 'workspace-1',
    state: 'successful',
    node_ids: [],
    ...overrides,
  }) as TaskItem;

/** Called by: SidebarTasksSection tests that need compact task fixture rendering. */
const renderTasks = (
  tasks: TaskItem[],
  props: Partial<Parameters<typeof SidebarTasksSection>[0]> = {},
) =>
  render(
    <SidebarTasksSection
      {...baseProps}
      tabsById={tabs}
      nodeNameById={nodeNames}
      tasks={tasks}
      {...props}
    />,
  );

const rowLabels = () =>
  screen
    .getAllByRole('button', { name: /^Task:/ })
    .map((row) => row.getAttribute('aria-label')?.replace(/^Task: (.*?)\. .*$/, '$1'));

describe('SidebarTasksSection', () => {
  it('names tasks by tool and tab, showing old "Analysis N" tabs as N (issue 199)', () => {
    renderTasks([
      analysisTask({ task_id: 'a', tab_id: 'freq-tab', finished_at: '2026-01-02T00:00:00Z' }),
      analysisTask({
        task_id: 'b',
        tab_id: 'topic-tab',
        task_type: 'topic_modeling',
        request_kind: 'topic_modeling',
        finished_at: '2026-01-01T00:00:00Z',
      }),
    ]);

    expect(rowLabels()).toEqual(['Freq - 1', 'Topic - JP vs AUS']);
  });

  it('keeps successful tasks visible until the user clears them', () => {
    vi.useFakeTimers();
    renderTasks([
      analysisTask({ task_id: 'a', tab_id: 'freq-tab', finished_at: '2026-01-01T00:00:00Z' }),
    ]);
    vi.advanceTimersByTime(10_000);
    expect(screen.getByRole('button', { name: /^Task: Freq - 1/ })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('pins problematic tasks above running and successful tasks', () => {
    renderTasks([
      analysisTask({ task_id: 'ok', tab_id: 'freq-tab', finished_at: '2026-01-03T00:00:00Z' }),
      analysisTask({
        task_id: 'running',
        tab_id: 'topic-tab',
        task_type: 'topic_modeling',
        request_kind: 'topic_modeling',
        state: 'running',
        started_at: '2026-01-02T00:00:00Z',
      }),
      analysisTask({
        task_id: 'failed',
        tab_id: 'conc-tab',
        task_type: 'concordance_run_all',
        request_kind: 'concordance_run_all',
        state: 'failed',
        finished_at: '2026-01-01T00:00:00Z',
      }),
    ]);

    expect(rowLabels()).toEqual(['Conc - 2 · Run All', 'Topic - JP vs AUS · Run', 'Freq - 1']);
  });

  it("combines a tab's successful tasks into one row that lists each step", async () => {
    const user = userEvent.setup();
    renderTasks([
      analysisTask({
        task_id: 'preview',
        tab_id: 'conc-tab',
        task_type: 'concordance',
        request_kind: 'concordance',
        node_ids: ['node-1'],
        finished_at: '2026-01-01T00:00:00Z',
      }),
      analysisTask({
        task_id: 'run-all',
        tab_id: 'conc-tab',
        task_type: 'concordance_run_all',
        request_kind: 'concordance_run_all',
        node_ids: ['node-1'],
        finished_at: '2026-01-02T00:00:00Z',
      }),
      analysisTask({
        task_id: 'add',
        tab_id: 'conc-tab',
        task_type: 'concordance_document_data_block_creation',
        request_kind: 'concordance_document_data_block_creation',
        finished_at: '2026-01-03T00:00:00Z',
      }),
    ]);

    expect(rowLabels()).toEqual(['Conc - 2']);
    await user.click(screen.getByRole('button', { name: /^Task: Conc - 2/ }));
    const steps = within(screen.getByRole('list', { name: 'Conc - 2 steps' }));
    expect(steps.getAllByRole('listitem').map((item) => item.firstChild?.textContent)).toEqual([
      'Add to Project',
      'Run All',
      'Preview',
    ]);
    expect(steps.getAllByText(/qldelection2020/)).toHaveLength(2);
  });

  it('opens the tab from the go-to button without toggling the row', async () => {
    const user = userEvent.setup();
    const onOpenTarget = vi.fn();
    renderTasks(
      [analysisTask({ task_id: 'a', tab_id: 'freq-tab', finished_at: '2026-01-01T00:00:00Z' })],
      { onOpenTarget },
    );

    await user.click(screen.getByRole('button', { name: 'Open Freq - 1' }));

    expect(onOpenTarget).toHaveBeenCalledWith({
      kind: 'tab',
      tabKind: 'token_frequency',
      tabId: 'freq-tab',
    });
    expect(screen.getByRole('button', { name: /^Task: Freq - 1/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('shows the failure without stale progress after a task becomes terminal', async () => {
    const user = userEvent.setup();
    renderTasks([
      analysisTask({
        task_id: 'failed',
        tab_id: 'topic-tab',
        task_type: 'topic_modeling',
        request_kind: 'topic_modeling',
        state: 'failed',
        progress: 0.4,
        message: 'Save failed',
        finished_at: '2026-01-01T00:00:00Z',
      }),
    ]);

    await user.click(screen.getByRole('button', { name: /^Task: Topic - JP vs AUS · Run/ }));

    expect(screen.getByText(/save failed/i)).toBeInTheDocument();
    expect(screen.queryByText('40%')).not.toBeInTheDocument();
  });

  it('shows live progress details while a task is active', async () => {
    const user = userEvent.setup();
    renderTasks([
      analysisTask({
        task_id: 'running',
        tab_id: 'freq-tab',
        state: 'running',
        progress: 0.5,
        progress_message: 'Tokenizing documents',
        started_at: '2026-01-01T00:00:00Z',
      }),
    ]);

    await user.click(screen.getByRole('button', { name: /^Task: Freq - 1 · Run/ }));

    expect(screen.getByText(/tokenizing documents/i)).toBeInTheDocument();
  });

  it('keeps available Analysis rows actionless because lifecycle belongs to their Tabs', async () => {
    const user = userEvent.setup();
    renderTasks([
      analysisTask({
        task_id: 'running',
        tab_id: 'topic-tab',
        task_type: 'topic_modeling',
        request_kind: 'topic_modeling',
        state: 'running',
        progress: 0.4,
        created_at: '2026-01-02T00:00:00Z',
      }),
      analysisTask({ task_id: 'ok', tab_id: 'freq-tab', created_at: '2026-01-01T00:00:00Z' }),
    ]);

    await user.click(screen.getByRole('button', { name: /^Task: Topic - JP vs AUS/ }));
    await user.click(screen.getByRole('button', { name: /^Task: Freq - 1/ }));

    expect(screen.queryByRole('button', { name: /^stop$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^clear$/i })).not.toBeInTheDocument();
  });

  it('offers Clear results for an unavailable Analysis', async () => {
    const user = userEvent.setup();
    const onClearUnavailableAnalysis = vi.fn();
    renderTasks(
      [
        {
          resource_type: 'analysis',
          task_id: 'analysis-unavailable',
          task_type: 'analysis_unavailable',
          workspace_id: 'workspace-1',
          tab_id: 'freq-tab',
          request_kind: null,
          node_ids: [],
          state: 'failed',
          message: 'This Analysis is unavailable.',
        },
      ],
      { onClearUnavailableAnalysis },
    );

    await user.click(screen.getByRole('button', { name: /^Task: Freq - 1 · Unavailable/ }));
    await user.click(screen.getByRole('button', { name: /clear results/i }));

    expect(onClearUnavailableAnalysis).toHaveBeenCalledWith('workspace-1', 'freq-tab');
  });

  it('shows Stop only for active User File Imports and invokes the import action', async () => {
    const user = userEvent.setup();
    const onStopUserFileImport = vi.fn();
    renderTasks(
      [
        {
          resource_type: 'user_file_import',
          task_id: 'import-running',
          task_type: 'sample_import',
          state: 'running',
        },
      ],
      { onStopUserFileImport },
    );

    await user.click(screen.getByRole('button', { name: /^Task: Sample import/ }));
    await user.click(screen.getByRole('button', { name: /^stop$/i }));

    expect(onStopUserFileImport).toHaveBeenCalledWith('import-running');
    expect(screen.queryByRole('button', { name: /^clear$/i })).not.toBeInTheDocument();
  });

  it('shows Clear only for terminal User File Imports and disables it while pending', async () => {
    const user = userEvent.setup();
    const onClearUserFileImport = vi.fn();
    renderTasks(
      [
        {
          resource_type: 'user_file_import',
          task_id: 'import-failed',
          task_type: 'data_portal_import',
          state: 'failed',
        },
      ],
      { onClearUserFileImport, clearingImportId: 'import-failed' },
    );

    await user.click(screen.getByRole('button', { name: /^Task: Data portal import/ }));

    expect(screen.getByRole('button', { name: /clearing/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^stop$/i })).not.toBeInTheDocument();
    expect(onClearUserFileImport).not.toHaveBeenCalled();
  });
});
