import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { $, browser, expect } from '@wdio/globals';
import JSZip from 'jszip';
import { it } from 'mocha';
import { topicModelingScenario } from '../e2e-native/scenarios/topicModeling';
import { baseUrl, outputDir, role, post } from './fixtures';
import { setAnalysisPaneSize } from './layout';
import * as topicApi from '@/features/tools/topic-modeling/api';
import * as projectApi from '@/features/project/api';
import * as analysisApi from '@/features/tools/common/analysisApi';
import { getTasks } from '@/features/project/tasksApi';
import { decodeAnalysisRequest } from '@/features/tools/common/analysisRequest';
import { expectAppError } from './diagnostics';

it('fits a temporary joint sample and publishes a full-data topic model from imported files', async function () {
  this.timeout(300000);
  const resizeErrors: string[] = [];
  const errorObserver = await browser.addInitScript<string>((emit) => {
    window.addEventListener('error', (event) => {
      if (event.message.includes('ResizeObserver')) emit(event.message);
    });
  });
  errorObserver.on('data', (message: string) => resizeErrors.push(message));
  await browser.url('/');
  await topicModelingScenario(baseUrl, 'browser_topic', async (topicCount) => {
    for (let i = 0; i < 3; i++) {
      await setAnalysisPaneSize('narrow');
      await setAnalysisPaneSize('normal');
    }
    const windowSize = await browser.getWindowSize();
    await browser.setWindowSize(1000, 800);
    await setAnalysisPaneSize('normal');
    await browser.setWindowSize(windowSize.width, windowSize.height);
    await setAnalysisPaneSize('normal');
    const results = $('[aria-label="Topic Modelling results"]');
    await results.$('[aria-label="Fit view"]').click();
    const fittedTransform = await results.$('.react-flow__viewport').getAttribute('style');
    await results.$('[aria-label="Zoom out"]').click();
    await expect(results.$('.react-flow__viewport')).not.toHaveAttribute(
      'style',
      fittedTransform ?? '',
    );
    await results.$('[aria-label="Fit view"]').click();
    await expect(results.$('.react-flow__viewport')).toHaveAttribute(
      'style',
      fittedTransform ?? '',
    );
    await results.$('[aria-label="Zoom in"]').click();
    const viewport = results.$('.react-flow__viewport');
    let zoomedTransform: string | null = null;
    await browser.waitUntil(async () => {
      const current = await viewport.getAttribute('style');
      const stable = current === zoomedTransform;
      zoomedTransform = current;
      return stable;
    });
    const settledTransform = await viewport.getAttribute('style');
    const visibleBubbles = results.$$('[data-testid^="topic-flow-node-"]');
    const exposed = visibleBubbles[(await visibleBubbles.length) - 1];
    if (!exposed) throw new Error('Expected a visible Topic bubble');
    await exposed.click();
    await expect(viewport).toHaveAttribute('style', settledTransform ?? '');
    await results.$('button=Clear all').click();
    await expect(viewport).toHaveAttribute('style', settledTransform ?? '');
    await results.$('[aria-label="Enable additive lasso"]').click();
    const canvas = results.$('[data-testid="topic-lasso-canvas"]');
    await canvas.scrollIntoView({ block: 'center' });
    const bounds = await canvas.getLocation();
    const size = await canvas.getSize();
    const left = Math.round(bounds.x + 40),
      right = Math.round(bounds.x + size.width - 8);
    const top = Math.round(bounds.y + 8),
      bottom = Math.round(bounds.y + size.height - 8);
    await browser.performActions([
      {
        type: 'pointer',
        id: 'topic-lasso',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', duration: 0, x: right, y: bottom },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerMove', duration: 100, x: right, y: top },
          { type: 'pointerMove', duration: 100, x: left, y: top },
          { type: 'pointerMove', duration: 100, x: left, y: bottom },
          { type: 'pointerMove', duration: 100, x: right, y: bottom },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
    await browser.releaseActions();
    await expect(results.$('[aria-label="Clear lasso filter"]')).toBeEnabled();
    await expect(results.$('button=Clear all')).not.toExist();
    await results.$('[aria-label="Clear lasso filter"]').click();
    await results.$('[aria-label="Disable additive lasso"]').click();
    await results.$('[aria-label="Fit view"]').click();
    for (const format of ['PNG', 'SVG', 'JPEG', 'ZIP']) {
      await $('[aria-label="Topic Modelling results"]')
        .$('button[aria-label="Download chart"]')
        .click();
      const dialog = $('[role="dialog"]');
      const csv = dialog.$('[role="checkbox"]');
      if (((await csv.getAttribute('aria-checked')) === 'true') !== (format === 'ZIP'))
        await csv.click();
      if (format !== 'ZIP') {
        await dialog.$('[aria-label="Chart download format"]').click();
        await $(`[role="option"]=${format}`).click();
      }
      const path = resolve(outputDir, 'downloads', `TM-1.${format.toLowerCase()}`);
      await rm(path, { force: true });
      await dialog.$('button=Download').click();
      await browser.waitUntil(
        async () => {
          try {
            return (await readFile(path)).length > 100;
          } catch {
            return false;
          }
        },
        { timeout: 30000, timeoutMsg: `${format} topic export did not arrive` },
      );
      const bytes = await readFile(path);
      if (format === 'SVG') {
        const svg = bytes.toString();
        expect(svg).toContain('Full data');
        expect(svg).toContain('browser_topic_reference');
        expect(svg).not.toContain('var(--');
      } else if (format === 'PNG') expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      else if (format === 'JPEG') expect([...bytes.subarray(0, 2)]).toEqual([255, 216]);
      else {
        const zip = await JSZip.loadAsync(bytes);
        const csv = await zip.file('TM-1_topics.csv')?.async('string');
        expect(csv).toContain('Representative words');
        expect(csv?.split('\r\n')).toHaveLength(topicCount + 1);
      }
      await dialog.waitForExist({ reverse: true });
    }
  });
  expect(resizeErrors).toEqual([]);
});

it('adjusts retained stages atomically and colours captured metadata with own-population shares', async function () {
  this.timeout(300000);
  const fixture = await readFile(resolve(import.meta.dirname, '../e2e/fixtures/data/topic-consultation-reference.json'), 'utf8');
  await projectApi.runSqlScript(baseUrl, `CREATE TABLE data.retained_topics AS SELECT key::BIGINT AS id, value->>'text' AS document, CASE WHEN key::BIGINT%7=0 THEN NULL WHEN key::BIGINT%2=0 THEN '研究' ELSE 'Other' END AS category FROM json_each('${fixture.replaceAll("'", "''")}') ORDER BY id; INSERT INTO wordflow.nodes(table_name,document_column) VALUES ('retained_topics','document')`, 'execute');
  const tab = await analysisApi.createTab(baseUrl, 'topic-modeling');
  const request = { ...decodeAnalysisRequest('topic-modeling', undefined).request, inputs: [{ source: { schema: 'data', name: 'retained_topics' }, column: 'document' }] };
  const saved = await topicApi.runTopicModel(baseUrl, tab.id, request);
  const id = saved.id;
  expect(saved.result.payload.retained_stages).toBeTruthy();
  const initial = await topicApi.queryTopicModel(baseUrl, { analysis: id }, { projection: 'map', topic_count: saved.result.payload.natural_topic_count, colour_by: 'category' });
  if (initial.projection !== 'map') throw new Error('Expected a Topic map');
  const category = initial.colour_fields.find((field) => field.column === 'category');
  expect(category?.groups.reduce((sum, group) => sum + group.count, 0)).toBe(96);
  expect(category?.groups.some((group) => group.missing)).toBe(true);
  await projectApi.runSqlScript(baseUrl, `UPDATE data.retained_topics SET document='Changed after Run', category='Changed after Run'`, 'execute');
  const unchanged = await topicApi.queryTopicModel(baseUrl, { analysis: id }, { projection: 'map', topic_count: saved.result.payload.natural_topic_count, colour_by: 'category' });
  expect(unchanged).toEqual(initial);
  await browser.url('/');
  await role('button', { name: 'Topic Modelling', exact: true }).click();
  const results = $('[aria-label="Topic Modelling results"]');
  await results.waitForDisplayed({ timeout: 30000 });
  await expect(results.$('[title*="dominant documents out of 96"]')).toBeDisplayed();
  await results.$('[aria-label="Colour by"]').click();
  await role('option', { name: 'category', exact: true }).click();
  await expect(results.$('[aria-label="Metadata colour legend"]')).toHaveText(expect.stringContaining('研究'));
  await expect(results.$('[aria-label="Metadata colour legend"]')).not.toHaveText(expect.stringContaining('Changed after Run'));
  const minimum = results.$('[aria-label="Adjusted minimum topic size"]');
  await minimum.setValue('4');
  await browser.keys('Enter');
  await browser.waitUntil(async () => (await topicApi.getTopicResult(baseUrl, id))?.result.payload.parameters?.minimum_topic_size === 4, { timeout: 60000 });
  await results.$('[data-testid^="topic-flow-node-"]').waitForDisplayed();
  const adjusted = await topicApi.getTopicResult(baseUrl, id);
  if (!adjusted) throw new Error('Missing adjusted result');
  expect(adjusted.result.payload.natural_projection).not.toBe(saved.result.payload.natural_projection);
  expect(adjusted.request).toEqual(saved.request);
  expect((await getTasks(baseUrl)).tasks.filter((task) => task.tab_id === tab.id)).toHaveLength(1);
  const stale = await post(`/api/project/analyses/${id}/topic-modeling/adjust`, { expected_projection: saved.result.payload.natural_projection, settings: { minimum_topic_size: 5, maximum_topic_size: null, tokenizer: request.tokenizer } });
  expect(stale.status).toBe(409);
  expectAppError(/Required Topic intermediates|Rerun/);
  await projectApi.runSqlScript(baseUrl, `UPDATE wordflow.analyses SET result=json_merge_patch(result::JSON, '{"retained_stages":null}') WHERE id='${id}'`, 'execute');
  await minimum.setValue('5');
  await browser.keys('Enter');
  await expect(results.$('[role="alert"]')).toHaveText(expect.stringContaining('Rerun'));
  await expect(minimum).toHaveValue('5');
  await expect(results.$('[data-testid^="topic-flow-node-"]')).toBeDisplayed();
  expect((await topicApi.getTopicResult(baseUrl, id))?.result.payload.natural_projection).toBe(adjusted.result.payload.natural_projection);
  await $('[data-testid="topic-modeling-workspace"]').$('button=Clear results').click();
  await expect(results).not.toExist();
});
