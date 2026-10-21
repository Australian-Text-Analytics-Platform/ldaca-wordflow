import { expectAppError } from './diagnostics';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { role, text, testId, post, get, remove, press, screenshot, stubResponse } from './fixtures';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';

import type { NativeTask, TaskSnapshot } from '@/features/project/tasksApi';

it('a ZIP dropped onto the graph records preparation and import in the Task Centre', async () => {
  const temporary = process.env.WORDFLOW_E2E_TEMP_DIR;
  if (!temporary) throw new Error('Missing runner-owned temporary directory');
  const directory = await mkdtemp(join(temporary, 'import-tasks-'));
  try {
    const path = join(directory, 'articles.zip');
    const archive = new JSZip();
    archive.file('first.txt', 'First complete article.');
    archive.file('second.txt', 'Second complete article.');
    await writeFile(path, await archive.generateAsync({ type: 'nodebuffer' }));
    await browser.url('/');
    const graph = browser.$('[aria-label="Data Block graph"]');
    await graph.waitForExist();
    await graph.execute((element, source) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('application/x-wordflow-file', String(source));
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    }, path);
    const rows = () => testId('sidebar-section-tasks');
    await expect(browser.$('.react-flow__node')).toBeDisplayed();
    await browser.waitUntil(async () => {
      const tasks = (await (await get('/api/project/tasks')).json()) as TaskSnapshot;
      return tasks.tasks.every((task) => task.finished_at !== null);
    });
    const snapshot = (await (await get('/api/project/tasks')).json()) as TaskSnapshot;
    expect(snapshot.tasks.map((task) => task.label).sort()).toEqual([
      'Import local data',
      'Prepare data import',
    ]);
    expect(snapshot.tasks.every((task) => task.state === 'succeeded')).toBe(true);
    await expect(text('No tasks', { exact: true }, rows())).toBeDisplayed();
    await expect(role('button', { name: /Task:/ }, rows())).not.toExist();
    await screenshot('zip-import-tasks.png');
    const header = testId('sidebar-section-header-tasks');
    const toggle = role('button', { name: 'Tasks', exact: true }, header);
    await toggle.click();
    const archiveButton = role('button', { name: 'Task history', exact: true }, header);
    await archiveButton.click();
    const history = role('dialog', { name: 'Task history', exact: true });
    await expect(role('button', { name: /Task: Prepare data import/ }, history)).toBeDisplayed();
    await expect(role('button', { name: /Task: Import local data/ }, history)).toBeDisplayed();
    await screenshot('zip-import-task-history.png');
    await press('Escape');
    await expect(history).not.toExist();
    await expect(archiveButton).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// Test-owned snapshots isolate presentation; the next test uses real production routes.
it('native task rows show progress, errors, cancellation and dismissal in both themes', async () => {
  const started = Date.now() - 5000;
  const running: NativeTask = {
    id: '00000000-0000-4000-8000-000000000001',
    label: 'Inspect corpus',
    state: 'running',
    created_at: started,
    started_at: started,
    finished_at: null,
    progress: { message: 'Reading documents', fraction: 0.45 },
    error: null,
  };
  const failed: NativeTask = {
    ...running,
    id: '00000000-0000-4000-8000-000000000002',
    label: 'Unavailable source',
    state: 'failed',
    finished_at: started + 1000,
    error: { code: 'sql_error', message: 'The source file is unavailable.' },
  };
  const succeeded: NativeTask = {
    ...running,
    id: '00000000-0000-4000-8000-000000000003',
    label: 'Topic Modelling',
    state: 'succeeded',
    finished_at: started + 1000,
  };
  const cancelled: NativeTask = {
    ...succeeded,
    id: '00000000-0000-4000-8000-000000000004',
    label: 'Quotation',
    state: 'cancelled',
  };
  let snapshot: TaskSnapshot = { revision: 1, tasks: [running, failed, cancelled, succeeded] };
  await stubResponse('/api/project/tasks', () => JSON.stringify(snapshot));
  await stubResponse(
    '/api/project/events',
    () => `event: tasks\ndata: ${JSON.stringify(snapshot)}\n\n`,
    'text/event-stream',
  );
  await browser.url('/');
  const rows = () => testId('sidebar-section-tasks');
  await expect(role('button', { name: /Task: Topic Modelling/ }, rows())).not.toExist();
  await expect(role('button', { name: /Task: Quotation/ }, rows())).toBeDisplayed();
  await role('button', { name: /Task: Inspect corpus/ }, rows()).click();
  await expect(role('progressbar', {}, rows())).toHaveAttribute('aria-valuenow', '45');
  await expect(text('Reading documents', {}, rows())).toBeDisplayed();
  await role('button', { name: /Task: Unavailable source/ }, rows()).click();
  await expect(text('The source file is unavailable.', {}, rows())).toBeDisplayed();
  await expect(browser.$('[data-sonner-toast]')).not.toExist();
  await role(
    'button',
    { name: 'Tools', exact: true, expanded: true },
    testId('sidebar-section-header-tools'),
  ).click();
  await role(
    'button',
    { name: 'Data Blocks', exact: true, expanded: true },
    testId('sidebar-section-header-nodes'),
  ).click();
  for (const theme of ['light-2026', 'dark-2026']) {
    await browser.execute((value) => {
      document.documentElement.setAttribute('data-theme', value);
      document.documentElement.style.colorScheme = value.startsWith('dark') ? 'dark' : 'light';
    }, theme);
    await browser.setViewport({ width: 1350, height: 1100 });
    await screenshot(`tasks-${theme}.png`, rows());
    await role('button', { name: 'Task history', exact: true }, rows()).click();
    const history = role('dialog', { name: 'Task history', exact: true });
    for (const label of ['Inspect corpus', 'Unavailable source', 'Topic Modelling', 'Quotation']) {
      await expect(role('button', { name: new RegExp(`Task: ${label}`) }, history)).toBeDisplayed();
    }
    await role('button', { name: /Task: Topic Modelling/ }, history).click();
    await expect(text(/^Succeeded/, {}, history)).toBeDisplayed();
    await screenshot(`task-history-${theme}.png`);
    await press('Escape');
    await expect(history).not.toExist();
  }
  snapshot = {
    revision: 2,
    tasks: [{ ...running, state: 'cancelled', finished_at: Date.now() }, failed, cancelled, succeeded],
  };
  await stubResponse(`/api/project/tasks/${running.id}/cancel`, () => JSON.stringify(snapshot));
  await role('button', { name: 'Cancel', exact: true }, rows()).click();
  await expect(text(/Cancelled/, {}, rows())).toBeDisplayed();
  snapshot = { revision: 3, tasks: snapshot.tasks.filter((task) => task.id !== failed.id) };
  await stubResponse(`/api/project/tasks/${failed.id}`, () => JSON.stringify(snapshot));
  await role('button', { name: 'Dismiss', exact: true, index: 1 }, rows()).click();
  await expect(role('button', { name: /Task: Unavailable source/ }, rows())).not.toExist();
  await expect(role('button', { name: /Task: Inspect corpus/ }, rows())).toBeDisplayed();
});

it('real SQL tasks cancel independently, refresh project data and keep failed source saved', async () => {
  const existing = (await (await get('/api/project/tasks')).json()) as TaskSnapshot;
  for (const task of existing.tasks) {
    if (task.finished_at !== null) await remove(`/api/project/tasks/${task.id}`);
  }
  await browser.url('/');
  await role('button', { name: 'Data Builder', exact: true }).click();
  await role('tab', { name: 'SQL', exact: true }).click();
  const console = () => testId('sql-console');
  const editor = () => console().$('.cm-content');
  await editor().setValue(
    'SELECT sum(a.i*b.i) FROM range(1000000000) a(i), range(1000000000) b(i)',
  );
  await press('ControlOrMeta+Enter', editor());
  const rows = () => testId('sidebar-section-tasks');
  const running = role('button', { name: /Task: SQL cell 1/ }, rows());
  await expect(running).toBeDisplayed();
  await running.click();
  // An independent production import commits while the console query is running.
  const imported = await post('/api/project/import', {
    sources: [{ table_name: 'Task import', sql: 'SELECT 7 AS x' }],
  });
  expect(imported.ok).toBe(true);
  expect(imported.headers.get('x-wordflow-task-id')).toBeTruthy();
  await expect(browser.$('[data-id=' + JSON.stringify('Task import') + ']')).toBeDisplayed();
  await role('button', { name: 'Cancel', exact: true }, rows()).click();
  await expect(text('Cancelled', { exact: true }, console())).toBeDisplayed();
  await expect(browser.$('[data-sonner-toast]')).not.toExist();
  const clone = await post('/api/project/nodes/Task%20import/clone', {});
  expect(clone.ok).toBe(true);
  const materialize = await post('/api/project/nodes/Task%20import/materialize', {});
  expect(materialize.ok).toBe(true);
  await expect(role('button', { name: /Task: Clone Task import/ }, rows())).not.toExist();
  await expect(role('button', { name: /Task: Materialise Task import/ }, rows())).not.toExist();
  await role('button', { name: 'Task history', exact: true }, rows()).click();
  let history = role('dialog', { name: 'Task history', exact: true });
  await expect(role('button', { name: /Task: Clone Task import/ }, history)).toBeDisplayed();
  await expect(role('button', { name: /Task: Materialise Task import/ }, history)).toBeDisplayed();
  await press('Escape');
  await expect(history).not.toExist();
  expectAppError(/missing_task_source/);
  await editor().setValue('SELECT * FROM missing_task_source');
  await press('ControlOrMeta+Enter', editor());
  await expect(text('Failed — edit and run again', {}, console())).toBeDisplayed();
  await expect(browser.$$('[data-sonner-toast]')).toBeElementsArrayOfSize(1);
  for (const theme of ['light-2026', 'dark-2026']) {
    await browser.execute((value) => {
      document.documentElement.setAttribute('data-theme', value);
      document.documentElement.style.colorScheme = value.startsWith('dark') ? 'dark' : 'light';
    }, theme);
    await browser.setViewport({ width: 1400, height: 1100 });
    await screenshot(`real-tasks-${theme}.png`, rows());
  }
  await browser.refresh();
  await browser.$('[aria-label="Data Block graph"]').waitForExist();
  await expect(role('button', { name: /Task: Materialise Task import/ }, rows())).not.toExist();
  await role('button', { name: 'Task history', exact: true }, rows()).click();
  history = role('dialog', { name: 'Task history', exact: true });
  await expect(role('button', { name: /Task: Materialise Task import/ }, history)).toBeDisplayed();
  await press('Escape');
  await expect(history).not.toExist();
  await expect(browser.$('[data-sonner-toast]')).not.toExist();
  await role('button', { name: 'Data Builder', exact: true }).click();
  await role('tab', { name: 'SQL', exact: true }).click();
  await expect(editor()).toHaveText(expect.stringContaining('missing_task_source'));
  await expect(text(/statements? completed/, {}, console())).not.toExist();
});
