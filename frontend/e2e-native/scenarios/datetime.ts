import { browser, expect } from '@wdio/globals';
import { expectAppError } from '../../e2e-browser/diagnostics';
import { querySql, executeSql } from '../../src/features/project/api';

export async function datetimeScenario(base: string) {
  await executeSql(base, [
    { sql: "CREATE TABLE data.datetime_raw(stamp VARCHAR, ambiguous VARCHAR)" },
    { sql: "INSERT INTO data.datetime_raw VALUES ('2020-10-17 00:52:37.000 +0530', '01/02/2020')" },
    { sql: "CREATE VIEW data.datetime_probe AS SELECT * FROM data.datetime_raw" },
    { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('datetime_probe')" },
  ], { all: true });
  await browser.$('[aria-label="Select datetime_probe"]').click();
  await browser.$('[data-testid="project-data-overlay"]').waitForStable();
  const stamp = browser.$('[aria-label="Change data type for column stamp"]');
  await stamp.click();
  await browser.keys('ArrowDown');
  await browser.$('[role="menuitemradio"]=datetime').click();
  await expect(stamp).toHaveText(expect.stringContaining('datetime with timezone'));
  await expect(browser.$('[role="dialog"]')).not.toExist();
  await querySql(base, [{ sql: "SELECT CASE WHEN stamp=TIMESTAMPTZ '2020-10-16 19:22:37+00' THEN 1 ELSE error('Offset was lost') END FROM data.datetime_probe" }]);
  const ambiguous = browser.$('[aria-label="Change data type for column ambiguous"]');
  await ambiguous.scrollIntoView();
  await ambiguous.click();
  await browser.keys('ArrowDown');
  await browser.$('[role="menuitemradio"]=datetime').click();
  const dialog = browser.$('[role="dialog"]');
  await expect(dialog).toBeDisplayed();
  await expect(browser.$$('[data-sonner-toast]')).toBeElementsArrayOfSize(0);
  const input = dialog.$('#datetime-format');
  await input.setValue('%Y-%m-%d');
  expectAppError(/Could not parse string/);
  await dialog.$('button=Convert').click();
  await expect(browser.$$('[data-sonner-toast]')).toBeElementsArrayOfSize(1);
  await expect(dialog).toBeDisplayed();
  await expect(input).toHaveValue('%Y-%m-%d');
  await browser.$('[data-sonner-toast] button[aria-label="Close toast"]').click();
  await input.setValue('%d/%m/%Y');
  await dialog.$('button=Convert').click();
  await expect(dialog).not.toExist();
  await expect(ambiguous).toHaveText(expect.stringContaining('datetime'));
  await querySql(base, [{ sql: "SELECT CASE WHEN ambiguous=TIMESTAMP '2020-02-01' THEN 1 ELSE error('Wrong manual date') END FROM data.datetime_probe" }]);
}
