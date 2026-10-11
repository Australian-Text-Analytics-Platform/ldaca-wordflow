import { $, $$, browser, expect } from '@wdio/globals';
import { after, it } from 'mocha';
import { resolve } from 'node:path';
import { executeSql } from '../src/features/project/api';
import { getTokenizers } from '../src/features/tools/token-frequency/api';

const base = 'http://127.0.0.1:3237';
const ownedProjects = new Set<string>();
async function closeFixtures() {
  await browser.url('about:blank');
  for (const project_id of ownedProjects) {
    const response = await fetch(`${base}/api/server/project/close`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id, discard_untitled: true, interrupt: true }),
    });
    if (!response.ok) throw new Error(await response.text());
    ownedProjects.delete(project_id);
  }
}
after(closeFixtures);
async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
async function preferences(patch: unknown) { return api('/api/preferences', 'PATCH', patch); }
async function freshProject() {
  await closeFixtures();
  await preferences({ theme: 'light-2026', hiddenTools: [], guidance: { enabled: true, resetAcknowledgments: true } });
  const project = await api('/api/server/project', 'POST', { name: null });
  ownedProjects.add(project.project_id);
  await browser.url(`${base}/?project=${project.project_id}`);
  await $('[data-testid="sidebar-section-tools"]').waitForDisplayed({ timeout: 45000 });
  await expect($('h2=Welcome to Wordflow')).not.toExist();
  await visit('Export');
  await visit('Data Loader');
  return project;
}
async function visit(name: string) {
  await $('[data-testid="sidebar-section-tools"]').$(`button=${name}`).click();
  const ids: Record<string, string> = {
    'Data Loader': 'data-loader', Preprocessing: 'filter', Frequency: 'token-frequency',
    Concordance: 'concordance', Plots: 'plots', 'Topic Modelling': 'topic-modeling',
    Quotation: 'quotation', Annotation: 'annotation', Export: 'export',
  };
  await $(`[data-guidance-tool="${ids[name]}"] [data-guidance-stage="setup"]`).waitForDisplayed();
}
async function hint(id: string) {
  const popup = $(`[data-guidance-popup="${id}"]`);
  await expect(popup).toBeDisplayed();
  await expect(popup.$('button=Got it')).toBeDisplayed();
  await expect($$('[data-guidance-popup]')).toBeElementsArrayOfSize(1);
  await expect($('[data-guidance-highlighted="true"]')).toBeDisplayed();
  const layout = await browser.execute(() => {
    const target = document.querySelector<HTMLElement>('[data-guidance-highlighted="true"]')!;
    const popup = document.querySelector<HTMLElement>('[data-guidance-popup]')!;
    const rect = popup.getBoundingClientRect();
    return { outline: getComputedStyle(target).outlineStyle,
      inViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1 };
  });
  expect(layout.outline).toBe('solid');
  expect(layout.inViewport).toBe(true);
  await expect($('[class*="driver-overlay"]')).not.toExist();
  return popup;
}
async function acknowledge(id: string) {
  await (await hint(id)).$('button=Got it').click();
  await browser.waitUntil(async () => (await api('/api/preferences')).guidance.acknowledgments[id] === 1);
}

it('opens host Settings before project selection and restores its welcome opener', async () => {
  await preferences({ guidance: { enabled: true }, theme: 'light-2026' });
  await browser.url(base);
  await expect($('h2=Welcome to Wordflow')).toBeDisplayed();
  await $('[role="dialog"]').$('[aria-label="Open settings"]').click();
  await expect($('h2=Settings')).toBeDisplayed();
  await expect($('p=Preferences for this single-user web host.')).toBeDisplayed();
  await $('button=AI').click();
  await expect($('h2=AI connections')).toBeDisplayed();
  await $('button=Portal').click();
  await expect($('h2=Portal access')).toBeDisplayed();
  await expect($('input[type="password"]')).toHaveValue('');
  await $('button=Storage').click();
  await expect($('h2=Storage locations')).toBeDisplayed();
  await expect($('[aria-label="Copy Project library path"]')).toBeDisplayed();
  await browser.keys('Escape');
  await expect($('h2=Settings')).not.toExist();
  await expect($('h2=Welcome to Wordflow')).toBeDisplayed();
  await expect($('[role="dialog"]').$('[aria-label="Open settings"]')).toBeFocused();
});

it('shows one highlighted setup hint for every tool without stealing navigation focus', async () => {
  await freshProject();
  const tools = [
    ['Data Loader', 'data-loader'], ['Preprocessing', 'filter'], ['Frequency', 'token-frequency'],
    ['Concordance', 'concordance'], ['Plots', 'plots'], ['Topic Modelling', 'topic-modeling'],
    ['Quotation', 'quotation'], ['Annotation', 'annotation'], ['Export', 'export'],
  ];
  await visit('Export');
  for (const [name, id] of tools) {
    await visit(name!);
    await hint(`${id}.setup`);
    expect(await browser.execute(() => document.activeElement?.textContent?.trim())).toBe(name);
    await acknowledge(`${id}.setup`);
  }
  expect(Object.keys((await api('/api/preferences')).guidance.acknowledgments)).toHaveLength(9);
  await browser.refresh();
  await expect($('[data-guidance-popup="export.setup"]')).not.toExist();
});

it('defers Escape and outside clicks without acknowledging and preserves drafts through Settings', async () => {
  await freshProject();
  await visit('Export'); await hint('export.setup');
  await browser.keys('Escape');
  await expect($('[data-guidance-popup]')).not.toExist();
  expect((await api('/api/preferences')).guidance.acknowledgments['export.setup']).toBeUndefined();
  await visit('Data Loader'); await visit('Export'); await hint('export.setup');
  await $('button=Project & Data').click();
  await expect($('[role="dialog"]')).toBeDisplayed();
  await expect($('[data-guidance-popup]')).not.toExist();
  await $('[role="dialog"]').$('button=Close').click();
  await visit('Data Loader');
  const search = $('[aria-label="Search data files"]');
  await search.setValue('my draft');
  await expect($('[data-guidance-popup]')).not.toExist();
  await $('[aria-label="Open settings"]').click();
  await expect($('h2=Settings')).toBeDisplayed(); await browser.keys('Escape');
  await expect(search).toHaveValue('my draft');
  await expect($('[aria-label="Open settings"]')).toBeFocused();
  await visit('Export'); await (await hint('export.setup')).$('button=Not now').click();
  await expect($('[data-guidance-highlighted]')).not.toExist();
});

it('persists disable, confirmed reset and protected Data Loader visibility', async () => {
  await freshProject(); await acknowledge('data-loader.setup'); await visit('Export');
  await (await hint('export.setup')).$('button=Disable hints').click();
  await browser.refresh(); await expect($('[data-guidance-popup]')).not.toExist();
  await $('[aria-label="Open settings"]').click(); await $('button=Guidance').click();
  await $('button=Reset hint history').click();
  await expect($('[role="alertdialog"]')).toBeDisplayed();
  expect(await browser.execute(() => document.activeElement?.textContent?.trim())).toBe('Cancel');
  await $('button=Reset history').click();
  await expect($('[role="alertdialog"]')).not.toExist();
  await browser.waitUntil(async () => Object.keys((await api('/api/preferences')).guidance.acknowledgments).length === 0);
  expect((await api('/api/preferences')).guidance.enabled).toBe(false);
  await $('[role="switch"]').click();
  await browser.waitUntil(async () => (await api('/api/preferences')).guidance.enabled === true);
  await browser.keys('Escape');
  await visit('Export'); await visit('Data Loader'); await hint('data-loader.setup');
  await $('[aria-label="Edit visible tools"]').click(); await $('[role="menuitemcheckbox"]=Plots').click();
  await browser.keys('Escape'); await browser.refresh();
  await expect($('[data-testid="sidebar-section-tools"]').$('button=Plots')).not.toExist();
  await expect($('[data-testid="sidebar-section-tools"]').$('button=Data Loader')).toBeDisplayed();
  await $('[aria-label="Edit visible tools"]').click();
  await expect($('[role="menuitemcheckbox"]=Data Loader')).not.toExist();
  await browser.keys('Escape');
});

it('walks real frequency results and exports with guidance and preserves highlights on resize', async () => {
  const project = await freshProject();
  await executeSql(`${base}/project/${project.project_id}`, [
    { sql: "CREATE TABLE data.guidance AS SELECT 'river garden river' AS text UNION ALL SELECT 'garden community'" },
    { sql: "INSERT INTO wordflow.nodes(table_name) VALUES ('guidance')" },
  ], { all: true });
  await browser.refresh(); await visit('Frequency'); await acknowledge('token-frequency.setup');
  await $('button=Add data block').click(); await $('button=guidance').click();
  await $('[role="combobox"][aria-label="Column"]').click();
  await $('[role="option"]=text').click();
  const tokenizer = (await getTokenizers(`${base}/project/${project.project_id}`)).find((item) => item.model_id === 'native:plain_words_en');
  if (!tokenizer) throw new Error('English tokenizer is unavailable');
  await $('[aria-label="guidance tokenizer"]').click();
  await $(`[role="option"]=${tokenizer.label}`).click();
  await visit('Data Loader'); await visit('Frequency'); await acknowledge('token-frequency.action');
  await $('button=Run').click();
  await expect($('h2=Results')).toBeDisplayed();
  // Running is an outside interaction: guidance resumes on the next tool visit.
  await visit('Data Loader'); await visit('Frequency'); await acknowledge('token-frequency.results');
  await hint('token-frequency.followup');
  await browser.saveScreenshot(resolve('.tmp/wdio/server/frequency-guidance.png'));
  await acknowledge('token-frequency.followup');
  // Preview-first teaching must keep both named actions reachable beneath the card.
  for (const [name, id] of [['Concordance', 'concordance'], ['Topic Modelling', 'topic-modeling'], ['Quotation', 'quotation']]) {
    await visit(name!); await acknowledge(`${id}.setup`);
    const tool = $(`[data-guidance-tool="${id}"]`);
    await tool.$('button=Add data block').click(); await $('button=guidance').click();
    await tool.$('[role="combobox"][aria-label="Column"]').click(); await $('[role="option"]=text').click();
    if (id === 'concordance') await tool.$('[aria-label="Concordance query"]').setValue('river');
    if (id === 'topic-modeling') {
      await tool.$('[aria-label="guidance tokenizer"]').click(); await $(`[role="option"]=${tokenizer.label}`).click();
    }
    await visit('Data Loader'); await visit(name!);
    await hint(`${id}.action`);
    await expect($('[data-guidance-highlighted]')).toHaveText('Preview');
    for (const width of [1280, 800]) {
      await browser.setWindowSize(width, 900); await hint(`${id}.action`);
      expect(await browser.execute((toolId) => ['Run', 'Preview'].every((label) => {
        const button = Array.from(document.querySelectorAll<HTMLButtonElement>(`[data-guidance-tool="${toolId}"] button`)).find((item) => item.textContent?.trim() === label)!;
        const box = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      }), id)).toBe(true);
    }
    await browser.saveScreenshot(resolve(`.tmp/wdio/server/${id}-action-guidance.png`));
    await acknowledge(`${id}.action`);
    await browser.setWindowSize(1280, 900);
  }
  await visit('Export'); await acknowledge('export.setup');
  await $('[role="tab"]=Wordflow project').click();
  await $('[data-testid="export-feature"]').$('button=Add data block').click(); await $('button=guidance').click();
  await visit('Frequency'); await visit('Export'); await acknowledge('export.action');
  await hint('export.results'); await browser.setWindowSize(800, 900); await hint('export.results');
  await browser.saveScreenshot(resolve('.tmp/wdio/server/narrow-guidance.png'));
  await acknowledge('export.results');
  await $('[data-testid="export-feature"]').$('button=Export').click(); await hint('export.followup');
  await browser.setWindowSize(1280, 900);
});

it('shares Portal and AI Settings shortcuts without changing selected workflow inputs', async () => {
  await freshProject(); await visit('Data Loader');
  await $('[role="tab"]=LDaCA').click(); await $('button=Manage Portal access').click();
  await expect($('h2=Portal access')).toBeDisplayed(); await browser.keys('Escape');
  await expect($('[role="tab"]=LDaCA')).toHaveAttribute('data-state', 'active');
  await visit('Annotation'); await $('[role="tab"]=AI').waitForDisplayed(); await $('[role="tab"]=AI').click();
  const connection = $('[aria-label="AI connection"]');
  const selected = await connection.getText();
  await $('button=Manage connections').click();
  await expect($('h2=AI connections')).toBeDisplayed(); await browser.keys('Escape');
  await expect(connection).toHaveText(selected);
  await expect($('button=Manage connections')).toBeFocused();
  await expect($('[role="tab"]=AI')).toHaveAttribute('data-state', 'active');
});
