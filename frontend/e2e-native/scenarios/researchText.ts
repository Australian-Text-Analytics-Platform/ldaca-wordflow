import { browser, $, expect } from '@wdio/globals';
import * as api from '../../src/features/project/api';
import { requireQuotationModel } from '../../scripts/quotation-model.mjs';
import { setAnalysisPaneSize } from '../../e2e-browser/layout';
import {
  withResearchFile,
  readResearchData,
  prepareResearchVisit,
  addResearchInput,
  chooseColumn,
  runResearchAnalysis,
  researchScreenshot,
  setResearchTheme,
  type DocumentRow,
} from './researchData';

const policyCount = (rows: DocumentRow[]) =>
  rows.reduce((n, r) => n + (r.text?.match(/\bpolicy\b/gi)?.length ?? 0), 0);

export async function researchTextScenario(base: string, prefix: string) {
  await prepareResearchVisit();
  const reference = await readResearchData<DocumentRow>('public-discourse-reference.json');
  const study = await readResearchData<DocumentRow>('public-discourse-study.json');
  await withResearchFile(
    'public-discourse-reference.json',
    `${prefix}_reference`,
    async (refName) => {
      await withResearchFile(
        'public-discourse-study.json',
        `${prefix}_study`,
        async (studyName) => {
          await $('button=Frequency').click();
          const panel = $('[data-testid="frequency-workspace"]');
          const tokenizer = (await api.getTokenizers(base)).find(
            (item) => item.model_id === 'native:plain_words_en',
          );
          if (!tokenizer) throw new Error('Native word tokenizer unavailable');
          for (const [index, name] of [refName, studyName].entries()) {
            await addResearchInput(panel, name);
            // New inputs append a column selector; imported files carry no document default.
            const columns = panel.$$('[role="combobox"][aria-label="Text Column:"]');
            await expect(columns).toBeElementsArrayOfSize(index + 1);
            const column = columns[index];
            if (!column) throw new Error('Text column selector missing');
            await column.waitForEnabled();
            await column.click();
            if (!(await $('[role="option"]').isExisting())) await browser.keys('ArrowDown');
            await $('[role="option"]=text').click();
            await chooseColumn(`${name} tokenizer`, tokenizer.label, panel);
          }
          const id = await runResearchAnalysis(base, 'frequency', panel);
          const result = await api.getFrequencyResult(base, id);
          if (!result) throw new Error('Completed Frequency analysis has no saved output');
          expect(result.result.payload.corpora).toHaveLength(2);
          for (const [index, documents] of [reference, study].entries()) {
            expect(Number(result.result.payload.corpora[index]?.vocabulary_size)).toBeGreaterThan(
              60,
            );
            const query = await api.queryFrequency(base, id, {
              view: 'corpus',
              corpus_index: index,
              filter: 'policy',
            });
            const policy = (query.table.toArray() as Record<string, unknown>[]).find(
              (r) => r.token === 'policy',
            );
            expect(Number(policy?.frequency)).toBe(policyCount(documents));
          }
          const results = panel.$('[aria-label="Frequency results"]');
          await results.$('button=Ranked lists').waitForExist();
          await browser.waitUntil(async () => (await results.$$('svg text').length) > 40);
          await researchScreenshot(`${prefix}-frequency-normal`, results);
          await setResearchTheme(true);
          await researchScreenshot(`${prefix}-frequency-dark`, results);
          await setAnalysisPaneSize('narrow');
          await researchScreenshot(`${prefix}-frequency-narrow`, results);
          expect(
            await panel.execute((element) => element.scrollWidth <= element.clientWidth + 1),
          ).toBe(true);
          await setAnalysisPaneSize('normal');
          await setResearchTheme(false);
          await results.$('button=Ranked lists').click();
          const token = results.$('[role="listitem"][title^="policy:"]');
          await token.click();
          const concordance = $('[data-testid="concordance-workspace"]');
          const output = concordance.$('[aria-label="Concordance results"]');
          await expect(concordance.$('input[aria-label="Concordance query"]')).toHaveValue(
            'policy',
          );
          await output.$('button=policy').waitForExist();
          await expect(output).toHaveText(expect.stringContaining(refName));
          await expect(output).toHaveText(expect.stringContaining(studyName));
          await expect(output).not.toHaveText(
            expect.stringContaining('Displayed results use the previously submitted search'),
          );
          const concId = await runResearchAnalysis(base, 'concordance', concordance);
          const saved = await api.getConcordanceResult(base, concId);
          if (!saved) throw new Error('Completed Concordance analysis has no saved output');
          expect(saved.result.payload.corpora.map((c) => c.match_count)).toEqual([
            policyCount(reference),
            policyCount(study),
          ]);
          await output.$('button*=Metadata').click();
          await $('[aria-label="Concordance metadata columns"]').$('label=topic').click();
          await browser.keys('Escape');
          await output.$('[role="tab"]=Dispersion').click();
          await output.$('[aria-roledescription="interactive chart"] svg').waitForExist();
          await expect(output.$$('[aria-label="Matched terms"]')).toBeElementsArrayOfSize(2);
          await researchScreenshot(`${prefix}-concordance-separated`, output);
          await output.$('[role="tab"]=Combined').click();
          await expect(output.$$('[aria-label="Matched terms"]')).toBeElementsArrayOfSize(1);
          await output.$('label=Bar length proportional to text length').click();
          await expect(output.$('[aria-roledescription="interactive chart"]')).not.toExist();
          await output.$('label=Bar length proportional to text length').click();
          const chart = output.$('[aria-roledescription="interactive chart"]');
          await chart.waitForExist();
          await chart.execute((element) => {
            element.focus();
          });
          await browser.keys(['ArrowRight', 'Enter']);
          await output.$('button=Clear selection').click();
          await setResearchTheme(true);
          await researchScreenshot(`${prefix}-concordance-dark`, output);
          await setAnalysisPaneSize('narrow');
          await researchScreenshot(`${prefix}-concordance-narrow`, output);
          await setAnalysisPaneSize('normal');
          await setResearchTheme(false);
          await output.$('[role="tab"]=Table').click();
          await expect(output.$('th=Source')).toExist();
          await expect(output.$('th=topic')).toExist();
          // A later saved page must remain queryable against the imported original rows.
          const page = await api.queryConcordance(base, concId, {
            source_index: 0,
            projection: 'documents',
            page: 2,
            page_size: 20,
            sort: null,
            filter: { excluded_terms: [], uncased: false, bins: [], bin_count: 20 },
          });
          expect(page.documentCount).toBe(70);
          expect(page.table.numRows).toBe(20);
        },
      );
    },
  );
}

export async function researchQuotationScenario(base: string, prefix: string) {
  await requireQuotationModel();
  await prepareResearchVisit();
  await withResearchFile('public-discourse-quotations.json', `${prefix}_quotes`, async (source) => {
    await $('button=Quotation').click();
    const panel = $('[data-testid="quotation-workspace"]');
    await addResearchInput(panel, source);
    await chooseColumn('Text Column:', 'text', panel);
    await panel.$('button=Preview').click();
    const results = panel.$('[aria-label="Quotation results"]');
    await results.$('button[aria-label^="Inspect document"]').waitForExist();
    await expect(results.$('[role="tab"]=Documents')).toHaveAttribute('aria-selected', 'true');
    await results.$('button*=Metadata and fields').click();
    await $('[aria-label="Quotation result columns"]').$('label=tags').click();
    await browser.keys('Escape');
    const id = await runResearchAnalysis(base, 'quotation', panel);
    const saved = await api.getQuotationResult(base, id);
    if (!saved) throw new Error('Completed Quotation analysis has no saved output');
    expect(saved.result.payload.document_count).toBe(28);
    expect(saved.result.payload.matching_documents).toBe(26);
    expect(saved.result.payload.match_count).toBe(39);
    await results.$('th=tags').waitForExist();
    await researchScreenshot(`${prefix}-quotation-documents`, results);
    await results.$('a[aria-label="Go to next page"]').click();
    await expect(results.$$('button[aria-label^="Inspect document"]')).toBeElementsArrayOfSize(6);
    await results.$('[role="tab"]=Quotations').click();
    await researchScreenshot(`${prefix}-quotation-matches`, results);
    await setResearchTheme(true);
    await researchScreenshot(`${prefix}-quotation-dark`, results);
    await setAnalysisPaneSize('narrow');
    await researchScreenshot(`${prefix}-quotation-narrow`, results);
    await setAnalysisPaneSize('normal');
    await setResearchTheme(false);
    await results.$('[role="tab"]=Documents').click();
    await results.$('button=Add to Project').click();
    if (!(await $('[role="menuitem"]').isExisting())) await browser.keys('ArrowDown');
    await $('[role="menuitem"]=Documents').click();
    const dialog = $('[role="dialog"]');
    await dialog.$('input').setValue(`${source}_published`);
    await dialog.$('button=Select all').click();
    await dialog.$('button=Add').click();
    await dialog.waitForExist({ reverse: true });
    const rows = await api.querySql(base, [
      {
        sql: `SELECT document_id, tags FROM data.${api.identifier(`${source}_published`)} ORDER BY document_id`,
      },
    ]);
    expect(rows.numRows).toBe(26);
    expect(rows.toArray().map((r: Record<string, unknown>) => Number(r.document_id))).toEqual(
      Array.from({ length: 26 }, (_, i) => i + 3),
    );
    await expect($('[data-testid="project-data-overlay"]')).not.toExist();
  });
}
