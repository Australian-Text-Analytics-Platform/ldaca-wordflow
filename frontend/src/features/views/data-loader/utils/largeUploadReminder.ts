import { isTauri } from '@/lib/isTauri';

/**
 * Uploads larger than this on a shared server get a reminder first (issue 260,
 * decided by Chao 2026-10-02 instead of a fixed upload limit).
 */
export const LARGE_UPLOAD_REMINDER_BYTES = 50 * 1024 * 1024;

/** The Wordflow desktop app's download page. */
export const DESKTOP_APP_URL = 'https://sih.tools/wordflow';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * True in a browser using a remote Wordflow server (a hosted server, the dev
 * server, Binder): resources there are shared and modest. False in the desktop
 * app and for a local run, where the files stay on the user's own computer.
 */
export function isSharedServer(
  location: Pick<Location, 'hostname' | 'protocol'> = window.location,
): boolean {
  if (isTauri(location)) return false;
  return !LOOPBACK_HOSTS.has(location.hostname);
}

export const needsLargeUploadReminder = (
  totalBytes: number,
  location?: Pick<Location, 'hostname' | 'protocol'>,
): boolean => totalBytes > LARGE_UPLOAD_REMINDER_BYTES && isSharedServer(location);
