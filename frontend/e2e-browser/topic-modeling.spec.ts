import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { $, browser, expect } from '@wdio/globals';
import JSZip from 'jszip';
import { it } from 'mocha';
import { topicModelingScenario } from '../e2e-native/scenarios/topicModeling';
import { baseUrl, outputDir } from './fixtures';
import { setAnalysisPaneSize } from './layout';

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
    await results.$('[data-testid="topic-flow-node-1"]').click();
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
      const path = resolve(outputDir, 'downloads', `Topic Modelling 1.${format.toLowerCase()}`);
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
        const csv = await zip.file('Topic Modelling 1_topics.csv')?.async('string');
        expect(csv).toContain('Representative words');
        expect(csv?.split('\r\n')).toHaveLength(topicCount + 1);
      }
      await dialog.waitForExist({ reverse: true });
    }
  });
  expect(resizeErrors).toEqual([]);
});
