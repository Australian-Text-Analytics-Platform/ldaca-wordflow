import { browser, $, expect } from '@wdio/globals';
import { it } from 'mocha';

async function sql(script: string) {
  const status = await browser.tauri.execute(({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>);
  const response = await fetch(`${status.url}/api/project/sql`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ script, response: 'command' }) });
  if (!response.ok) throw new Error(await response.text());
}
const card = (id: string) => $(`.react-flow__node[data-id='${id}']`);
const edge = (source: string, target: string) => $(`.react-flow__edge[data-id='${JSON.stringify([source, target]).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}']`);
async function focusCard(id: string) {
  await card(id).$('[tabindex="0"]').execute((el) => { el.focus(); });
}
async function parentMenu(id: string) {
  await focusCard(id);
  await $('button[aria-label="Data Block actions"]').click();
  await browser.keys('ArrowDown');
  await $('[role="menuitem"]=Add logical parent').click();
}

it('adds logical parents and reconnects dependencies in the native webview', async () => {
  const bounds = async (selector: string): Promise<{ x: number; y: number }> => (await $(selector).getElement()).execute((el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; });
  await sql("CREATE TABLE data.link_source AS SELECT 1 AS n; CREATE TABLE data.link_replacement AS SELECT 8 AS n; CREATE VIEW data.link_child AS SELECT * FROM data.link_source; INSERT INTO wordflow.nodes(table_name) VALUES ('link_source'),('link_replacement'),('link_child')");
  await browser.refresh();
  await $('button[aria-label="Fit view"]').click();
  await $('.react-flow__viewport').waitForStable();
  await expect(edge('link_source', 'link_child').$('.react-flow__edge-path')).not.toHaveAttribute('marker-start');
  await expect(card('link_source').$('.react-flow__handle.source:not([data-handleid])')).toHaveStyle({ opacity: '1' });
  await browser.action('pointer').move(await bounds('.react-flow__node[data-id="link_source"]')).down().up().perform();
  // The embedded driver sends mousemove without synthesizing hover boundary events.
  await card('link_source').$('[tabindex="0"]').execute((el) => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })));
  const toolbar = $('[data-node-toolbar-id="link_source"]');
  await expect(toolbar).toBeDisplayed();
  const toolbarBottom = await (await toolbar.getElement()).execute((el) => el.getBoundingClientRect().bottom);
  const cardTop = await (await card('link_source').getElement()).execute((el) => el.getBoundingClientRect().top);
  expect(toolbarBottom).toBeLessThanOrEqual(cardTop + 1);
  await browser.saveScreenshot('.tmp/wdio/graph-tail-toolbar-native.png');
  await browser.action('pointer').move({ x: 400, y: 100 }).perform();
  await card('link_source').$('[tabindex="0"]').execute((el) => el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })));
  await expect(toolbar).not.toExist();
  await expect($('[aria-label="Graph relationships"]')).not.toExist();
  await parentMenu('link_child');
  await focusCard('link_source');
  await browser.keys('Enter');
  await sql("SELECT CASE WHEN (SELECT count(*) FROM wordflow.edges WHERE source_name='link_source' AND target_name='link_child')=1 THEN true ELSE error('Native logical parent missing') END");
  await expect($('[data-testid="project-data-overlay"]')).not.toExist();
  const midpoint = await (await edge('link_source', 'link_child').$('.react-flow__edge-path').getElement()).execute((element) => {
    const path = element as unknown as SVGPathElement;
    const transform = path.getScreenCTM();
    if (!transform) throw new Error('Edge is not on the canvas');
    const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(transform);
    // Hit the invisible interaction stroke, outside the thin visible line.
    const hit = document.elementFromPoint(point.x + 5 * transform.a, point.y);
    if (hit?.closest('.react-flow__edge') !== path.closest('.react-flow__edge')) {
      throw new Error('The dependency edge has no usable interaction stroke');
    }
    return { x: Math.round(point.x), y: Math.round(point.y) };
  });
  await browser.action('pointer').move(midpoint).down().up().perform();
  await expect(edge('link_source', 'link_child').$('.react-flow__edgeupdater-source')).toBeDisplayed();
  await browser.saveScreenshot('.tmp/wdio/selected-dependency-native.png');
  await expect(edge('link_source', 'link_child').$('.react-flow__edge-path')).toHaveStyle({ 'stroke-width': '3px' });
  await expect(edge('link_source', 'link_child').$('.react-flow__edgeupdater-source')).toHaveStyle({ stroke: 'rgba(0,0,0,0)', fill: 'rgba(0,0,0,0)' });
  await expect(edge('link_source', 'link_child').$('.react-flow__edgeupdater-target')).not.toExist();
  const start = await bounds('.react-flow__edgeupdater-source');
  const end = await bounds('.react-flow__node[data-id="link_replacement"]');
  await browser.action('pointer', { id: 'mouse' }).move(start).down().move({ x: start.x + 40, y: start.y + 40, duration: 200 }).perform(true);
  const preview = $('.react-flow__connection-path');
  await expect(preview).toBeDisplayed();
  await expect(preview).toHaveStyle({ 'stroke-width': '2px' });
  const initialPath = await preview.getAttribute('d');
  if (!initialPath) throw new Error('Reconnection preview has no path');
  await browser.action('pointer', { id: 'mouse' }).move({ ...end, duration: 300 }).perform(true);
  await expect(preview).not.toHaveAttribute('d', initialPath);
  await browser.saveScreenshot('.tmp/wdio/dependency-drag-native.png');
  await browser.action('pointer', { id: 'mouse' }).up().perform();
  await expect(edge('link_replacement', 'link_child')).toExist();
  await expect(edge('link_source', 'link_child')).toHaveAttribute('aria-label', 'Virtual link from link_source to link_child.');
  await sql("SELECT CASE WHEN (SELECT n FROM data.link_child)=8 THEN true ELSE error('Native drag failed') END");
  for (const dark of [false, true]) {
    await $('button[aria-label="Open settings"]').click();
    const theme = $('[role="switch"][aria-label="Use Dark 2026 theme"]');
    if (((await theme.getAttribute('aria-checked')) === 'true') !== dark) await theme.click();
    await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
    await parentMenu('link_child');
    await browser.saveScreenshot(`.tmp/wdio/connections-native-${dark ? 'dark' : 'light'}.png`);
    await browser.keys('Escape');
  }
  await $('button[aria-label="Show Dependencies"]').click();
  const id = (name: string) => JSON.stringify(['data', name]);
  await expect(edge(id('link_replacement'), id('link_child'))).toExist();
  await edge(id('link_replacement'), id('link_child')).execute((el) => { (el as unknown as SVGElement).focus(); });
  await browser.keys('Enter');
  await focusCard(id('link_source'));
  await browser.keys('Enter');
  await expect(edge(id('link_source'), id('link_child'))).toExist();
  await sql("SELECT CASE WHEN (SELECT n FROM data.link_child)=1 THEN true ELSE error('Native dependency keyboard replacement failed') END");
  await $('button[aria-label="Show Dependencies"]').click();
});
