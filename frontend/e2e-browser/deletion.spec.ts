import { expectAppError } from './diagnostics';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { role, testId, post } from './fixtures';

it('batch deletion is sequential and keeps failed nodes selected with one error', async () => {
  await browser.url('/');
  const seeded = await post('/api/project/sql', {
    script:
      "CREATE TABLE a AS SELECT 1 n; CREATE TABLE b(n INTEGER PRIMARY KEY); INSERT INTO b VALUES (2); CREATE TABLE b_guard(n INTEGER REFERENCES b(n)); CREATE TABLE c AS SELECT 3 n; INSERT INTO wordflow.nodes(table_name) VALUES ('a'),('b'),('c')",
  });
  expect(seeded.ok).toBe(true);
  await browser.refresh();
  await browser.$('[aria-label="Data Block graph"]').waitForExist();
  for (const name of ['a', 'b', 'c'])
    await role('button', { name: `Select ${name}`, exact: true }).click();
  let inFlight = 0;
  let maxInFlight = 0;
  const calls: string[] = [];
  await browser.sessionSubscribe({
    events: ['network.beforeRequestSent', 'network.responseStarted'],
  });
  browser.on('network.beforeRequestSent', (event) => {
    if (!event.request.url.endsWith('/delete')) return;
    calls.push(event.request.url.split('/').at(-2) ?? '');
    maxInFlight = Math.max(maxInFlight, ++inFlight);
  });
  browser.on('network.responseStarted', (event) => {
    if (event.request.url.endsWith('/delete')) inFlight--;
  });
  await role('button', { name: 'Delete (3)', exact: true }).click();
  expectAppError(/Could not drop the table.*main key table.*b_guard/i);
  await role('button', { name: 'Delete 3', exact: true }, role('alertdialog')).click();
  await expect(role('button', { name: 'Deselect b', exact: true })).toBeDisplayed();
  await expect(role('button', { name: 'Deselect a', exact: true })).not.toExist();
  await expect(role('button', { name: 'Deselect c', exact: true })).not.toExist();
  await expect(browser.$$('[data-sonner-toast]')).toBeElementsArrayOfSize(1);
  await expect(browser.$('[data-sonner-toast]')).toHaveText(
    expect.stringContaining('Could not delete Data Blocks'),
  );
  expect(calls).toEqual(['a', 'b', 'c']);
  expect(maxInFlight).toBe(1);
  await expect(testId('project-data-overlay')).not.toExist();
});
