import { request } from '@/api/client';
import type { components } from '@/api/generated/native';
import { browserCredentials, portalToken, storePortalToken } from '@/features/server/account';
export async function portalInfo(base: string, signal?: AbortSignal) {
  const info = await (await request(base, '/api/portal/credential', 'get', { signal })).json();
  return browserCredentials() ? { ...info, has_credential: !!portalToken() } : info;
}
/** Secret drafts are passed directly, never through TanStack mutation state. */
export async function updatePortal(
  base: string,
  credential: components['schemas']['CredentialUpdate'],
) {
  let token: string | null | undefined;
  if (browserCredentials()) {
    if (credential.action === 'remember' || credential.action === 'session') {
      token = credential.key;
      credential = { action: 'browser' };
    } else if (credential.action === 'remove') token = null;
  }
  await request(base, '/api/portal/credential', 'post', { body: credential });
  if (token !== undefined) storePortalToken(token);
}
