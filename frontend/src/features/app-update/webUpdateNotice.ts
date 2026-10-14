/**
 * The new-version notice for Wordflow in a browser: Binder, pip and a hosted
 * server (Chao, issue 386). The desktop app has its own update window.
 */
import type { AppUpdateResource } from '@/api';

export const LANDING_PAGE_URL =
  'https://australian-text-analytics-platform.github.io/LDaCa_Text_Analytics_Tools/';
const NOTICE_KEY = 'wordflow.updateNotice';
/** The same version is mentioned again after a day. */
const REMIND_AFTER_MS = 24 * 60 * 60 * 1000;
/** A page left open asks again once a day has passed (issue 392). */
const RECHECK_AFTER_MS = 24 * 60 * 60 * 1000;
/** How often an open page looks at the clock; wall-clock time, so sleep is caught up. */
export const RECHECK_POLL_MS = 60 * 60 * 1000;

/** Whether a page left open should ask for a newer version again. */
export const recheckIsDue = (lastCheckedAt: number, now = Date.now()): boolean =>
  now - lastCheckedAt >= RECHECK_AFTER_MS;

export interface UpdateNoticeText {
  title: string;
  description: string;
}

/** What to say for each way of running Wordflow. */
export function updateNoticeText(update: AppUpdateResource): UpdateNoticeText {
  const latest = update.latest_version ?? '';
  const current = update.current_version;
  const title = `Wordflow ${latest} is available`;
  switch (update.deployment) {
    case 'binder':
      return {
        title,
        description: `You're using ${current}. Open Wordflow again from the LDaCA Text Analytics Tools page to use the latest version.`,
      };
    case 'server':
      return {
        title,
        description: `This server runs ${current}. Ask for an upgrade with Feedback, or use the desktop app or Binder for the latest version.`,
      };
    default:
      return {
        title,
        description: `You're using ${current}. Update with: uvx --refresh ldaca-wordflow@latest (or pip install -U ldaca-wordflow), then start Wordflow again.`,
      };
  }
}

/** Whether to show the notice now; records that it was shown. */
export function shouldShowUpdateNotice(latest: string, now = Date.now()): boolean {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTICE_KEY) ?? 'null') as {
      version?: unknown;
      shownAt?: unknown;
    } | null;
    if (
      saved?.version === latest &&
      typeof saved.shownAt === 'number' &&
      now - saved.shownAt < REMIND_AFTER_MS
    ) {
      return false;
    }
    localStorage.setItem(NOTICE_KEY, JSON.stringify({ version: latest, shownAt: now }));
  } catch {
    // Storage blocked: show it, it costs nothing.
  }
  return true;
}
