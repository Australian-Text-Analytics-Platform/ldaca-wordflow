import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { renderPreview } from '../src/features/quicklook/render';
import { press, screenshot } from './fixtures';

it('keeps Quick Look disclosures keyboard-accessible and schemas readable in narrow windows', async () => {
  const name = 'Survey – 回答 with a deliberately long Data Block name';
  await browser.setViewport({ width: 480, height: 760 });
  await browser.url(`data:text/html;charset=utf-8,${encodeURIComponent(renderPreview({
    filename: 'Research project.wfpj',
    file_size: '2.1 MB',
    saved_sql_cells: 2,
    nodes: [{
      table_name: name, kind: 'Table', column_count: 2,
      columns: [
        { name: 'A long quoted column "名前"', type: 'DECIMAL(18,4)' },
        { name: 'Nested values', type: 'STRUCT("long nested field" TIMESTAMP WITH TIME ZONE, tags VARCHAR[])' },
      ],
    }],
  }))}`);
  const disclosure = browser.$('details');
  const summary = browser.$('summary');
  await expect(disclosure).not.toHaveAttribute('open');
  await press('Enter', summary);
  await expect(disclosure).toHaveAttribute('open');
  await expect(browser.$('table')).toBeDisplayed();
  await expect(browser.$('.name')).toHaveText(name);
  expect(await browser.execute(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await screenshot('quicklook-narrow.png');
  await press('Space', summary);
  await expect(disclosure).not.toHaveAttribute('open');
  await expect(browser.$('table')).not.toBeDisplayed();
});
