import { expectAppError } from './diagnostics';
import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { hover, role, roles, label, testId, post, rect, press } from './fixtures';

it('one toggled preview switches data without changing selection or graph positions', async () => {
  await post('/api/project/sql', {
    response: 'command',
    statements: [
      { sql: 'CREATE TABLE data.alpha AS SELECT i AS value FROM range(55) t(i)' },
      { sql: 'CREATE TABLE data.beta AS SELECT 99 AS value' },
      { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('alpha'), ('beta')" },
    ],
  });
  await browser.url('/');
  const graph = label('Data Block graph', { exact: true });
  const card = (name: string) => graph.$(`.react-flow__node[data-id="${name}"]`);
  const overlay = () => testId('project-data-overlay');
  const preview = () => role('button', { name: 'Preview data', exact: true });
  const title = () => testId('project-data-node-label');
  const keyboardPreview = async (name: string) => {
    await (await card(name).$('[aria-keyshortcuts="Enter"]').getElement()).execute((element) => {
      element.focus();
    });
    await press('Enter');
    await expect(preview()).toBeFocused();
    await press('Enter');
  };

  // Continuous hover transfer keeps the eye clickable; the same eye closes it.
  await hover(card('alpha'));
  const initialBounds = await rect(preview());
  const cardBounds = await rect(card('alpha'));
  expect(initialBounds.y + initialBounds.height).toBeLessThanOrEqual(cardBounds.y + 1);
  await browser
    .action('pointer', { id: 'mouse' })
    .move({
      x: Math.round(initialBounds.x + initialBounds.width / 2),
      y: Math.round(initialBounds.y + initialBounds.height / 2),
      duration: 200,
    })
    .perform(true);
  const viewport = graph.$('.react-flow__viewport');
  const position = await viewport.getAttribute('style');
  await preview().click();
  await overlay().waitForStable();
  await expect(preview()).toHaveAttribute('aria-pressed', 'true');
  await expect(title()).toHaveText('alpha');
  await expect(roles('tab', {}, overlay())).toBeElementsArrayOfSize(0);
  await expect(role('button', { name: 'Select alpha', exact: true })).toBeDisplayed();
  await press('End', role('separator', { name: 'Resize graph and data panels' }));
  await hover(card('alpha'));
  await preview().click();
  await expect(preview()).toHaveAttribute('aria-pressed', 'false');
  await expect(overlay()).not.toExist();
  await card('alpha').click();
  await expect(role('button', { name: 'Deselect alpha', exact: true })).toBeDisplayed();
  await expect(overlay()).not.toExist();
  await hover(role('heading', { name: 'Data Loader', exact: true }));
  await expect(preview()).not.toExist();

  await keyboardPreview('alpha');
  await overlay().waitForStable();
  await role('link', { name: 'Go to next page' }).click();
  await expect(role('cell', { name: '20', exact: true })).toBeDisplayed();
  // Keep both graph cards accessible above the overlay.
  await press('End', role('separator', { name: 'Resize graph and data panels' }));
  await keyboardPreview('beta');
  await expect(title()).toHaveText('beta');
  await expect(role('cell', { name: '99', exact: true })).toBeDisplayed();
  await expect(preview()).toHaveAttribute('aria-pressed', 'true');
  await expect(role('button', { name: 'Select beta', exact: true })).toBeDisplayed();
  await keyboardPreview('alpha');
  await expect(role('cell', { name: '20', exact: true })).toBeDisplayed();
  expect(await viewport.getAttribute('style')).toBe(position);

  // Sidebar deselection leaves the preview visible; selecting switches it.
  await role('button', { name: 'Deselect alpha', exact: true }).click();
  await expect(title()).toHaveText('alpha');
  await role('button', { name: 'Select beta', exact: true }).click();
  await expect(title()).toHaveText('beta');
  await keyboardPreview('alpha');
  await role('button', { name: 'Rename node' }).click();
  await press('ControlOrMeta+a', role('textbox', { name: 'Node name' }));
  await role('textbox', { name: 'Node name' }).addValue('renamed');
  await press('Enter', role('textbox', { name: 'Node name' }));
  await expect(title()).toHaveText('renamed');
  await expect(role('cell', { name: '20', exact: true })).toBeDisplayed();
  const row = role('button', { name: 'Select renamed', exact: true });
  await hover(row);
  await role('button', { name: 'Actions for renamed' }, row).click();
  await role('menuitem', { name: 'Clone', exact: true }).click();
  await expect(role('button', { name: 'Select renamed_copy', exact: true })).toBeDisplayed();
  await expect(title()).toHaveText('renamed');
  await expect(role('cell', { name: '20', exact: true })).toBeDisplayed();

  // Failed deletion retains the displayed node; successful deletion closes it.
  await role('button', { name: 'Select renamed_copy', exact: true }).click();
  await keyboardPreview('beta');
  const constraint = await post('/api/project/sql', {
    script:
      'ALTER TABLE beta ADD PRIMARY KEY(value); CREATE TABLE beta_guard(value INTEGER REFERENCES beta(value));',
  });
  expect(constraint.ok).toBe(true);
  expectAppError(/Could not drop the table.*main key table.*beta_guard/i);
  await role('button', { name: 'Delete (2)', exact: true }).click();
  await role('button', { name: /Delete/ }, role('alertdialog')).click();
  await expect(role('button', { name: 'Select renamed_copy', exact: true })).not.toExist();
  await expect(title()).toHaveText('beta');
  await role('button', { name: 'Close preview' }).click();
  await expect(overlay()).not.toExist();
  await expect(role('button', { name: 'Deselect beta', exact: true })).toBeDisplayed();
});
