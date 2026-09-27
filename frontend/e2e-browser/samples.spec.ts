import { expectAppError } from './diagnostics';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import {
  role,
  roles,
  text,
  label,
  post,
  checked,
  rect,
  screenshot,
  stubResponse,
  captureResponse,
  testId,
} from './fixtures';

import { tableFromIPC } from 'apache-arrow';

it('sample picker imports pinned remote views and survives reload', async () => {
  await browser.url('/');
  await role('tab', { name: 'Samples', exact: true }).click();
  const dialog = role('tabpanel', { name: 'Samples', exact: true });
  await expect(roles('checkbox', {}, dialog)).toBeElementsArrayOfSize(4, { wait: 30_000 });
  await checked(role('checkbox', { name: /Queensland Election/ }, dialog), true);
  await checked(role('checkbox', { name: /Honi Soit/ }, dialog), true);
  await screenshot('/tmp/wordflow-sample-picker.png');
  const response = await captureResponse('/api/project/samples/import', () =>
    role('button', { name: 'Import selected' }, dialog).click(),
  );
  expect(response.response.status).toBe(200);
  const { commit } = JSON.parse(response.body) as { commit: string };
  expect(commit).toMatch(/^[a-f0-9]{40}$/);
  expect(
    response.response.headers.some((header) => header.name.toLowerCase() === 'x-wordflow-task-id'),
  ).toBe(true);
  await expect(role('button', { name: /Task: Import sample data/ })).toBeDisplayed();
  await expect(dialog).toBeDisplayed();
    await expect(role('button', { name: 'Import selected' }, dialog)).toBeDisabled();
  await expect(browser.$$('.react-flow__node')).toBeElementsArrayOfSize(3);
  await expect(testId('project-data-overlay')).not.toExist();
  await role('button', { name: 'Select Honi_Soit', exact: true }).click();
  await expect(
    role('cell', { name: '2021_01_17_LaurenLancaster.txt', exact: true }),
  ).toBeDisplayed();
  await screenshot('/tmp/wordflow-sample-views.png');
  const query = async (sql: string) => {
    const result = await post('/api/project/sql', { statements: [{ sql }] });
    expect(result.ok).toBe(true);
    return tableFromIPC(new Uint8Array(await result.arrayBuffer())).toArray() as { sql: string }[];
  };
  const views = await query("SELECT sql FROM duckdb_views() WHERE schema_name='data'");
  expect(views).toHaveLength(3);
  const names = await query('SELECT table_name AS sql FROM wordflow.nodes ORDER BY table_name');
  expect(names.map((row) => row.sql)).toEqual([
    'Honi_Soit',
    'candidate_info_gender',
    'qldelection2020_candidate_tweets',
  ]);
  await expect(text(/Table: node_/, {}, browser.$('.react-flow__node'))).not.toExist();
  for (const view of views) {
    expect(view.sql).toContain(`/${commit}/`);
    expect(view.sql).not.toContain('/main/');
    expect(view.sql).toContain('read_parquet');
  }
  expect(
    await query("SELECT table_name FROM duckdb_tables() WHERE schema_name='data'"),
  ).toHaveLength(0);
  // A webview reload keeps the backend-owned views and their remote previews.
  await browser.refresh();
  await browser.$('[aria-label="Data Block graph"]').waitForExist();
  await role('button', { name: 'Select Honi_Soit', exact: true }).click();
  await expect(
    role('cell', { name: '2021_01_17_LaurenLancaster.txt', exact: true }),
  ).toBeDisplayed();
});

for (const theme of ['light-2026', 'dark-2026']) {
  it(`sample files can be selected individually and materialized in ${theme}`, async () => {
    await browser.addInitScript((value) => {
      localStorage.setItem('ldaca-color-theme-v1', value);
    }, theme);
    await browser.url('/');
    await role('tab', { name: 'Samples', exact: true }).click();
    const dialog = role('tabpanel', { name: 'Samples', exact: true });
    const collection = role('checkbox', { name: /Queensland Election/ }, dialog);
    await expect(collection).toBeDisplayed({ wait: 30_000 });
    await role('button', { name: /Show files in ADO — Queensland/ }, dialog).click();
    const file = role('checkbox', { name: 'candidate_info_gender.parquet', exact: true }, dialog);
    await checked(file, true);
    await expect(collection).toHaveAttribute('aria-checked', 'mixed');
    await expect(collection.$('svg.lucide-minus')).toBeDisplayed();
    await expect(collection.$('svg.lucide-check')).not.toBeDisplayed();
    await expect(text('Remote', { exact: true }, dialog)).not.toExist();
    await expect(text('1 file selected', {}, dialog)).toBeDisplayed();
    await screenshot(`sample-partial-${theme}.png`);
    await collection.click();
    await expect(collection).toHaveAttribute('aria-checked', 'true');
    await collection.click();
    await expect(file).not.toHaveAttribute('aria-checked', 'true');
    await expect(role('button', { name: 'Import selected' }, dialog)).toBeDisabled();
    await checked(file, true);
    const mode = role('checkbox', { name: 'Import as views' }, dialog);
    await expect(mode).toHaveAttribute('aria-checked', 'true');
    await checked(mode, false);
    await screenshot(`sample-table-${theme}.png`);
    const response = await captureResponse('/api/project/samples/import', () =>
      role('button', { name: 'Import selected' }, dialog).click(),
    );
    expect(response.response.status).toBe(200);
    const result = JSON.parse(response.body) as { commit: string; table_names: string[] };
    expect(result.table_names).toEqual(['candidate_info_gender']);
    await expect(dialog).toBeDisplayed();
    await expect(role('button', { name: 'Import selected' }, dialog)).toBeDisabled();
    await expect(testId('project-data-overlay')).not.toExist();
    expect(result.commit).toMatch(/^[a-f0-9]{40}$/);
    const sql = await post('/api/project/sql', {
      statements: [
        {
          sql: "SELECT CASE WHEN (SELECT count(*) FROM duckdb_tables() WHERE schema_name='data')=1 AND (SELECT count(*) FROM duckdb_views() WHERE schema_name='data')=0 AND (SELECT count(*) FROM data.candidate_info_gender)>0 THEN 1 ELSE error('Unexpected sample materialization') END",
        },
      ],
    });
    expect(sql.ok).toBe(true);
    await browser.refresh();
    await browser.$('[aria-label="Data Block graph"]').waitForExist();
    await expect(browser.$$('.react-flow__node')).toBeElementsArrayOfSize(1);
    await expect(browser.$('.react-flow__node')).toHaveText(expect.stringContaining('Type: Table'));
  });
}

it('import errors use one expandable toast without shifting the panes', async () => {
  const details = `Extension Autoloading Error: httpfs could not be loaded\n${'A long diagnostic and file path. '.repeat(70)}\nDifferent Team IDs`;
  await stubResponse('/api/project/samples', () =>
    JSON.stringify({
      commit: 'a'.repeat(40),
      collections: [
        {
          id: 'SCL',
          name: 'Honi Soit',
          description: 'Articles',
          total_size_bytes: 100,
          files: [{ path: 'SCL/articles.parquet' }],
        },
      ],
    }),
  );
  expectAppError(/httpfs could not be loaded/);
  await stubResponse(
    '/api/project/samples/import',
    () => JSON.stringify({ error: { code: 'sql_error', message: details } }),
    'application/json',
    400,
  );
  await browser.url('/');
  await role('tab', { name: 'Samples', exact: true }).click();
  const dialog = role('tabpanel', { name: 'Samples', exact: true });
  await checked(role('checkbox', { name: 'Honi Soit' }, dialog), true);
  const before = await rect(label('Data Block graph'));
  await role('button', { name: 'Import selected' }, dialog).click();
  const toast = browser.$('[data-sonner-toast]');
  await expect(browser.$$('[data-sonner-toast]')).toBeElementsArrayOfSize(1);
  await expect(text('Operation failed', { exact: true }, toast)).toBeDisplayed();
  await expect(toast.$('pre')).not.toBeDisplayed();
  await expect(dialog.$('[role="alert"]')).not.toExist();
  expect(await rect(label('Data Block graph'))).toEqual(before);
  await text('Show details', { exact: true }, toast).click();
  await expect(toast.$('pre')).toBeDisplayed();
  await expect(toast.$('pre')).toHaveText(expect.stringContaining('POST /api/project/samples/import'));
  await expect(toast.$('pre')).toHaveText(expect.stringContaining('HTTP 400'));
  await expect(toast.$('pre')).toHaveText(expect.stringContaining('"code": "sql_error"'));
  await expect(toast.$('pre')).toHaveText(expect.stringContaining('Different Team IDs'));
  await expect(dialog).toBeDisplayed();
  await browser.waitUntil(async () => {
    const box = await rect(toast);
    const content = await rect(toast.$('pre'));
    return content.y >= box.y && content.y + content.height <= box.y + box.height;
  });
  await screenshot('/tmp/wordflow-error-toast.png');
});
