import { expectAppError } from './diagnostics';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { checked, clearResponseStubs, hover, post, press, rect, role, screenshot, stubResponse, testId } from './fixtures';

const objectCard = (schema: string, name: string) => browser.$(`.react-flow__node[data-id='${JSON.stringify([schema, name])}']`);
async function toolbar(schema: string, name: string, action: string) {
  const card = objectCard(schema, name);
  await hover(card);
  const button = role('button', { name: action, exact: true });
  const bounds = await rect(button);
  await browser.action('pointer', { id: 'mouse' }).move({ x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2), duration: 200 }).perform(true);
  await button.click();
}
async function sql(script: string) {
  const response = await post('/api/project/sql', { script, response: 'command' });
  if (!response.ok) throw new Error(await response.text());
}

it('switches graph projections, retains preview and canvas state, and clones without registration', async () => {
  await post('/api/project/import', { sources: [{ table_name: 'visible', sql: "SELECT 1 AS n, 'hidden rows' AS text" }] });
  await sql('CREATE SCHEMA other; CREATE TABLE other.extra AS SELECT 42 AS n; CREATE VIEW other.dependent AS SELECT * FROM other.extra;');
  await browser.url('/');
  const toggle = role('button', { name: 'Show Dependencies', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await role('button', { name: 'Select visible', exact: true }).click();
  await role('button', { name: 'Close preview' }).click();
  await expect(testId('project-data-overlay')).not.toExist();
  await browser.$('.react-flow__viewport').waitForStable();
  const logicalViewport = await browser.$('.react-flow__viewport').getAttribute('style');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(browser.$$('.react-flow__node')).toBeElementsArrayOfSize(4);
  await expect(role('status', { name: '0 of 4 selected', exact: true })).toExist();
  await expect(browser.$$('.react-flow__edge')).toBeElementsArrayOfSize(2);
  await objectCard('other', 'extra').click();
  await expect(role('status', { name: '1 of 4 selected', exact: true })).toExist();
  await expect(role('button', { name: 'Deselect visible', exact: true })).toExist();
  await toolbar('data', 'visible_raw', 'Preview data');
  await expect(role('cell', { name: 'hidden rows', exact: true })).toBeDisplayed();
  await expect(role('button', { name: 'Add Data Block to selection', exact: true })).not.toExist();
  await press('End', role('separator', { name: 'Resize graph and data panels' }));
  await testId('project-data-overlay').waitForStable();
  const dependencyViewport = await browser.$('.react-flow__viewport').getAttribute('style');
  await toggle.click();
  await expect(browser.$$('.react-flow__node')).toBeElementsArrayOfSize(1);
  await expect(role('cell', { name: 'hidden rows', exact: true })).toBeDisplayed();
  expect(await browser.$('.react-flow__viewport').getAttribute('style')).toBe(logicalViewport);
  await toggle.click();
  await expect(role('status', { name: '1 of 4 selected', exact: true })).toExist();
  expect(await browser.$('.react-flow__viewport').getAttribute('style')).toBe(dependencyViewport);
  await role('button', { name: 'Close preview' }).click();
  await expect(testId('project-data-overlay')).not.toExist();
  await toolbar('other', 'extra', 'Data Block actions');
  await role('menuitem', { name: 'Clone', exact: true }).click();
  await expect(objectCard('other', 'extra_copy')).toExist();
  await expect(testId('project-data-overlay')).not.toExist();
  await sql("SELECT CASE WHEN (SELECT count(*) FROM wordflow.nodes)=2 AND (SELECT n FROM other.extra_copy)=42 THEN true ELSE error('Clone registered or changed data') END");
  await role('button', { name: 'Fit view', exact: true }).click();
  await browser.$('.react-flow__viewport').waitForStable();
  for (const dark of [false, true]) {
    await role('button', { name: 'Open settings' }).click();
    await checked(role('switch', { name: 'Use Dark 2026 theme' }), dark);
    await role('button', { name: 'Close', exact: true }, role('dialog')).click();
    await screenshot(`dependencies-${dark ? 'dark' : 'light'}.png`);
  }
  await toolbar('other', 'extra_copy', 'Data Block actions');
  await role('menuitem', { name: 'Rename', exact: true }).click();
  const rename = role('alertdialog');
  await expect(role('textbox', {}, rename)).toHaveValue('extra_copy');
  await press('ControlOrMeta+a', role('textbox', {}, rename));
  await role('textbox', {}, rename).addValue('renamed');
  await role('button', { name: 'Rename', exact: true }, rename).click();
  await expect(objectCard('other', 'renamed')).toExist();
  await toolbar('other', 'renamed', 'Preview data');
  await expect(role('cell', { name: '42', exact: true })).toBeDisplayed();
  await role('button', { name: 'Change data type for column n' }).click();
  await role('menuitemradio', { name: 'string', exact: true }).click();
  await expect(role('button', { name: 'Change data type for column n' })).toHaveText('string');
  await sql("SELECT CASE WHEN typeof(n)='VARCHAR' THEN true ELSE error('Wrong cast target') END FROM other.renamed");
  await role('button', { name: 'Close preview' }).click();
  await expect(testId('project-data-overlay')).not.toExist();
  await toolbar('other', 'renamed', 'Data Block actions');
  await role('menuitem', { name: 'Delete', exact: true }).click();
  await role('button', { name: 'Delete', exact: true }, role('alertdialog')).click();
  await expect(objectCard('other', 'renamed')).not.toExist();
  await toggle.click();
  await expect(role('button', { name: 'Deselect visible', exact: true })).toExist();
  await sql('DROP SCHEMA other CASCADE');
});


it('keeps graph controls and logical state available after dependency loading fails', async () => {
  await post('/api/project/import', { sources: [{ table_name: 'kept', sql: 'SELECT 1 AS n' }] });
  await browser.url('/');
  await role('button', { name: 'Select kept', exact: true }).click();
  await role('button', { name: 'Close preview' }).click();
  expectAppError(/Test catalogue failure/);
  await stubResponse('/api/project/graph?mode=dependencies', () => JSON.stringify({ error: { code: 'inspection_failed', message: 'Test catalogue failure' } }), 'application/json', 400);
  const toggle = role('button', { name: 'Show Dependencies', exact: true });
  await toggle.click();
  await expect(role('button', { name: 'Retry graph', exact: true })).toBeDisplayed();
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(role('status', { name: '1 of 1 selected', exact: true })).toExist();
  await clearResponseStubs();
  await toggle.click();
  await expect(browser.$$('.react-flow__node')).toBeElementsArrayOfSize(2);
});

it('draws calculated and virtual arrows and retains lineage when materializing', async () => {
  await post('/api/project/import', { sources: [{ table_name: 'source', sql: 'SELECT 1 AS n' }] });
  await sql("CREATE VIEW live AS SELECT * FROM source; CREATE TABLE snapshot AS SELECT * FROM source; INSERT INTO wordflow.nodes(table_name) VALUES ('live'),('snapshot'); INSERT INTO wordflow.edges VALUES ('source','snapshot')");
  await browser.url('/');
  const live = browser.$('.react-flow__edge[aria-label="live reads source. SQL dependency."]');
  const virtual = browser.$('.react-flow__edge[aria-label="Virtual link from source to snapshot."]');
  await expect(live).toExist();
  await expect(live.$('.react-flow__edge-path')).toHaveAttribute('marker-end', expect.stringContaining('arrowclosed'));
  await expect(virtual.$('.react-flow__edge-path')).toHaveAttribute('marker-end', expect.stringContaining('type=arrow&'));
  await expect(virtual.$('.react-flow__edge-path')).toHaveAttribute('style', expect.stringMatching(/stroke-dasharray: 6,?\s+4/));
  await expect(browser.$('[aria-label="Graph relationships"]')).not.toExist();
  for (const dark of [false, true]) {
    await role('button', { name: 'Open settings' }).click();
    await checked(role('switch', { name: 'Use Dark 2026 theme' }), dark);
    await role('button', { name: 'Close', exact: true }, role('dialog')).click();
    await screenshot(`relationships-${dark ? 'dark' : 'light'}.png`);
  }
  await post('/api/project/nodes/live/materialize', {});
  await browser.refresh();
  await expect(browser.$('.react-flow__edge[aria-label="Virtual link from source to live."]')).toExist();
  await role('button', { name: 'Show Dependencies', exact: true }).click();
  await expect(browser.$$('.react-flow__edge')).toBeElementsArrayOfSize(1);
  await expect(browser.$('[aria-label="Graph relationships"]')).not.toExist();
  await expect(browser.$('.react-flow__edge')).toHaveAttribute('aria-label', 'data.source reads data.source_raw. SQL dependency.');
});
