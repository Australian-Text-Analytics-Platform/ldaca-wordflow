import { browser, $, expect } from '@wdio/globals';
import { it } from 'mocha';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tableFromIPC, DataType, type TypeMap } from 'apache-arrow';
import JSZip from 'jszip';
import { inspectProjectFile } from '../e2e-native/scenarios/projectFile';
import { exportScenario } from '../e2e-native/scenarios/export';
import {
  readResearchData,
  type SurveyRow,
  withResearchFile,
  addResearchInput,
  chooseColumn,
  runResearchAnalysis,
} from '../e2e-native/scenarios/researchData';
import * as api from '../src/features/project/api';
import { baseUrl, outputDir, screenshot } from './fixtures';

const literal = (text: string) => `'${text.replaceAll("'", "''")}'`;
async function downloaded(name: string, action: () => Promise<unknown>) {
  const path = resolve(outputDir, 'downloads', name);
  await rm(path, { force: true });
  await action();
  await browser.waitUntil(
    async () => {
      try {
        return (await readFile(path)).length > 0;
      } catch {
        return false;
      }
    },
    { timeoutMsg: `${name} was not downloaded` },
  );
  return path;
}

// Format-specific readers check every original value. They do not call the exporter.
async function verifySurvey(path: string, extension: string, expected: SurveyRow[]) {
  if (extension === 'arrow') {
    const table = tableFromIPC<TypeMap>(await readFile(path));
    expect(table.numRows).toBe(expected.length);
    expect(table.schema.fields.map((f) => f.name)).toEqual(Object.keys(expected[0] ?? {}));
    expect(DataType.isDecimal(table.getChild('measurement')?.type)).toBe(true);
    for (const [i, row] of expected.entries()) {
      for (const [key, value] of Object.entries(row)) {
        const actual: unknown = table.getChild(key)?.get(i);
        if (key === 'day') expect(Number(actual)).toBe(Date.parse(row.day));
        else if (key === 'recorded_at') expect(Number(actual)).toBe(Date.parse(row.recorded_at));
        // Decimal Arrow lanes are lossless scaled integers, inspected below via the other readers.
        else if (key === 'measurement') {
          if (value === null) expect(actual).toBeNull();
          else expect(String(actual)).toBe(String(Math.round(Number(value) * 100)));
        } else if (typeof value === 'number') expect(Number(actual)).toBe(value);
        else expect(actual).toBe(value);
      }
    }
    return;
  }
  const reader =
    extension === 'parquet' ? 'read_parquet' : extension === 'csv' ? 'read_csv' : 'read_json_auto';
  const table = await api.querySql(baseUrl, [
    {
      sql: `SELECT * EXCLUDE(day,recorded_at,measurement), day::VARCHAR AS day, epoch_ms(recorded_at::TIMESTAMPTZ) AS recorded_ms, measurement::DOUBLE AS measurement FROM ${reader}(${literal(path)}) ORDER BY row_id`,
    },
  ]);
  const rows = table
    .toArray()
    .map((row: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]),
      ),
    );
  expect(rows).toEqual(
    expected.map(({ recorded_at, ...row }) => ({
      ...row,
      region: extension === 'csv' && row.region === '' ? null : row.region,
      recorded_ms: Date.parse(recorded_at),
    })),
  );
}

it('exports every row and value in five formats, ZIP members, and reopens selected/complete projects', async function () {
  this.timeout(240000);
  const expected = await readResearchData<SurveyRow>('community-survey.json');
  await browser.url('/');
  await exportScenario(async (panel, source) => {
    for (const [label, extension] of [
      ['CSV (.csv)', 'csv'],
      ['JSON (.json)', 'json'],
      ['NDJSON (.ndjson)', 'ndjson'],
      ['Parquet (.parquet)', 'parquet'],
      ['Arrow IPC (.arrow)', 'arrow'],
    ] as const) {
      await panel.$('#export-format').click();
      await $(`[role="option"]=${label}`).click();
      await panel.$('button=Export').waitForEnabled();
      const path = await downloaded(`${source}.${extension}`, () =>
        panel.$('button=Export').click(),
      );
      await verifySurvey(path, extension, expected);
      await expect(panel.$('button=Export')).toBeEnabled();
    }
    await withResearchFile('annotation-codebook.json', 'export_codes', async () => {
      await $('button=Export').click();
      await panel.$('button=Add data block').click();
      await $('button=export_codes').click();
      await panel.$('#export-format').click();
      await $('[role="option"]=JSON (.json)').click();
      const path = await downloaded('Untitled_data_blocks.zip', () =>
        panel.$('button=Export').click(),
      );
      const zip = await JSZip.loadAsync(await readFile(path));
      expect(Object.keys(zip.files).sort()).toEqual(['export_codes.json', `${source}.json`].sort());
      const codes = zip.file('export_codes.json');
      const survey = zip.file(`${source}.json`);
      if (!codes || !survey) throw new Error('ZIP is missing an exported Data Block');
      expect(JSON.parse(await codes.async('string'))).toEqual(
        await readResearchData('annotation-codebook.json'),
      );
      expect(JSON.parse(await survey.async('string'))).toHaveLength(480);
    });
    // A UI-created tab must travel only with complete-project export.
    await $('button=Frequency').click();
    const frequency = $('[data-testid="frequency-workspace"]');
    await addResearchInput(frequency, source);
    await chooseColumn('Text Column:', 'label', frequency);
    await chooseColumn(`${source} tokenizer`, 'Plain words (English)', frequency);
    const analysisId = await runResearchAnalysis(baseUrl, 'frequency', frequency);
    const tabs = await api.listTabs(baseUrl);
    expect(tabs).toHaveLength(1);
    await $('button=Export').click();
    await panel.$('[role="tab"]=Wordflow project').click();
    await screenshot('export-project.png');
    await panel.$('button=Export').waitForEnabled();
    const selected = await downloaded('Untitled_selected.wfpj', () =>
      panel.$('button=Export').click(),
    );
    await panel.$('#export-scope').click();
    await $('[role="option"]=Complete project').click();
    await panel.$('button=Export').waitForEnabled();
    const complete = await downloaded('Untitled_portable.wfpj', () =>
      panel.$('button=Export').click(),
    );
    // Fresh processes load each output. Refreshing this page alone would not prove reopening.
    for (const [path, expectedTabs] of [
      [selected, []],
      [complete, tabs],
    ] as const) {
      await inspectProjectFile(path, async (base) => {
        expect(await api.listTabs(base)).toEqual(expectedTabs);
        if (path === complete) {
          const counts = await api.queryFrequency(base, analysisId, {
            view: 'corpus',
            corpus_index: 0,
            filter: 'synthetic',
          });
          expect(
            counts.table
              .toArray()
              .map((r: Record<string, unknown>) => [r.token, Number(r.frequency)]),
          ).toEqual([['synthetic', 480]]);
        }
        const values = await api.querySql(base, [
          {
            sql: `SELECT row_id, label, measurement::DOUBLE AS measurement FROM data.${api.identifier(source)} ORDER BY row_id`,
          },
        ]);
        expect(
          values
            .toArray()
            .map((r: Record<string, unknown>) => [Number(r.row_id), r.label, r.measurement]),
        ).toEqual(expected.map((r) => [r.row_id, r.label, r.measurement]));
        expect((await api.getTasks(base)).tasks).toEqual([]);
      });
    }
  });
});
