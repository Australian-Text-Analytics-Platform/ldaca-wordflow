import { beforeEach, describe, expect, it } from 'vitest';
import { shouldShowUpdateNotice, updateNoticeText } from '../webUpdateNotice';

const update = (deployment: 'binder' | 'server' | 'pip') => ({
  deployment,
  current_version: '0.7.13',
  latest_version: '0.7.14',
  update_available: true,
});

describe('web new-version notice (issue 386)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('tells each kind of Wordflow how to get the new version', () => {
    expect(updateNoticeText(update('binder')).description).toContain(
      'Open Wordflow again from the LDaCA Text Analytics Tools page',
    );
    expect(updateNoticeText(update('server')).description).toContain(
      'This server runs 0.7.13. Ask for an upgrade with Feedback',
    );
    expect(updateNoticeText(update('pip')).description).toContain(
      'uvx --refresh ldaca-wordflow@latest',
    );
    expect(updateNoticeText(update('pip')).title).toBe('Wordflow 0.7.14 is available');
  });

  it('mentions a version once a day, and a newer one straight away', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(shouldShowUpdateNotice('0.7.14', 1_000)).toBe(true);
    expect(shouldShowUpdateNotice('0.7.14', 2_000)).toBe(false);
    expect(shouldShowUpdateNotice('0.7.15', 3_000)).toBe(true);
    expect(shouldShowUpdateNotice('0.7.15', 3_000 + day)).toBe(true);
  });
});
