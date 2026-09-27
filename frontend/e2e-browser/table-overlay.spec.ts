import { browser, expect } from '@wdio/globals';
import { it } from 'mocha';
import { role, label, testId, testIds, post, rect, press, screenshot } from './fixtures';

for (const theme of ['light-2026', 'dark-2026']) {
  it(`content-sized cards and table overlay preserve the graph in ${theme}`, async () => {
    await browser.addInitScript((value) => {
      localStorage.setItem('ldaca-color-theme-v1', value);
    }, theme);
    await browser.url('/');
    await expect(role('heading', { name: 'Data Loader', exact: true })).toBeDisplayed();
    const longName = 'A much longer table name that wraps onto several lines in the graph';
    const seeded = await post('/api/project/sql', {
      response: 'command',
      statements: [
        { sql: 'CREATE TABLE data.short AS SELECT 1 AS value' },
        { sql: `CREATE TABLE data."${longName}" AS SELECT 2 AS value` },
        { sql: `INSERT INTO wordflow.nodes(table_name) VALUES ('short'), ('${longName}')` },
        { sql: `INSERT INTO wordflow.edges VALUES ('short', '${longName}')` },
      ],
    });
    expect(seeded.ok).toBe(true);
    await browser.refresh();
    await browser.$('[aria-label="Data Block graph"]').waitForExist();
    const graph = label('Data Block graph', { exact: true });
    const shortCard = browser.$(
      '[data-id=' + JSON.stringify('short') + '] [data-testid="custom-node-card"]',
    );
    const longCard = browser.$(
      '[data-id=' + JSON.stringify(longName) + '] [data-testid="custom-node-card"]',
    );
    await expect(shortCard).toBeDisplayed();
    await expect(longCard).toBeDisplayed();
    const shortHeight = await (await shortCard.getElement()).execute(
      (element) => element.clientHeight,
    );
    const longHeight = await (await longCard.getElement()).execute(
      (element) => element.clientHeight,
    );
    expect(shortHeight).toBeLessThan(120);
    expect(longHeight).toBeGreaterThan(shortHeight);
    const parentBounds = await rect(shortCard);
    const childBounds = await rect(longCard);
    expect(childBounds.y).toBeGreaterThan(parentBounds.y + parentBounds.height);
    expect(childBounds.x).toBeCloseTo(parentBounds.x, 0);
    await expect(shortCard.$('.react-flow__handle.source')).toHaveAttribute(
      'class',
      /react-flow__handle-bottom/,
    );
    await expect(longCard.$('.react-flow__handle.target')).toHaveAttribute(
      'class',
      /react-flow__handle-top/,
    );
    await screenshot(`cards-${theme}.png`);
    await role('button', { name: 'Zoom in', exact: true }).click();
    const viewport = graph.$('.react-flow__viewport');
    const transform = await (await viewport.getElement()).execute(
      (element) => element.style.transform,
    );
    const graphBounds = await rect(graph);
    const cardBottoms = await browser.execute(() => ({
      graph: document
        .querySelector('[aria-label="Data Block graph"]')
        ?.closest('.rounded-lg')
        ?.getBoundingClientRect().bottom,
      main: document.querySelector('[role="main"]')?.firstElementChild?.getBoundingClientRect()
        .bottom,
    }));
    expect(cardBottoms.graph).toBe(cardBottoms.main);
    const shortBounds = await rect(shortCard);

    // Pause the real animations to inspect intermediate frames deterministically.
    await browser.execute(() => {
      const style = document.createElement('style');
      style.textContent = '[data-testid="project-data-overlay"] { animation-play-state: paused; }';
      document.head.append(style);
    });
    await role('button', { name: 'Select short', exact: true }).click();
    const overlay = () => testId('project-data-overlay');
    await expect(overlay()).toExist();
    await (await overlay().getElement()).execute((element) => {
      const animation = element.getAnimations()[0];
      if (!animation) throw new Error('Missing table entry animation');
      const duration = Number(animation.effect?.getTiming().duration);
      if (!(duration > 0)) throw new Error('Missing animation duration');
      animation.currentTime = duration / 2;
    });
    await screenshot(`overlay-mid-${theme}.png`);
    await (await overlay().getElement()).execute((element) => {
      element.getAnimations().forEach((animation) => {
        animation.finish();
      });
    });
    await expect(role('button', { name: 'Sort by value' })).toBeDisplayed();
    expect(await rect(graph)).toEqual(graphBounds);
    expect(await rect(shortCard)).toEqual(shortBounds);
    expect(await (await viewport.getElement()).execute((element) => element.style.transform)).toBe(
      transform,
    );
    const resize = role('separator', { name: 'Resize graph and data panels' });
    await expect(resize).toHaveAttribute('data-variant', 'line');
    await expect(resize.$('[data-slot="resize-handle-grip"]')).not.toExist();
    const topGap = await (await overlay().getElement()).execute((element) => {
      const header = element
        .querySelector('[data-testid="project-data-node-label"]')
        ?.closest('.border-b');
      if (!header) throw new Error('Missing preview header');
      return header.getBoundingClientRect().top - element.getBoundingClientRect().top;
    });
    expect(topGap).toBeLessThanOrEqual(1);
    await expect(overlay()).toHaveStyle({ 'background-color': 'rgba(0,0,0,0)' });
    await screenshot(`overlay-open-${theme}.png`);

    await press('End', role('separator', { name: 'Resize graph and data panels' }));
    const heightRatio = await (await overlay().getElement()).execute(
      (element) => element.clientHeight / (element.parentElement?.clientHeight ?? 1),
    );
    expect(heightRatio).toBeLessThan(0.21);
    expect(await rect(graph)).toEqual(graphBounds);
    expect(await (await viewport.getElement()).execute((element) => element.style.transform)).toBe(
      transform,
    );
    await press('Home', role('separator', { name: 'Resize graph and data panels' }));
    const openOverlayBounds = await rect(overlay());
    await role('button', { name: 'Close preview', exact: true }).click();
    await expect(overlay()).toHaveAttribute('data-state', 'closed');
    await expect(overlay()).toHaveAttribute('inert', '');
    await expect(overlay()).toHaveText(expect.stringContaining('value'));
    await (await overlay().getElement()).execute((element) => {
      const animation = element.getAnimations()[0];
      if (!(animation instanceof CSSAnimation) || animation.animationName !== 'exit') {
        throw new Error('Missing table exit animation');
      }
      const duration = Number(animation.effect?.getTiming().duration);
      if (!(duration > 0)) throw new Error('Missing animation duration');
      animation.currentTime = duration / 2;
    });
    const exitingBounds = await rect(overlay());
    expect(exitingBounds.y).toBeGreaterThan(openOverlayBounds.y);
    expect(exitingBounds.y).toBeLessThan(graphBounds.y + graphBounds.height);
    await screenshot(`overlay-exit-mid-${theme}.png`);
    expect(await rect(graph)).toEqual(graphBounds);
    expect(await rect(shortCard)).toEqual(shortBounds);
    expect(await (await viewport.getElement()).execute((element) => element.style.transform)).toBe(
      transform,
    );
    const finishedExit = await (await overlay().getElement()).execute((element) => {
      element.getAnimations().forEach((animation) => {
        animation.finish();
      });
      // Inspect synchronously before React unmounts: the final frame must stay offscreen.
      const parent = element.parentElement;
      if (!parent) throw new Error('Preview has no graph container');
      return {
        top: element.getBoundingClientRect().top,
        bottom: parent.getBoundingClientRect().bottom,
        fill: getComputedStyle(element).animationFillMode,
      };
    });
    expect(finishedExit.fill).toBe('forwards');
    expect(finishedExit.top).toBeGreaterThanOrEqual(finishedExit.bottom - 1);
    await expect(overlay()).not.toExist();
    expect(await rect(shortCard)).toEqual(shortBounds);

    // Opening another preview during exit cancels removal.
    await role('button', { name: 'Deselect short', exact: true }).click();
    await role('button', { name: 'Select short', exact: true }).click();
    await (await overlay().getElement()).execute((element) => {
      element.getAnimations().forEach((animation) => {
        animation.finish();
      });
    });
    await role('button', { name: 'Close preview', exact: true }).click();
    await expect(overlay()).toHaveAttribute('data-state', 'closed');
    await role('button', { name: `Select ${longName}`, exact: true }).click();
    await expect(overlay()).toHaveAttribute('data-state', 'open');
    await expect(overlay()).not.toHaveAttribute('inert');
    await (await overlay().getElement()).execute((element) => {
      element.getAnimations().forEach((animation) => {
        animation.finish();
      });
    });
    await expect(overlay()).toHaveText(expect.stringContaining(longName));
    await role('button', { name: 'Close preview', exact: true }).click();
    await (await overlay().getElement()).execute((element) => {
      element.getAnimations().forEach((animation) => {
        animation.finish();
      });
    });
    await expect(overlay()).not.toExist();

    await role('button', { name: 'Deselect short', exact: true }).click();
    await browser.sendCommandAndGetResult('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await role('button', { name: 'Select short', exact: true }).click();
    await expect(overlay()).toHaveStyle({ 'animation-name': 'none' });
    // Reopening can replace the retained table. WDIO's visibility matcher keeps
    // a detached element handle, so resolve the current control on each poll.
    await browser.waitUntil(() => role('button', { name: 'Sort by value' }).isDisplayed(), {
      timeoutMsg: 'The reopened preview did not render its sort control',
    });
    expect(await (await viewport.getElement()).execute((element) => element.style.transform)).toBe(
      transform,
    );
    await role('button', { name: 'Close preview', exact: true }).click();
    await expect(overlay()).not.toExist();
    for (let step = 0; step < 6; step++) {
      await role('button', { name: 'Zoom out', exact: true }).click();
    }
    await expect(testIds('custom-node-compact-card', {}, graph)).toBeElementsArrayOfSize(2);
    for await (const card of testIds('custom-node-compact-card', {}, graph)) {
      await expect(card.$('.react-flow__handle.target')).toHaveAttribute(
        'class',
        /react-flow__handle-top/,
      );
      await expect(card.$('.react-flow__handle.source')).toHaveAttribute(
        'class',
        /react-flow__handle-bottom/,
      );
    }
    await screenshot(`cards-compact-${theme}.png`);
  });
}
