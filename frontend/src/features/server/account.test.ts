import { afterEach, expect, it, vi } from 'vite-plus/test';
import {
  currentAccount,
  providerKey,
  setAccount,
  storeProviderKey,
  transportHeaders,
} from './account';
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const connection = '33333333-3333-4333-8333-333333333333';
afterEach(() => {
  setAccount(null);
  localStorage.clear();
  vi.restoreAllMocks();
});
it('partitions browser keys by immutable account and clears active access on logout', () => {
  setAccount({ id: a, name: 'Shared name', browser_credentials: true });
  storeProviderKey(connection, 'account-a-key');
  setAccount({ id: b, name: 'Shared name', browser_credentials: true });
  expect(providerKey(connection)).toBeUndefined();
  storeProviderKey(connection, 'account-b-key');
  setAccount(null);
  expect(providerKey(connection)).toBeUndefined();
  expect(transportHeaders('POST', { inference: { provider: connection } })).toEqual({});
  setAccount({ id: a, name: null, browser_credentials: true });
  expect(providerKey(connection)).toBe('account-a-key');
  storeProviderKey(connection, null);
  expect(providerKey(connection)).toBeUndefined();
});
it('supplies credentials only in operation headers and preserves the stored request', () => {
  setAccount({ id: a, name: null, browser_credentials: true });
  storeProviderKey(connection, 'test-operation-key');
  document.cookie = 'wordflow_csrf=test-csrf; path=/';
  const body = { request: { inference: { provider: connection, model: 'model' } } };
  const before = JSON.stringify(body);
  expect(transportHeaders('POST', body)).toEqual({
    'x-wordflow-csrf': 'test-csrf',
    'x-wordflow-ai-provider': connection,
    'x-wordflow-ai-key': 'test-operation-key',
  });
  expect(JSON.stringify(body)).toBe(before);
  expect(transportHeaders('GET')).toEqual({});
});
it('reports invalid storage without replacing it', () => {
  setAccount({ id: a, name: null, browser_credentials: true });
  const key = `wordflow-provider-credentials:v1:${a}`;
  localStorage.setItem(key, '{invalid');
  expect(() => providerKey(connection)).toThrow();
  expect(localStorage.getItem(key)).toBe('{invalid');
});
it('clears another window of the signed-out account while retaining partitioned browser keys', () => {
  setAccount({ id: a, name: null, browser_credentials: true });
  storeProviderKey(connection, 'account-a-key');
  const expired = vi.fn();
  window.addEventListener('wordflow-account-expired', expired);
  try {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'wordflow-account-logout:v1',
        newValue: JSON.stringify({ id: b, nonce: 'other-account' }),
      }),
    );
    expect(currentAccount()?.id).toBe(a);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'wordflow-account-logout:v1',
        newValue: JSON.stringify({ id: a, nonce: 'same-account' }),
      }),
    );
    expect(currentAccount()).toBeNull();
    expect(providerKey(connection)).toBeUndefined();
    expect(expired).toHaveBeenCalledOnce();
    setAccount({ id: a, name: null, browser_credentials: true });
    expect(providerKey(connection)).toBe('account-a-key');
  } finally {
    window.removeEventListener('wordflow-account-expired', expired);
  }
});
