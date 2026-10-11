import { afterEach, expect, it, vi } from 'vite-plus/test';
import { portalInfo, updatePortal } from './portalApi';
import {
  portalToken,
  portalOperationHeaders,
  setAccount,
  storePortalToken,
  providerKey,
  storeProviderKey,
} from '@/features/server/account';
import { request } from '@/api/client';
vi.mock('@/api/client', () => ({ request: vi.fn() }));
const connection = '33333333-3333-4333-8333-333333333333';
afterEach(() => {
  setAccount(null);
  localStorage.clear();
  vi.clearAllMocks();
});
it('stores browser Portal credentials separately per account without sending secrets to management endpoints', async () => {
  vi.mocked(request).mockResolvedValue({
    json: async () => ({
      has_credential: false,
      credential_mode: 'browser',
      credential_error: null,
    }),
  } as never);
  setAccount({ id: 'alice', name: null, browser_credentials: true });
  storeProviderKey(connection, 'synthetic-ai');
  await updatePortal('/prefix', { action: 'remember', key: 'synthetic-alice' });
  expect(request).toHaveBeenLastCalledWith('/prefix', '/api/portal/credential', 'post', {
    body: { action: 'browser' },
  });
  expect((await portalInfo('/prefix')).has_credential).toBe(true);
  expect(providerKey(connection)).toBe('synthetic-ai');
  expect(portalOperationHeaders('/api/project/ldaca/search')).toEqual({
    'x-wordflow-portal-token': 'synthetic-alice',
  });
  expect(portalOperationHeaders('/api/project')).toEqual({});
  setAccount({ id: 'bob', name: null, browser_credentials: true });
  expect(portalToken()).toBeUndefined();
  await updatePortal('/prefix', { action: 'session', key: 'synthetic-bob' });
  setAccount({ id: 'alice', name: null, browser_credentials: true });
  expect(portalToken()).toBe('synthetic-alice');
  await updatePortal('/prefix', { action: 'remember', key: 'synthetic-replacement' });
  expect(portalToken()).toBe('synthetic-replacement');
  await updatePortal('/prefix', { action: 'remove' });
  expect(portalToken()).toBeUndefined();
  expect(providerKey(connection)).toBe('synthetic-ai');
  setAccount(null);
  expect(portalOperationHeaders('/api/project/ldaca/import')).toEqual({});
});
it('keeps failed updates and malformed browser storage untouched and reports no secret bytes', async () => {
  setAccount({ id: 'alice', name: null, browser_credentials: true });
  storePortalToken('synthetic-existing');
  vi.mocked(request).mockRejectedValueOnce(new Error('OS credential store unavailable'));
  await expect(
    updatePortal('/prefix', { action: 'remember', key: 'synthetic-failed' }),
  ).rejects.toThrow('OS credential store unavailable');
  expect(portalToken()).toBe('synthetic-existing');
  localStorage.setItem('wordflow-portal-credential:v1:alice', '{synthetic-invalid');
  expect(() => portalToken()).toThrow('Invalid browser Portal credential storage');
  expect(localStorage.getItem('wordflow-portal-credential:v1:alice')).toBe('{synthetic-invalid');
});
