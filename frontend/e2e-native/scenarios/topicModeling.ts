import { $, expect } from '@wdio/globals';
import * as api from '../../src/features/project/api';
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
      await $('button=Topic Modelling').click();
      const panel = $('[data-testid="topic-modeling-workspace"]');
      for (const [index, name] of [first, second].entries()) {
        await addResearchInput(panel, name);
        const column = panel.$$('[role="combobox"][aria-label="Text Column:"]')[index];
        if (!column) throw new Error('Text column selector missing');
        await column.waitForEnabled();
        await column.click();
        await $('[role="option"]=text').click();
      }

      const tokenizer = panel.$(`[aria-label="${first} tokenizer"]`);
      await tokenizer.click();
      await $('[role="option"]=Jieba').click();
      await expect(panel.$(`[aria-label="${second} tokenizer"]`)).toHaveText('Jieba');
      await panel.$(`[aria-label="${second} tokenizer"]`).click();
      await $('[role="option"]=Plain words (English)').click();
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
      await expect(results).toHaveText(expect.stringContaining(`60 of 96 ${first}`));
      await expect(results).toHaveText(expect.stringContaining(`40 of 64 ${second}`));
      expect((await api.listTabs(base, undefined, 'topic-modeling'))[0]?.analysis).toBeNull();
      await expect(results.$('button=Add to Project')).not.toExist();
      await results.$('button[aria-label^="View documents for topic"]').click();
      const inspector = $('[role="dialog"]');
      await expect(inspector).toHaveText(expect.stringContaining('Preview sample'));
      await expect(inspector.$('table')).toBeDisplayed();
      await inspector.$('button=Close').click();
      await researchScreenshot(`${prefix}-topic-preview`, results);
      await $('button=Data Loader').click();
      await $('button=Topic Modelling').click();
      await expect(results).not.toExist();
      const id = await runResearchAnalysis(base, 'topic-modeling', panel);
      results = $(
        '[data-testid="topic-modeling-workspace"] [aria-label="Topic Modelling results"]',
      );
      await results.waitForDisplayed({ timeout: 60000 });
      const saved = await api.getTopicResult(base, id);
      if (!saved) throw new Error('Completed Topic Modelling analysis has no saved output');
      expect(saved.result.payload.sources.map((s) => s.document_count)).toEqual([96, 64]);
      expect(saved.request).not.toHaveProperty('sampling');
      await expect(results.$('h2')).toHaveText('Results');
      await results.$('button[aria-label^="View documents for topic"]').click();
      await expect($('[role="dialog"]')).toHaveText(
        expect.stringContaining('Saved source snapshot'),
      );
      await expect($('[role="dialog"] table')).toBeDisplayed();
      await $('[role="dialog"]').$('button=Close').click();
      await expect(panel.$('button=Preview')).toHaveAttribute('aria-disabled', 'true');
      await results.$('[aria-label="Topic graph controls"]').scrollIntoView();
      await expect(results.$('[data-testid^="topic-flow-node-"]')).toBeDisplayed();
      await researchScreenshot(`${prefix}-topic-full-light`, results);
      await setResearchTheme(true);
      await setAnalysisPaneSize('narrow');
      await researchScreenshot(`${prefix}-topic-narrow-dark`, results);
      await setAnalysisPaneSize('normal');
      await setResearchTheme(false);
      const bubble = results.$('[data-testid="topic-flow-node-1"]');
      await bubble.click();
      await expect(bubble).toHaveAttribute('aria-pressed', 'true');
      await expect(results.$('button=Clear all')).toBeEnabled();
      await results.$('button=Clear all').click();
      await results.$('button=Add to Project').click();
      await $('[role="dialog"]').$('button=Select all columns').click();
      await $('[role="dialog"]').$('button=Add').click();
      await $('[role="dialog"]').waitForExist({ reverse: true, timeout: 30000 });
      const counts = await api.querySql(base, [
        { sql: `SELECT count(*) AS n FROM data.${api.identifier(first + '_topics')}` },
      ]);
      expect(Number(counts.getChild('n')?.get(0))).toBe(96);
      const shape = await api.querySql(base, [
        { sql: `DESCRIBE data.${api.identifier(first + '_topics')}` },
      ]);
      expect(shape.toArray().map((r: Record<string, unknown>) => r.column_name)).toContain(
        'TOPIC_top1_2',
      );
      // Both annotated outputs retain every original value, including nested metadata,
      // duplicate text, blanks and the pre-existing generated-name collision.
      const verifyPublished = async () => {
        for (const [source, file] of [
          [first, 'reference'],
          [second, 'study'],
        ] as const) {
          const original = await readResearchData(`topic-consultation-${file}.json`);
          const rows = await api.querySql(base, [
            {
              sql: `SELECT to_json(original) AS document FROM (SELECT document_id,text,source,participant,tags,TOPIC_top1 FROM data.${api.identifier(source + '_topics')} ORDER BY document_id) original`,
            },
          ]);
          expect(
            rows
              .toArray()
              .map((r: Record<string, unknown>) => JSON.parse(String(r.document)) as unknown),
          ).toEqual(original);
          const assignments = await api.querySql(base, [
            {
              sql: `SELECT DISTINCT TOPIC_top1_2 AS topic FROM data.${api.identifier(source + '_topics')}`,
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
      expect((await api.listTabs(base, undefined, 'topic-modeling'))[0]?.analysis?.has_result).toBe(
        false,
      );
      const retained = await api.querySql(base, [
        { sql: `SELECT count(*) AS n FROM data.${api.identifier(first + '_topics')}` },
      ]);
      expect(Number(retained.getChild('n')?.get(0))).toBe(96);
      await verifyPublished();
    });
  });
}
