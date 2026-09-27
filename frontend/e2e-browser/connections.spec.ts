import { expectAppError } from './diagnostics';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { get, post, press, rect, role, testId, checked, screenshot } from './fixtures';

const card = (id: string) => browser.$(`.react-flow__node[data-id='${id}']`);
const edge = (source: string, target: string) => browser.$(`.react-flow__edge[data-id='${JSON.stringify([source, target]).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}']`);
async function sql(script: string) {
  const response = await post('/api/project/sql', { script, response: 'command' });
  if (!response.ok) throw new Error(await response.text());
}
async function addLink(from: string, direction: 'parent' | 'child', to?: string) {
  await card(from).$('[tabindex="0"]').execute((el) => { el.focus(); });
  await role('button', { name: 'Data Block actions', exact: true }).click();
  await role('menuitem', { name: `Add logical ${direction}`, exact: true }).click();
  if (to) await card(to).click();
}
async function selectEdge(source: string, target: string) {
  const point: { x: number; y: number } = await (await edge(source, target).$('.react-flow__edge-path').getElement()).execute((el) => {
    const path = el as unknown as SVGPathElement;
    const transform = path.getScreenCTM();
    if (!transform) throw new Error('Edge is not on the canvas');
    const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(transform);
    return { x: point.x, y: point.y };
  });
  await browser.action('pointer').move({ x: Math.round(point.x), y: Math.round(point.y) }).down().up().perform();
  await expect(edge(source, target).$('.react-flow__edgeupdater-source')).toBeDisplayed();
  await expect(edge(source, target).$('.react-flow__edge-path')).toHaveStyle({ 'stroke-width': '3px' });
  await expect(edge(source, target).$('.react-flow__edgeupdater-source')).toHaveStyle({ stroke: 'rgba(0,0,0,0)', fill: 'rgba(0,0,0,0)' });
  await expect(browser.$('p[role="status"]')).toHaveText(expect.stringContaining('Drag the edge near its source'));
  await expect(edge(source, target).$('.react-flow__edgeupdater-target')).not.toExist();
}
async function reconnect(source: string, target: string, replacement: string) {
  await selectEdge(source, target);
  const start = await rect(edge(source, target).$('.react-flow__edgeupdater-source'));
  const end = await rect(card(replacement));
  await browser.action('pointer', { id: 'mouse' }).move({ x: Math.round(start.x + start.width / 2), y: Math.round(start.y + start.height / 2) }).down().move({ x: Math.round(start.x + start.width / 2 + 40), y: Math.round(start.y + start.height / 2 + 40), duration: 200 }).perform(true);
  const preview = browser.$('.react-flow__connection-path');
  await expect(preview).toBeDisplayed();
  await expect(preview).toHaveStyle({ 'stroke-width': '2px' });
  const initialPath = await preview.getAttribute('d');
  if (!initialPath) throw new Error('Reconnection preview has no path');
  await browser.action('pointer', { id: 'mouse' }).move({ x: Math.round(end.x + end.width / 2), y: Math.round(end.y + end.height / 2), duration: 300 }).perform(true);
  await expect(preview).not.toHaveAttribute('d', initialPath);
  await screenshot('dependency-drag.png');
  await browser.action('pointer', { id: 'mouse' }).up().perform();
}

it('adds logical links, cancels picking and redirects SQL dependencies with native dragging', async () => {
  await sql("CREATE TABLE source AS SELECT 1 AS n; CREATE TABLE replacement AS SELECT 9 AS n; CREATE VIEW child AS SELECT * FROM source; INSERT INTO wordflow.nodes(table_name) VALUES ('source'),('replacement'),('child')");
  await browser.url('/');
  await role('button', { name: 'Fit view', exact: true }).click();
  await browser.$('.react-flow__viewport').waitForStable();
  await expect(edge('source', 'child').$('.react-flow__edge-path')).not.toHaveAttribute('marker-start');
  const sourceHandle = card('source').$('.react-flow__handle.source:not([data-handleid])');
  await expect(sourceHandle).toHaveStyle({ opacity: '1' });
  await expect(sourceHandle).toHaveStyle({ width: '12px', height: '12px', 'border-top-width': '2px' });
  const handleBounds = await rect(sourceHandle);
  const sourceBounds = await rect(card('source'));
  expect(Math.abs(handleBounds.y + handleBounds.height / 2 - sourceBounds.y - sourceBounds.height)).toBeLessThan(1);
  await expect(edge('source', 'child').$('.react-flow__edgeupdater-source')).not.toExist();
  await expect(browser.$('[aria-label="Graph relationships"]')).not.toExist();
  await addLink('child', 'parent');
  const bounds = await rect(card('replacement'));
  await browser.action('pointer').move({ x: Math.round(bounds.x + 20), y: Math.round(bounds.y + 20) }).perform();
  await expect(testId('logical-connection-preview')).toExist();
  await press('Escape');
  await expect(testId('logical-connection-preview')).not.toExist();
  await addLink('source', 'child', 'child');
  await sql("SELECT CASE WHEN (SELECT count(*) FROM wordflow.edges)=1 THEN true ELSE error('Logical link missing') END");
  await addLink('child', 'parent', 'source');
  await sql("SELECT CASE WHEN (SELECT count(*) FROM wordflow.edges)=1 THEN true ELSE error('Duplicate link') END");
  await expect(role('status', { name: '0 of 3 selected', exact: true })).toExist();
  await expect(testId('project-data-overlay')).not.toExist();
  await selectEdge('source', 'child');
  const start = await rect(edge('source', 'child').$('.react-flow__edgeupdater-source'));
  const canvas = await rect(browser.$('[aria-label="Data Block graph"]'));
  await browser.action('pointer', { id: 'mouse' }).move({ x: Math.round(start.x + start.width / 2), y: Math.round(start.y + start.height / 2) }).down().move({ x: Math.round(canvas.x + canvas.width - 35), y: Math.round(canvas.y + 230), duration: 300 }).up().perform();
  await expect(edge('source', 'child')).toHaveAttribute('aria-label', 'child reads source. SQL dependency.');
  await sql("SELECT CASE WHEN (SELECT n FROM child)=1 THEN true ELSE error('Invalid drop changed SQL') END");
  await reconnect('source', 'child', 'replacement');
  await expect(edge('replacement', 'child')).toHaveAttribute('aria-label', 'child reads replacement. SQL dependency.');
  await expect(edge('source', 'child')).toHaveAttribute('aria-label', 'Virtual link from source to child.');
  await sql("SELECT CASE WHEN (SELECT n FROM child)=9 THEN true ELSE error('Source not replaced') END");
  await expect(role('status', { name: '0 of 3 selected', exact: true })).toExist();
  await expect(testId('project-data-overlay')).not.toExist();
  for (const dark of [false, true]) {
    await role('button', { name: 'Open settings' }).click();
    await checked(role('switch', { name: 'Use Dark 2026 theme' }), dark);
    await role('button', { name: 'Close', exact: true }, role('dialog')).click();
    await selectEdge('replacement', 'child');
    await screenshot(`dependency-selected-${dark ? 'dark' : 'light'}.png`);
    await addLink('child', 'parent');
    await screenshot(`connections-${dark ? 'dark' : 'light'}.png`);
    await press('Escape');
  }
});

it('replaces an unregistered dependency by keyboard and keeps failed edits intact', async () => {
  await sql('CREATE SCHEMA connections; CREATE TABLE connections.original AS SELECT 2 AS n; CREATE TABLE connections.other AS SELECT 4 AS n; CREATE TABLE connections.bad AS SELECT 3 AS incompatible; CREATE VIEW connections.child AS SELECT n+1 AS n FROM connections.original');
  await browser.url('/');
  await role('button', { name: 'Show Dependencies', exact: true }).click();
  const id = (name: string) => JSON.stringify(['connections', name]);
  await expect(card(id('child'))).toExist();
  await edge(id('original'), id('child')).execute((el) => { (el as unknown as SVGElement).focus(); });
  await browser.keys('Enter');
  expectAppError(/Column "n" referenced.*cannot be referenced before it is defined/i);
  await press('Enter', card(id('bad')).$('[tabindex="0"]'));
  await expect(browser.$$('[data-sonner-toast]')).toBeElementsArrayOfSize(1);
  await expect(edge(id('original'), id('child'))).toExist();
  await sql("SELECT CASE WHEN (SELECT n FROM connections.child)=3 THEN true ELSE error('Failed edit changed View') END");
  await edge(id('original'), id('child')).execute((el) => { (el as unknown as SVGElement).focus(); });
  await browser.keys('Enter');
  await press('Enter', card(id('other')).$('[tabindex="0"]'));
  await expect(edge(id('other'), id('child'))).toExist();
  await sql("SELECT CASE WHEN (SELECT count(*) FROM wordflow.nodes)=0 AND (SELECT n FROM connections.child)=5 THEN true ELSE error('Registered or redirected wrong target') END");
  const graph = await (await get('/api/project/graph')).json() as { nodes: unknown[] };
  expect(graph.nodes).toHaveLength(0);
  await expect(testId('project-data-overlay')).not.toExist();
  await sql('DROP SCHEMA connections CASCADE');
});
