import { browser, $, expect } from '@wdio/globals';
import { it } from 'mocha';

const card = (name: string) => $(`.react-flow__node[data-id='${JSON.stringify(['native_dependencies', name])}']`);
async function sql(script: string) {
  const status = await browser.tauri.execute(({ core }) => core.invoke('get_backend_status') as Promise<{ url: string }>);
  const response = await fetch(`${status.url}/api/project/sql`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ script, response: 'command' }) });
  if (!response.ok) throw new Error(await response.text());
}
async function actions(name: string) {
  const content = card(name).$('[tabindex="0"]');
  await content.waitForDisplayed();
  await content.execute((el) => { el.focus(); });
  await $('button[aria-label="Data Block actions"]').click();
  await browser.keys('ArrowDown');
  await $('[role="menu"]').waitForDisplayed();
}

it('uses schema-qualified controls in the native dependency graph without registering objects', async () => {
  await sql("CREATE SCHEMA native_dependencies; CREATE TABLE native_dependencies.source AS SELECT 17 AS n; CREATE VIEW native_dependencies.result AS SELECT n+1 AS n FROM native_dependencies.source");
  await browser.refresh();
  const toggle = $('button[aria-label="Show Dependencies"]');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(card('source')).toExist();
  await expect(card('result')).toExist();
  const originalTheme = await $('html').getAttribute('data-theme');
  for (const dark of [false, true]) {
    await $('button[aria-label="Open settings"]').click();
    const theme = $('[role="switch"][aria-label="Use Dark 2026 theme"]');
    if (((await theme.getAttribute('aria-checked')) === 'true') !== dark) await theme.click();
    await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
    await browser.saveScreenshot(`.tmp/wdio/dependencies-native-${dark ? 'dark' : 'light'}.png`);
  }
  const content = card('source').$('[tabindex="0"]');
  await content.execute((el) => { el.focus(); });
  await $('button[aria-label="Preview data"]').click();
  await expect($('//td[normalize-space(.)="17"]')).toBeDisplayed();
  await expect($('button[aria-label="Add Data Block to selection"]')).not.toExist();
  await toggle.click();
  await expect(card('source')).not.toExist();
  await expect($('//td[normalize-space(.)="17"]')).toBeDisplayed();
  await toggle.click();
  await $('button[aria-label="Close preview"]').click();
  await expect($('[data-testid="project-data-overlay"]')).not.toExist();
  await actions('source');
  await $('[role="menuitem"]=Clone').click();
  await expect(card('source_copy')).toExist();
  await expect($('[data-testid="project-data-overlay"]')).not.toExist();
  await actions('result');
  await $('[role="menuitem"]=Materialize').click();
  // Compact cards hide type details; the View-only action disappears in either presentation.
  await actions('result');
  await expect($('[role="menuitem"]=Materialize')).not.toExist();
  await browser.keys('Escape');
  await sql("SELECT CASE WHEN (SELECT count(*) FROM wordflow.nodes WHERE table_name IN ('source','result','source_copy'))=0 AND (SELECT count(*) FROM duckdb_tables() WHERE schema_name='native_dependencies' AND table_name='result')=1 AND (SELECT n FROM native_dependencies.source_copy)=17 THEN true ELSE error('Native dependency controls changed registration or wrong object') END");
  await actions('source_copy');
  await $('[role="menuitem"]=Delete').click();
  await $('//div[@role="alertdialog"]//button[normalize-space(.)="Delete"]').click();
  await expect(card('source_copy')).not.toExist();
  if ((await $('html').getAttribute('data-theme')) !== originalTheme) {
    await $('button[aria-label="Open settings"]').click();
    await $('[role="switch"][aria-label="Use Dark 2026 theme"]').click();
    await $('//div[@role="dialog"]//button[.//span[text()="Close"]]').click();
  }
  await toggle.click();
});

it('renders directed relationship styles without a legend in the native webview', async () => {
  await sql("CREATE TABLE data.graph_source AS SELECT 1 AS n; CREATE VIEW data.graph_live AS SELECT * FROM data.graph_source; CREATE TABLE data.graph_stored AS SELECT 2 AS n; INSERT INTO wordflow.nodes(table_name) VALUES ('graph_source'),('graph_live'),('graph_stored'); INSERT INTO wordflow.edges VALUES ('graph_source','graph_stored')");
  await browser.refresh();
  const dependency = $('.react-flow__edge[aria-label="graph_live reads graph_source. SQL dependency."]');
  const virtual = $('.react-flow__edge[aria-label="Virtual link from graph_source to graph_stored."]');
  await expect(dependency.$('.react-flow__edge-path')).toHaveAttribute('marker-end', expect.stringContaining('arrowclosed'));
  await expect(virtual.$('.react-flow__edge-path')).toHaveAttribute('style', expect.stringMatching(/stroke-dasharray: 6,?\s+4/));
  await expect($('[aria-label="Graph relationships"]')).not.toExist();
  await browser.saveScreenshot('.tmp/wdio/relationships-native.png');
  await $('button[aria-label="Show Dependencies"]').click();
  await expect($('[aria-label="Graph relationships"]')).not.toExist();
  await $('button[aria-label="Show Dependencies"]').click();
});
