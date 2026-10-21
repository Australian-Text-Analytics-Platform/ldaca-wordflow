import { setTestPreferences } from './fixtures';
import { expectAppError } from './diagnostics';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import {
  role,
  text,
  label,
  post,
  checked,
  rect,
  screenshot,
  stubResponse,
  captureResponse,
  testId,
  press,
} from './fixtures';

import { tableFromIPC } from 'apache-arrow';

it('sample picker imports pinned remote views and survives reload', async () => {
  await browser.url('/');
  await role('tab', { name: 'Samples', exact: true }).click();
  const dialog = role('tabpanel', { name: 'Samples', exact: true });
  await expect(role('checkbox', { name: /Reddit/ }, dialog)).toBeDisplayed({ wait: 60_000 });
  await checked(role('checkbox', { name: /Reddit/ }, dialog), true);
  await checked(role('checkbox', { name: /Hansard, GST/ }, dialog), true);
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
  await role('button', { name: 'Task history', exact: true }).click();
  const history = role('dialog', { name: 'Task history', exact: true });
  await expect(role('button', { name: /Task: Import sample data/ }, history)).toBeDisplayed();
  await press('Escape');
  await expect(history).not.toExist();
  await expect(dialog).toBeDisplayed();
  await expect(role('button', { name: 'Import selected' }, dialog)).toBeDisabled();
  await expect(browser.$$('.react-flow__node')).toBeElementsArrayOfSize(7);
  await expect(testId('project-data-overlay')).not.toExist();
  await role('button', { name: 'Select speaker_detail', exact: true }).click();
  await expect(testId('project-data-overlay').$('tbody tr')).toBeDisplayed();
  await screenshot('/tmp/wordflow-sample-views.png');
  const query = async (sql: string) => {
    const result = await post('/api/project/sql', { statements: [{ sql }] });
    expect(result.ok).toBe(true);
    return tableFromIPC(new Uint8Array(await result.arrayBuffer())).toArray() as { sql: string }[];
  };
  const views = await query("SELECT sql FROM duckdb_views() WHERE schema_name='data'");
  expect(views).toHaveLength(7);
  const names = await query('SELECT table_name AS sql FROM wordflow.nodes ORDER BY table_name');
  expect(names.map((row) => row.sql)).toEqual([
    'Hansard_AU_gst_context_metadata',
    'Hansard_AU_gst_metadata',
    'newstalk_comments',
    'newstalk_stories',
    'reddit_comments',
    'reddit_submissions',
    'speaker_detail',
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
  await role('button', { name: 'Select speaker_detail', exact: true }).click();
  await expect(testId('project-data-overlay').$('tbody tr')).toBeDisplayed();
});

for (const theme of ['light-2026', 'dark-2026']) {
  it(`sample files can be selected individually and materialized in ${theme}`, async () => {
    await setTestPreferences({ theme });
    await browser.url('/');
    await role('tab', { name: 'Samples', exact: true }).click();
    const dialog = role('tabpanel', { name: 'Samples', exact: true });
    const collection = role('checkbox', { name: /Hansard, GST/ }, dialog);
    await expect(collection).toBeDisplayed({ wait: 30_000 });
    await role('button', { name: /Show files in RAPID-CDL: Australian Hansard, GST/ }, dialog).click();
    const file = role('checkbox', { name: 'speaker_detail.parquet', exact: true }, dialog);
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
    expect(result.table_names).toEqual(['speaker_detail']);
    await expect(dialog).toBeDisplayed();
    await expect(role('button', { name: 'Import selected' }, dialog)).toBeDisabled();
    await expect(testId('project-data-overlay')).not.toExist();
    expect(result.commit).toMatch(/^[a-f0-9]{40}$/);
    const sql = await post('/api/project/sql', {
      statements: [
        {
          sql: "SELECT CASE WHEN (SELECT count(*) FROM duckdb_tables() WHERE schema_name='data')=1 AND (SELECT count(*) FROM duckdb_views() WHERE schema_name='data')=0 AND (SELECT count(*) FROM data.speaker_detail)>0 THEN 1 ELSE error('Unexpected sample materialization') END",
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

it('import errors stay beside the sample picker with Details and Retry without shifting the panes', async () => {
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
  const error = role('alert', { name: 'Could not import samples' }, dialog);
  await expect(error).toBeDisplayed();
  await expect(browser.$('[data-sonner-toast]')).not.toExist();
  await expect(error.$('pre')).not.toBeDisplayed();
  await expect(role('button', { name: 'Retry' }, error)).toBeEnabled();
  await expect(role('button', { name: 'Copy details' }, error)).toBeEnabled();
  await expect(role('button', { name: 'Feedback' }, error)).toBeEnabled();
  expect(await rect(label('Data Block graph'))).toEqual(before);
  await error.$('summary').click();
  await expect(error.$('pre')).toBeDisplayed();
  await expect(error.$('pre')).toHaveText(expect.stringContaining('POST /api/project/samples/import'));
  await expect(error.$('pre')).toHaveText(expect.stringContaining('HTTP 400'));
  await expect(error.$('pre')).toHaveText(expect.stringContaining('"code": "sql_error"'));
  await expect(error.$('pre')).toHaveText(expect.stringContaining('Different Team IDs'));
  await expect(dialog).toBeDisplayed();
  const height = await error.$('pre').getSize('height');
  expect(height).toBeLessThanOrEqual(224);
  await screenshot('/tmp/wordflow-error-samples.png');
});
