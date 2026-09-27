import { expectAppError } from './diagnostics';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { role, text, testId, post, get, remove, press, screenshot, stubResponse } from './fixtures';

import type { NativeTask, TaskSnapshot } from '../src/features/project/api';

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
  let snapshot: TaskSnapshot = { revision: 1, tasks: [running, failed] };
  await stubResponse('/api/project/tasks', () => JSON.stringify(snapshot));
  await stubResponse(
    '/api/project/events',
    () => `event: tasks\ndata: ${JSON.stringify(snapshot)}\n\n`,
    'text/event-stream',
  );
  await browser.url('/');
  const rows = () => testId('sidebar-section-tasks');
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
  }
  snapshot = {
    revision: 2,
    tasks: [{ ...running, state: 'cancelled', finished_at: Date.now() }, failed],
  };
  await stubResponse(`/api/project/tasks/${running.id}/cancel`, () => JSON.stringify(snapshot));
  await role('button', { name: 'Cancel', exact: true }, rows()).click();
  await expect(text(/Cancelled/, {}, rows())).toBeDisplayed();
  snapshot = { revision: 3, tasks: snapshot.tasks.filter((task) => task.id !== failed.id) };
  await stubResponse(`/api/project/tasks/${failed.id}`, () => JSON.stringify(snapshot));
  await role('button', { name: 'Dismiss', exact: true, index: -1 }, rows()).click();
  await expect(role('button', { name: /Task: Unavailable source/ }, rows())).not.toExist();
  await expect(role('button', { name: /Task: Inspect corpus/ }, rows())).toBeDisplayed();
});

it('real SQL tasks cancel independently, refresh project data and keep failed source saved', async () => {
  const existing = (await (await get('/api/project/tasks')).json()) as TaskSnapshot;
  for (const task of existing.tasks) {
    if (task.finished_at !== null) await remove(`/api/project/tasks/${task.id}`);
  }
  await browser.url('/');
  await role('button', { name: 'Preprocessing', exact: true }).click();
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
  await expect(role('button', { name: /Task: Clone Task import/ }, rows())).toBeDisplayed();
  await expect(role('button', { name: /Task: Materialize Task import/ }, rows())).toBeDisplayed();
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
  await expect(role('button', { name: /Task: Materialize Task import/ }, rows())).toBeDisplayed();
  await expect(browser.$('[data-sonner-toast]')).not.toExist();
  await role('button', { name: 'Preprocessing', exact: true }).click();
  await role('tab', { name: 'SQL', exact: true }).click();
  await expect(editor()).toHaveText(expect.stringContaining('missing_task_source'));
  await expect(text(/statements? completed/, {}, console())).not.toExist();
});
