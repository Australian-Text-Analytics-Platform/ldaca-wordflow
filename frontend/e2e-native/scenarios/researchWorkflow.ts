import { $, browser, expect } from '@wdio/globals';
import * as api from '../../src/features/project/api';
import {
  withResearchFile,
  readResearchData,
  prepareResearchVisit,
  chooseColumn,
  addResearchInput,
  runResearchAnalysis,
  researchScreenshot,
  type SurveyRow,
} from './researchData';

/** One research journey crosses imported files, a live join, saved analysis and publication. */
export async function researchWorkflow(base: string) {
  const survey = await readResearchData<SurveyRow>('community-survey.json');
  const lookup = await readResearchData<{ row_id: number; cohort: string; consent: boolean }>(
    'survey-participants.json',
  );
  const expected = survey.flatMap((row) => {
    const matches = lookup.filter((participant) => participant.row_id === row.row_id);
    return (matches.length ? matches : [{ cohort: null, consent: null }]).map((participant) => ({
      row_id: row.row_id,
      label: row.label,
      cohort: participant.cohort,
      consent: participant.consent,
    }));
  });
  const readRows = async (name: string) =>
    (
      await api.querySql(base, [
        {
          sql: `SELECT row_id,label,cohort,consent FROM data.${api.identifier(name)} ORDER BY row_id,cohort`,
        },
      ])
    )
      .toArray()
      .map((r: Record<string, unknown>) => ({ ...r, row_id: Number(r.row_id) }));
  await prepareResearchVisit();
  await withResearchFile('community-survey.parquet', 'survey_wave', async () => {
    await withResearchFile('survey-participants.json', 'survey_panel', async () => {
      await $('button=Preprocessing').click();
      await $('#preprocessing-tab-join').waitForDisplayed();
      await $('#preprocessing-tab-join').execute((element) => {
        element.focus();
      });
      await browser.keys('Enter');
      await expect($('#preprocessing-tab-join')).toHaveAttribute('aria-selected', 'true');
      const join = $('#preprocessing-panel-join');
      await join.waitForDisplayed();
      for (const [index, name] of ['survey_wave', 'survey_panel'].entries()) {
        const add = join.$$('button=Add data block')[index];
        if (!add) throw new Error('Join input role missing');
        await add.click();
        await $(`button=${name}`).click();
      }
      await chooseColumn('Left column:', 'row_id', join);
      await chooseColumn('Right column:', 'row_id', join);
      await join.$('#join-type').click();
      await $('[role="option"]=left').click();
      await join.$('#join-new-node-name').setValue('survey_joined');
      await join.$('button=Create Data Block').waitForEnabled();
      await join.$('button=Create Data Block').click();
      await $('[aria-label="Select survey_joined"]').waitForDisplayed();
      expect(await readRows('survey_joined')).toEqual(expected);
      expect(expected.length).toBe(494); // Duplicate participant keys multiply only matching rows.
      await researchScreenshot('research-join-normal', join);
      await $('button=Plots').click();
      await $('[aria-label="Plot modes"]').$('[role="tab"]=Compare').click();
      const panel = $('[data-testid="compare-workspace"]');
      await addResearchInput(panel, 'survey_joined');
      await chooseColumn('Category', 'cohort', panel);
      const id = await runResearchAnalysis(base, 'compare', panel);
      const data = await api.queryPlot(base, id, 'compare', { uncased: false, minimum_rows: 0 });
      const counts = Object.fromEntries(
        data
          .toArray()
          .map((r: Record<string, unknown>) => [String(r.category_key), Number(r.value)]),
      );
      expect(counts).toEqual({ '[null]': 320, '["Panel A"]': 160, '["Panel B"]': 14 });
      const result = panel.$('[aria-label="Plot results"]');
      await result.$('button=Add to Project').waitForEnabled();
      await result.$('button=Add to Project').click();
      const dialog = $('[role="dialog"]');
      await dialog.waitForDisplayed();
      await dialog.$('input').setValue('survey_retained');
      await dialog.$('button=Select all').click();
      await dialog.$('button=Add').click();
      await dialog.waitForExist({ reverse: true });
      expect(await readRows('survey_retained')).toEqual(expected);
      await panel.$('button=Clear results').click();
      await expect(result).not.toExist();
      await browser.refresh();
      expect(await readRows('survey_retained')).toEqual(expected);
      await expect($('[aria-label="Select survey_retained"]')).toBeDisplayed();
    });
  });
}
