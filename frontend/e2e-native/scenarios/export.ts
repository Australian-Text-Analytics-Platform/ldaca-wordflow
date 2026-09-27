import type { ChainablePromiseElement } from 'webdriverio';
import { browser, $, expect } from '@wdio/globals';
import { withResearchFile, prepareResearchVisit, setResearchTheme } from './researchData';
import { setAnalysisPaneSize } from '../../e2e-browser/layout';

/** Real imported files and native catalogue inspection; OS save dialogs are checked separately. */
export async function exportScenario(visit: (panel: ChainablePromiseElement, source: string) => Promise<void>) {
  await prepareResearchVisit();
  await withResearchFile('community-survey.parquet', 'export_survey', async (source) => {
    await $('button=Export').click();
    const panel=$('[data-testid="export-feature"]');
    await expect(panel.$('button=Export')).toBeDisabled();
    await panel.$('button=Add data block').click();
    await $('[placeholder="Search data blocks…"]').setValue(source);
    await $(`button=${source}`).click();
    await expect(panel.$('#export-format')).toHaveText('CSV (.csv)');
    await expect(panel.$('button=Export')).toBeEnabled();
    await panel.$('[role="tab"]=Wordflow project').click();
    await expect(panel.$('[aria-label="Export inspection"]')).toHaveText(expect.stringContaining('Save View as a Table'));
    await expect(panel.$('button=Export')).toBeEnabled();
    for (const theme of [false,true]) {
      await setResearchTheme(theme);
      for (const size of ['normal','narrow'] as const) {
        await setAnalysisPaneSize(size);
        await expect(panel.$('button=Export')).toBeDisplayed();
        const overflow=await panel.execute((element) => element.scrollWidth > element.clientWidth+2);
        expect(overflow).toBe(false);
      }
    }
    await setAnalysisPaneSize('normal');
    await setResearchTheme(false);
    await $('button=Data Loader').click();
    await $('button=Export').click();
    await expect(panel).toHaveText(expect.stringContaining(source));
    await panel.$('[role="tab"]=Data files').click();
    await visit(panel,source);
    await browser.refresh();
    await $('button=Export').click();
    await expect($('[data-testid="export-feature"]').$('button=Export')).toBeDisabled();
  });
}
