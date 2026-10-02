import { describe, expect, it } from 'vitest';
import {
  LARGE_UPLOAD_REMINDER_BYTES,
  isSharedServer,
  needsLargeUploadReminder,
} from '../largeUploadReminder';

const at = (hostname: string, protocol = 'https:') => ({ hostname, protocol });

describe('large upload reminder (issue 260)', () => {
  it('applies to a browser on a remote server only', () => {
    expect(isSharedServer(at('wordflow.ldaca.edu.au'))).toBe(true);
    expect(isSharedServer(at('vm-203-101-239-71.qld.nectar.org.au'))).toBe(true);
    expect(isSharedServer(at('localhost', 'http:'))).toBe(false);
    expect(isSharedServer(at('127.0.0.1', 'http:'))).toBe(false);
    expect(isSharedServer(at('tauri.localhost'))).toBe(false);
    expect(isSharedServer(at('', 'tauri:'))).toBe(false);
  });

  it('starts above 50 MB', () => {
    const remote = at('wordflow.ldaca.edu.au');
    expect(needsLargeUploadReminder(LARGE_UPLOAD_REMINDER_BYTES, remote)).toBe(false);
    expect(needsLargeUploadReminder(LARGE_UPLOAD_REMINDER_BYTES + 1, remote)).toBe(true);
    expect(needsLargeUploadReminder(680 * 1024 * 1024, at('localhost', 'http:'))).toBe(false);
  });
});
