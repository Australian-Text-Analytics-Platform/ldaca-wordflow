/**
 * When the app starts in a browser, and again each day while the page stays
 * open (issue 392), asks the backend whether a newer Wordflow exists and
 * shows a short notice when it does (issue 386). The backend's check is also
 * how often Wordflow starts on Binder, pip and servers, counted by GitHub;
 * nothing else is sent.
 */
import { useEffect } from 'react';
import { toast } from 'sonner';

import { getAppUpdate } from '@/api';
import { isTauri } from '@/lib/isTauri';
import { useUIStore } from '@/stores/uiStore';
import {
  LANDING_PAGE_URL,
  RECHECK_POLL_MS,
  recheckIsDue,
  shouldShowUpdateNotice,
  updateNoticeText,
} from './webUpdateNotice';

const RELEASES_URL =
  'https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/tag/v';

export function useWebUpdateNotice() {
  useEffect(() => {
    if (isTauri() || import.meta.env.DEV) return;
    let cancelled = false;
    let lastCheckedAt = Date.now();
    const check = () =>
      getAppUpdate()
        .then(({ data }) => {
          if (cancelled || !data?.update_available || !data.latest_version) return;
          if (!shouldShowUpdateNotice(data.latest_version)) return;
          const { title, description } = updateNoticeText(data);
          const latest = data.latest_version;
          toast.info(title, {
            description,
            duration: 20_000,
            action:
              data.deployment === 'server'
                ? {
                    label: 'Send feedback',
                    onClick: () => {
                      useUIStore.getState().openFeedback();
                    },
                  }
                : data.deployment === 'binder'
                  ? {
                      label: 'Open the page',
                      onClick: () => window.open(LANDING_PAGE_URL, '_blank', 'noopener'),
                    }
                  : {
                      label: "What's new",
                      onClick: () => window.open(`${RELEASES_URL}${latest}`, '_blank', 'noopener'),
                    },
          });
        })
        .catch(() => undefined);
    const recheckIfDue = () => {
      if (cancelled || document.visibilityState === 'hidden' || !recheckIsDue(lastCheckedAt)) {
        return;
      }
      lastCheckedAt = Date.now();
      void check();
    };
    void check();
    const timer = window.setInterval(recheckIfDue, RECHECK_POLL_MS);
    document.addEventListener('visibilitychange', recheckIfDue);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', recheckIfDue);
    };
  }, []);
}
