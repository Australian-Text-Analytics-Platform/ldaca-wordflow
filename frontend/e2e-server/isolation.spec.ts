import { $, browser, expect } from '@wdio/globals';
import { afterEach, beforeEach, it } from 'mocha';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { applicationDirectories, applicationEnvironment, TEST_IDENTITY } from '../../scripts/app-environment.mjs';
import { executeSql, runSqlScript } from '../src/features/project/api';
const base = 'http://127.0.0.1:3237';
beforeEach(() => api('/api/preferences', 'PATCH', { hiddenTools: [], guidance: { enabled: false } }));
afterEach(async () => {
  const [retained, ...others] = await browser.getWindowHandles();
  for (const handle of others) {
    await browser.switchToWindow(handle);
    await browser.closeWindow();
  }
  if (retained) await browser.switchToWindow(retained);
});
async function expectDarkTheme() {
  await browser.waitUntil(
    () => browser.execute(() => document.documentElement.dataset.theme === 'dark-2026'),
    { timeout: 15_000, timeoutMsg: 'The window did not receive the shared theme' },
  );
}
async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return null;
  return response.json();
}
it('keeps windows on independent projects, reuses the same file and broadcasts shared close and preferences', async () => {
  const a = await api('/api/server/project', 'POST', { name: null });
  const b = await api('/api/server/project', 'POST', { name: null });
  await api('/api/server/project/rename', 'POST', { project_id: a.project_id, name: 'window-a.wfpj' });
  await api('/api/server/project/rename', 'POST', { project_id: b.project_id, name: 'window-b.wfpj' });
  const reopened = await api('/api/server/project', 'POST', { name: 'window-a.wfpj' });
  expect(reopened.project_id).toBe(a.project_id);
  const initial = await browser.getWindowHandle();
  await browser.url(`${base}/?project=${a.project_id}`);
  await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining('window-a'));
  await browser.newWindow(`${base}/?project=${b.project_id}`);
  const second = await browser.getWindowHandle();
  await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining('window-b'));
  await browser.newWindow(`${base}/?project=${a.project_id}`);
  const attached = await browser.getWindowHandle();
  await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining('window-a'));
  // Opening attached windows starts schema reads. Rename is deliberately idle-only.
  await browser.waitUntil(async () => {
    try {
      await api('/api/server/project/rename', 'POST', { project_id: a.project_id, name: 'renamed-a.wfpj' });
      return true;
    } catch (error) {
      if (String(error).includes('"code":"task_active"')) return false;
      throw error;
    }
  }, { timeout: 15_000, timeoutMsg: 'Attached windows did not become idle for Rename' });
  await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining('renamed-a'));
  await browser.switchToWindow(initial);
  await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining('renamed-a'));
  await browser.switchToWindow(attached);
  await browser.closeWindow();
  await browser.switchToWindow(second);
  await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining('window-b'));
  await api('/api/preferences', 'PATCH', { theme: 'dark-2026', layout: { sidebarWidth: 270 } });
  await expectDarkTheme();
  await browser.refresh();
  await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining('window-b'));
  await browser.switchToWindow(initial);
  await expectDarkTheme();
  await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining('renamed-a'));
  await api('/api/server/project/close', 'POST', { project_id: a.project_id, interrupt: false });
  await expect($('[role="status"]')).toHaveText(expect.stringContaining('This project is closed'));
  await browser.switchToWindow(second);
  await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining('window-b'));
  await browser.closeWindow();
  await browser.switchToWindow(initial);
});

it('preserves independent Builder inputs when switching projects with matching table names', async () => {
  const projects = [];
  for (const name of ['switch-a.wfpj', 'switch-b.wfpj']) {
    const project = await api('/api/server/project', 'POST', { name: null });
    await executeSql(`${base}/project/${project.project_id}`, [
        { sql: 'CREATE TABLE data.same AS SELECT 1 AS id' },
        { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('same')" },
      ], { all: true });
    await api('/api/server/project/rename', 'POST', { project_id: project.project_id, name });
    projects.push(project);
  }
  async function showJoin() {
    await $('button[aria-label="Data Builder"]').click();
    await expect($('#preprocessing-tab-join')).toBeDisplayed();
    await $('#preprocessing-tab-join').click();
  }
  async function select(name: string) {
    await $('button=Project & Data').click();
    await $(`[aria-label="Open ${name}.wfpj"]`).click();
    await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining(name));
    await showJoin();
  }
  await browser.url(`${base}/?project=${projects[0]!.project_id}`);
  await showJoin();
  await $('[data-id="same"]').doubleClick();
  await $('[role="dialog"]').$('button=Left input').click();
  await expect($('label=Left input (1/1)')).toBeDisplayed();
  await select('switch-b');
  await expect($('label=Left input (0/1)')).toBeDisplayed();
  await $('[data-id="same"]').doubleClick();
  await $('[role="dialog"]').$('button=Right input').click();
  await expect($('label=Right input (1/1)')).toBeDisplayed();
  await select('switch-a');
  await expect($('label=Left input (1/1)')).toBeDisplayed();
  await expect($('label=Right input (0/1)')).toBeDisplayed();
  await select('switch-b');
  await expect($('label=Left input (0/1)')).toBeDisplayed();
  await expect($('label=Right input (1/1)')).toBeDisplayed();
});

it('keeps a run alive while the requesting window switches to another permanent project', async () => {
  const a = await api('/api/server/project', 'POST', { name: null });
  const b = await api('/api/server/project', 'POST', { name: null });
  await browser.url(`${base}/?project=${a.project_id}`);
  await expect($('button=Project & Data')).toBeDisplayed();
  const running = runSqlScript(`${base}/project/${a.project_id}`, 'SELECT sum(hash(i)) FROM range(1000000000) t(i)', 'execute', 'Background project run');
  // Attach rejection handling immediately while the browser exercises navigation.
  const outcome = running.then(() => null, (error: unknown) => error);
  await browser.waitUntil(async () => {
    const tasks = await api(`/project/${a.project_id}/api/project/tasks`);
    return tasks.tasks.some((task: { label: string; state: string }) => task.label === 'Background project run' && task.state === 'running');
  }, { timeout: 15_000 });
  await $('button=Project & Data').click();
  await $(`[aria-label="Open ${b.project.title}.wfpj"]`).click();
  await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining(b.project.title));
  const duringSwitch = await api(`/project/${a.project_id}/api/project/tasks`);
  expect(duringSwitch.tasks.find((task: { label: string }) => task.label === 'Background project run').state).toBe('running');
  expect(await outcome).toBeNull();
  const tasks = await api(`/project/${a.project_id}/api/project/tasks`);
  expect(tasks.tasks.find((task: { label: string }) => task.label === 'Background project run').state).toBe('succeeded');
  await $('button=Project & Data').click();
  await $(`[aria-label="Open ${a.project.title}.wfpj"]`).click();
  await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining(a.project.title));
  await expect($('button[aria-label^="Task: Background project run"]')).toExist();
});

it('opens a task’s current analysis tab and purges its history when the tab is deleted', async () => {
  const project = await api('/api/server/project', 'POST', { name: null });
  const prefix = `/project/${project.project_id}`;
  await api(`${prefix}/api/project/import`, 'POST', { sources: [{ table_name: 'task_docs', sql: "SELECT 'cat dog cat' AS text" }] });
  const tab = await api(`${prefix}/api/project/tabs`, 'POST', { kind: 'frequency', name: 'Reviewed study' });
  await api(`${prefix}/api/project/tabs/${tab.id}/frequency`, 'POST', { inputs: [{ source: { schema: 'data', name: 'task_docs' }, column: 'text', tokenizer: 'native:plain_words_en' }] });
  await browser.url(`${base}/?project=${project.project_id}`);
  await $('button[aria-label^="Task: Reviewed study"]').click();
  await expect($('button=Open tab')).toBeDisplayed();
  await $('button=Open tab').click();
  await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining('Frequency'));
  await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining('Reviewed study'));
  await api(`${prefix}/api/project/tabs/${tab.id}`, 'POST', { name: 'Updated study' });
  await expect($('button[aria-label^="Task: Updated study"]')).toExist();
  await api(`${prefix}/api/project/tabs/${tab.id}`, 'DELETE');
  await expect($('button[aria-label^="Task: Updated study"]')).not.toExist();
  const tasks = await api(`${prefix}/api/project/tasks`);
  expect(tasks.tasks).toHaveLength(1);
  expect(tasks.tasks[0].tab_id).toBeUndefined();
});

it('retains preferences and saved projects after the server process restarts', async () => {
  const directory = await mkdtemp(join(applicationDirectories(TEST_IDENTITY).temporary, 'restart-'));
  const executable = process.env.WORDFLOW_SERVER_BINARY ?? resolve('../target/debug/wordflow-server');
  let child: ChildProcess | undefined;
  let stopped: Promise<unknown> | undefined;
  async function start() {
    child = spawn(executable, ['--identity', TEST_IDENTITY, '--bind', '127.0.0.1:0', '--data-dir', directory], {
      env: { ...process.env, ...applicationEnvironment(TEST_IDENTITY), RUST_LOG: 'info' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let logs = '';
    child.stderr!.on('data', (data) => { logs += data; });
    stopped = new Promise((done, reject) => { child!.once('exit', done); child!.once('error', reject); });
    void stopped.catch(() => {});
    let address: string | undefined;
    await browser.waitUntil(() => {
      if (child!.exitCode !== null) throw new Error(`Restart fixture exited: ${logs}`);
      address = /address=(127\.0\.0\.1:\d+)/.exec(logs)?.[1];
      return Boolean(address);
    }, { timeout: 30_000, timeoutMsg: 'Restart fixture did not become ready' });
    return `http://${address}`;
  }
  async function stop() {
    if (child && child.exitCode === null) child.kill('SIGTERM');
    await stopped;
    child = undefined;
  }
  async function request(host: string, path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`${host}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }
  try {
    const first = await start();
    const project = await request(first, '/api/server/project', 'POST', { name: null });
    await request(first, '/api/server/project/rename', 'POST', { project_id: project.project_id, name: 'restart.wfpj' });
    await request(first, '/api/preferences', 'PATCH', { theme: 'dark-2026', layout: { sidebarWidth: 290 } });
    await browser.url(`${first}/?project=${project.project_id}`);
    await expectDarkTheme();
    await browser.url('about:blank');
    await stop();
    const second = await start();
    const preferences = await request(second, '/api/preferences');
    expect(preferences.layout.sidebarWidth).toBe(290);
    await browser.url(`${second}/?project=${project.project_id}`);
    await expectDarkTheme();
    await expect($('[role="status"]')).toHaveText(expect.stringContaining('Reopen it from the library'));
    const reopened = await request(second, '/api/server/project', 'POST', { name: 'restart.wfpj' });
    expect(reopened.project_id).not.toBe(project.project_id);
    await browser.url(`${second}/?project=${reopened.project_id}`);
    await expect($('[aria-label="Current location"]')).toHaveText(expect.stringContaining('restart'));
  } finally {
    await browser.url(base);
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
