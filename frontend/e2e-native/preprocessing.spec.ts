import { browser, $, expect } from '@wdio/globals';
import { it } from 'mocha';
import * as api from '../src/features/project/api';

it('native preprocessing creates live Views without destination selectors or input changes', async () => {
  const { url } = await browser.tauri.execute(
    ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
  );
  await api.executeSql(url, [
    { sql: 'CREATE TABLE data.native_input AS SELECT 1 AS n' },
    { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('native_input')" },
  ], { all: true });
  await browser.refresh();
  await $('button=Preprocessing').click();
  for (const tool of ['filter', 'slice', 'join', 'concat', 'find', 'build']) {
    await $(`#preprocessing-tab-${tool}`).click();
    await browser.keys('Enter');
    const pane = $(`#preprocessing-panel-${tool}`);
    await expect(pane).toBeDisplayed();
    await expect(pane.$('[aria-label="Result type"]')).not.toExist();
    await expect(pane.$('[aria-label="Apply result as"]')).not.toExist();
  }
  const pane = $('#preprocessing-panel-build');
  await pane.$('button=Add data block').click();
  await $('button=native_input').click();
  await pane.$('[aria-label="Add column n"]').click();
  await pane.$('[aria-label="New Data Block name"]').setValue('native_built');
  await pane.$('button=Create Data Block').click();
  await browser.waitUntil(async () =>
    (await api.graph(url)).nodes.some((node) => node.table_name === 'native_built'),
  );
  expect(
    (await api.graph(url)).nodes.find((node) => node.table_name === 'native_built')?.kind,
  ).toBe('view');
  expect((await api.nodeSchema(url, 'native_input')).map((column) => column.name)).toEqual(['n']);
  await expect($('[data-testid="project-data-overlay"]')).not.toExist();
  await api.executeSql(url, [{ sql: 'INSERT INTO data.native_input VALUES (2)' }], { all: true });
  expect(
    (await api.querySql(url, [{ sql: 'SELECT * FROM data.native_built' }])).numRows,
  ).toBe(2);
  await browser.saveScreenshot('.tmp/wdio/preprocessing-view-only-native.png');
});

it('native Find adds and replaces columns in the selected Table or View', async () => {
  const { url } = await browser.tauri.execute(
    ({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>,
  );
  await api.executeSql(url, [
    { sql: "CREATE TABLE data.find_table AS SELECT 'abc123' AS text" },
    { sql: 'CREATE VIEW data.find_view AS SELECT text FROM data.find_table' },
    { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('find_table'),('find_view')" },
  ], { all: true });
  await browser.refresh();
  await $('button=Preprocessing').click();
  await $('#preprocessing-tab-find').click();
  await browser.keys('Enter');
  const pane = $('#preprocessing-panel-find');
  const before = (await api.graph(url)).nodes.map(({ table_name }) => table_name);
  for (const [name, theme] of [
    ['find_table', 'light'],
    ['find_view', 'dark'],
  ] as const) {
    await browser.execute((value) => {
      document.documentElement.setAttribute('data-theme', `${value}-2026`);
      document.documentElement.style.colorScheme = value;
    }, theme);
    await pane.$('button=Add data block').click();
    await $(`button=${name}`).click();
    await pane.$('#find-pattern').setValue('\\d+');
    await pane.$('#find-replacement').setValue('#');
    await pane.$('#replace-output-column').setValue('found');
    await expect(pane.$('[aria-label="New Data Block name"]')).not.toExist();
    await pane.$('button=Apply').click();
    await browser.waitUntil(async () =>
      (await api.nodeSchema(url, name)).some(({ name }) => name === 'found'),
    );
    expect((await api.rowPage(url, name, 1, 10, [])).rows[0]?.found).toBe('abc#');
    expect((await api.graph(url)).nodes.map(({ table_name }) => table_name)).toEqual(before);
    await expect($('[data-testid="project-data-overlay"]')).not.toExist();
    await pane.$('#find-replacement').setValue('!');
    await pane.$('button=Apply').click();
    await browser.waitUntil(
      async () => (await api.rowPage(url, name, 1, 10, [])).rows[0]?.found === 'abc!',
    );
    await expect(pane.$('td=abc!')).toBeDisplayed();
    await browser.saveScreenshot(`.tmp/wdio/find-in-place-${theme}-native.png`);
    await pane.$('button=Clear all').click();
  }
  await api.undoNode(url, 'find_view');
  expect((await api.rowPage(url, 'find_view', 1, 10, [])).rows[0]?.found).toBe('abc#');
});
