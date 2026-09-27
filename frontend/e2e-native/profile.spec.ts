import { browser, expect } from '@wdio/globals';
import { describe, it } from 'mocha';

describe('Native per-run browser profile', () => {
  it('starts independently and retains the run sentinel across reload', async () => {
    const key = 'wordflow.e2e.profile-sentinel';
    expect(await browser.execute((key) => localStorage.getItem(key), key)).toBeNull();
    await browser.execute((key) => {
      localStorage.setItem(key, 'this-run-only');
    }, key);
    await browser.refresh();
    expect(await browser.execute((key) => localStorage.getItem(key), key)).toBe('this-run-only');
    // Deliberately leave this test-owned marker: running the spec in the next
    // process must still start empty, rather than passing through manual reset.
  });
});
