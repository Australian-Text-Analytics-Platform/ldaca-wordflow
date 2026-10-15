import { suggestDataBlockNames } from '../../src/features/project/automaticNames';
import { $, browser, expect } from '@wdio/globals';
import * as analysesApi from '@/features/tools/common/analysisApi';
import * as topicApi from '@/features/tools/topic-modeling/api';
import * as projectApi from '@/features/project/api';
import * as tasksApi from '@/features/project/tasksApi';
import * as objectsApi from '@/features/project/objects';
import {
  withResearchFile,
  readResearchData,
  prepareResearchVisit,
  addResearchInput,
  runResearchAnalysis,
  researchScreenshot,
  setResearchTheme,
} from './researchData';
import { setAnalysisPaneSize } from '../../e2e-browser/layout';

export async function topicModelingScenario(
  base: string,
  prefix: string,
  inspectDownloads?: (topicCount: number) => Promise<void>,
) {
  await prepareResearchVisit();
  const first = `${prefix}_reference`,
    second = `${prefix}_study`;
  await withResearchFile('topic-consultation-reference.json', first, async () => {
    await withResearchFile('topic-consultation-study.json', second, async () => {
      await $('button[aria-label="Topic Modelling"]').click();
      const panel = $('[data-testid="topic-modeling-workspace"]');
      for (const [index, name] of [first, second].entries()) {
        await addResearchInput(panel, name);
        const column = panel.$$('[role="combobox"][aria-label="Column"]')[index];
        if (!column) throw new Error('Text column selector missing');
        await column.waitForEnabled();
        await column.click();
        await $('[role="option"]=text').click();
      }

      const tokenizer = panel.$(`[aria-label="${first} tokenizer"]`);
      await tokenizer.click();
      await $('[role="option"][aria-label="Jieba"]').click();
      await expect(panel.$(`[aria-label="${second} tokenizer"]`)).toHaveText('Jieba');
      await panel.$(`[aria-label="${second} tokenizer"]`).click();
      await $('[role="option"][aria-label="Plain words (languages with spaces)"]').click();
      await expect(panel.$(`[aria-label="${second} tokenizer"]`)).toHaveText(
        await tokenizer.getText(),
      );
      await panel.$('button=Preview').click();
      const dialog = $('[role="dialog"]');
      await dialog.$(`[aria-label="${first} sample size"]`).setValue('60');
      await dialog.$(`[aria-label="${second} sample size"]`).setValue('40');
      await dialog.$('button=Preview').click();
      let results = panel.$('[aria-label="Topic Modelling results"]');
      await results.waitForDisplayed({ timeout: 180000 });
      await expect(results.$('h2')).toHaveText('Preview');
      await expect(results).toHaveText(expect.stringContaining(`59 of 96 ${first}`));
      await expect(results).toHaveText(expect.stringContaining(`39 of 64 ${second}`));
      expect((await analysesApi.listTabs(base, undefined, 'topic-modeling'))[0]?.analysis).toBeNull();
      await expect(results.$('button=Add to Project')).not.toExist();
      await results.$('button[aria-label^="View documents for topic"]').click();
      const inspector = $('[role="dialog"]');
      await expect(inspector).toHaveText(expect.stringContaining('Preview sample'));
      await expect(inspector.$('table')).toBeDisplayed();
      await inspector.$('button=Close').click();
      await researchScreenshot(`${prefix}-topic-preview`, results);
      await $('button[aria-label="Data Loader"]').click();
      await $('button[aria-label="Topic Modelling"]').click();
      await expect(results).not.toExist();
      const id = await runResearchAnalysis(base, 'topic-modeling', panel);
      results = $(
        '[data-testid="topic-modeling-workspace"] [aria-label="Topic Modelling results"]',
      );
      await results.waitForDisplayed({ timeout: 60000 });
      const saved = await topicApi.getTopicResult(base, id);
      if (!saved) throw new Error('Completed Topic Modelling analysis has no saved output');
      expect(saved.result.payload.sources.map((s) => s.document_count)).toEqual([95, 63]);
      expect(saved.request).not.toHaveProperty('sampling');
      await expect(results.$('h2')).toHaveText('Results');
      await results.$('button[aria-label^="View documents for topic"]').click();
      await expect($('[role="dialog"]')).toHaveText(
        expect.stringContaining('Current source rows matching processed texts'),
      );
      await expect($('[role="dialog"] table')).toBeDisplayed();
      await $('[role="dialog"]').$('button=Close').click();
      await expect(panel.$('button=Preview')).toHaveAttribute('aria-disabled', 'false');
      await expect(panel.$('button=Run')).toHaveAttribute('aria-disabled', 'false');
      await results.$('[aria-label="Topic graph controls"]').scrollIntoView();
      await expect(results.$('[data-testid^="topic-flow-node-"]')).toBeDisplayed();
      await researchScreenshot(`${prefix}-topic-full-light`, results);
      await setResearchTheme(true);
      await setAnalysisPaneSize('narrow');
      await researchScreenshot(`${prefix}-topic-narrow-dark`, results);
      await setAnalysisPaneSize('normal');
      await setResearchTheme(false);
      // Smaller bubbles render last and remain clickable above overlaps.
      const visibleBubbles = results.$$('[data-testid^="topic-flow-node-"]');
      const bubble = visibleBubbles[(await visibleBubbles.length) - 1];
      if (!bubble) throw new Error('Expected a visible Topic bubble');
      await bubble.click();
      await expect(bubble).toHaveAttribute('aria-pressed', 'true');
      await expect(results.$('button[aria-label="Clear selected topics"]')).toBeEnabled();
      await results.$('button[aria-label="Clear selected topics"]').click();
      // Presentation reuses retained representative words and leaves Run provenance intact.
      const rawWords = await topicApi.queryTopicModel(base, { analysis: id }, {
        projection: 'words', topic_count: saved.result.payload.natural_topic_count,
      });
      if (rawWords.projection !== 'words') throw new Error('Expected representative words');
      const entry = Object.entries(rawWords.words).find(([, words]) => words.length > 0);
      if (!entry?.[1][0]) throw new Error('Expected a nonempty representative-word list');
      const [topicId, words] = entry;
      const removedWord = words[0]!.word;
      const wordInput = results.$('[aria-label="Words per topic"]');
      await wordInput.setValue('3');
      await browser.keys('Tab');
      const topicBubble = results.$(`[data-testid="topic-flow-node-${topicId}"]`);
      await topicBubble.execute(element => element.focus());
      const tooltip = $(`[data-testid="topic-flow-tooltip-${topicId}"]`);
      await tooltip.waitForExist();
      const labels = async () => String(await tooltip.$('span.sr-only').execute(element => element.textContent ?? ''));
      await browser.waitUntil(async () => (await labels()).split('; ').length <= 3);
      expect(await labels()).toContain(`${removedWord},`);
      await browser.keys('Escape');
      const stopwordName = `${prefix}_stopwords`;
      await projectApi.executeSql(base, [
        { sql: `CREATE TABLE data.${objectsApi.identifier(stopwordName)} AS SELECT ?::VARCHAR AS word`, parameters: [removedWord] },
        { sql: 'INSERT INTO wordflow.nodes(table_name) VALUES (?)', parameters: [stopwordName] },
      ], { all: true });
      await results.$('[role="switch"][aria-label="Filter stopwords from results"]').click();
      const stopwords = results.$('[aria-label="Stopwords"]');
      await addResearchInput(stopwords, stopwordName);
      await stopwords.$('[aria-label="Stopword column"]').waitForEnabled();
      await stopwords.$('[aria-label="Stopword column"]').scrollIntoView();
      await stopwords.$('[aria-label="Stopword column"]').click();
      await $('[role="option"]=word').click();
      await browser.waitUntil(async () => {
        await topicBubble.execute(element => { element.blur(); element.focus(); });
        return tooltip.isExisting();
      }, { timeoutMsg: 'Representative-word tooltip did not open after choosing stopwords' });
      await browser.waitUntil(async () => !(await labels()).includes(`${removedWord},`));
      await browser.keys('Escape');
      const filtered = await topicApi.queryTopicModel(base, { analysis: id }, {
        projection: 'words', topic_count: saved.result.payload.natural_topic_count,
        stopword_source: { source: { schema: 'data', name: stopwordName }, column: 'word' },
      });
      if (filtered.projection !== 'words') throw new Error('Expected filtered representative words');
      expect(Object.values(filtered.words).flat().some(word => word.word === removedWord)).toBe(false);
      expect((await topicApi.getTopicResult(base, id))?.request).toEqual(saved.request);
      const tab = (await analysesApi.listTabs(base, undefined, 'topic-modeling'))[0]!;
      expect((await tasksApi.getTasks(base)).tasks.filter(task => task.tab_id === tab.id)).toHaveLength(1);
      const published = suggestDataBlockNames([first, second].map((source) => ({ source, sources: [source], operation: 'tm' })), (await projectApi.graph(base)).nodes.map((node) => node.table_name));
      const publishedName = (source: string) => {
        const output = published.find((output) => output.source === source);
        if (!output) throw new Error(`No expected publication for ${source}`);
        return output.name;
      };
      await results.$('button=Add to Project').click();
      await $('[role="dialog"]').$('button=Select all columns').click();
      await $('[role="dialog"]').$('button=Add').click();
      await $('[role="dialog"]').waitForExist({ reverse: true, timeout: 30000 });
      const counts = await projectApi.querySql(base, [
        { sql: `SELECT count(*) AS n FROM data.${ objectsApi.identifier(publishedName(first))}` },
      ]);
      expect(Number(counts.getChild('n')?.get(0))).toBe(95);
      const shape = await projectApi.querySql(base, [
        { sql: `DESCRIBE data.${ objectsApi.identifier(publishedName(first))}` },
      ]);
      expect(shape.toArray().map((r: Record<string, unknown>) => r.column_name)).toContain(
        'TOPIC_top1',
      );
      // Retain original text and allowed metadata. Conflicting optional metadata
      // is disabled, leaving the generated topic field under its usual name.
      const verifyPublished = async () => {
        for (const [source, file] of [
          [first, 'reference'],
          [second, 'study'],
        ] as const) {
          const original = await readResearchData(`topic-consultation-${file}.json`);
          const rows = await projectApi.querySql(base, [
            {
              sql: `SELECT to_json(original) AS document FROM (SELECT document_id,text,source,participant,tags FROM data.${ objectsApi.identifier(publishedName(source))} ORDER BY document_id) original`,
            },
          ]);
          expect(
            rows
              .toArray()
              .map((r: Record<string, unknown>) => JSON.parse(String(r.document)) as unknown),
          ).toEqual(original.filter((item) => (item as Record<string,unknown>).text != null).map((item) => {
            const { TOPIC_top1: _topic, ...row } = item as Record<string, unknown>;
            return row;
          }));
          const assignments = await projectApi.querySql(base, [
            {
              sql: `SELECT DISTINCT TOPIC_top1 AS topic FROM data.${ objectsApi.identifier(publishedName(source))}`,
            },
          ]);
          for (const row of assignments.toArray() as Record<string, unknown>[]) {
            if (row.topic === null) continue;
            expect(Number(row.topic)).toBeGreaterThanOrEqual(-1);
            expect(Number(row.topic)).toBeLessThan(saved.result.payload.natural_topic_count);
          }
        }
      };
      await verifyPublished();
      await inspectDownloads?.(saved.result.payload.natural_topic_count);
      await panel.$('button=Clear results').click();
      await expect(results).not.toExist();
      await expect(panel.$('button=Run')).toHaveAttribute('aria-disabled', 'false');
      expect((await analysesApi.listTabs(base, undefined, 'topic-modeling'))[0]?.analysis?.has_result).toBe(
        false,
      );
      const retained = await projectApi.querySql(base, [
        { sql: `SELECT count(*) AS n FROM data.${ objectsApi.identifier(publishedName(first))}` },
      ]);
      expect(Number(retained.getChild('n')?.get(0))).toBe(95);
      await verifyPublished();
    });
  });
}
