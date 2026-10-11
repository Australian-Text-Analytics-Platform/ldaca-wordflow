import type { components } from '@/api/generated/native';

export type Account = components['schemas']['Account'];
let account: Account | null = null;
const logoutSignal = 'wordflow-account-logout:v1';
globalThis.window?.addEventListener('storage', (event) => {
  if (event.key !== logoutSignal || !event.newValue || !account?.browser_credentials) return;
  let id: unknown;
  try {
    id = (JSON.parse(event.newValue) as { id?: unknown }).id;
  } catch {
    return;
  }
  if (id === account.id) {
    account = null;
    window.dispatchEvent(new Event('wordflow-account-expired'));
  }
});
export function setAccount(next: Account | null) {
  const previous = account;
  account = next;
  if (!next && previous?.browser_credentials) {
    try {
      localStorage.setItem(
        logoutSignal,
        JSON.stringify({ id: previous.id, nonce: crypto.randomUUID() }),
      );
    } catch {
      /* Session revocation still clears this window when browser storage is unavailable. */
    }
  }
}
export function expireAccount() {
  setAccount(null);
  window.dispatchEvent(new Event('wordflow-account-expired'));
}
export function currentAccount() {
  return account;
}
export function browserCredentials() {
  return account?.browser_credentials ?? false;
}
function storageKey() {
  if (!account?.browser_credentials)
    throw new Error('Browser credentials require an authenticated account');
  return `wordflow-provider-credentials:v1:${account.id}`;
}
function storedKeys(): Record<string, string> {
  const value: unknown = JSON.parse(
    localStorage.getItem(storageKey()) ?? '{"version":1,"connections":{}}',
  );
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('connections' in value) ||
    !value.connections ||
    typeof value.connections !== 'object' ||
    Array.isArray(value.connections)
  )
    throw new Error('Invalid browser credential storage');
  const entries = Object.entries(value.connections);
  if (entries.some(([id, key]) => !/^[0-9a-f-]{36}$/.test(id) || typeof key !== 'string'))
    throw new Error('Invalid browser credential storage');
  return Object.fromEntries(entries) as Record<string, string>;
}
export function providerKey(id: string): string | undefined {
  return browserCredentials() ? storedKeys()[id] : undefined;
}
export function storeProviderKey(id: string, key: string | null) {
  const connections = storedKeys();
  if (key === null) delete connections[id];
  else connections[id] = key;
  localStorage.setItem(storageKey(), JSON.stringify({ version: 1, connections }));
}
export function transportHeaders(
  method: string,
  body?: unknown,
  provider?: string,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!account?.browser_credentials) return headers;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    const csrf = document.cookie
      .split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('wordflow_csrf='))
      ?.slice('wordflow_csrf='.length);
    if (csrf) headers['x-wordflow-csrf'] = csrf;
  }
  // Keys are operation headers. They never become stored request bodies or query keys.
  if (!provider && body && typeof body === 'object') {
    const input =
      'request' in body && body.request && typeof body.request === 'object' ? body.request : body;
    if (
      'inference' in input &&
      input.inference &&
      typeof input.inference === 'object' &&
      'provider' in input.inference &&
      typeof input.inference.provider === 'string'
    )
      provider = input.inference.provider;
  }
  const key = provider ? providerKey(provider) : undefined;
  if (provider && key) {
    headers['x-wordflow-ai-provider'] = provider;
    headers['x-wordflow-ai-key'] = key;
  }
  return headers;
}

function portalStorageKey() {
  if (!account?.browser_credentials)
    throw new Error('Browser credentials require an authenticated account');
  return `wordflow-portal-credential:v1:${account.id}`;
}
export function portalToken(): string | undefined {
  if (!browserCredentials()) return undefined;
  const raw = localStorage.getItem(portalStorageKey());
  if (!raw) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Invalid browser Portal credential storage');
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('token' in value) ||
    typeof value.token !== 'string'
  )
    throw new Error('Invalid browser Portal credential storage');
  return value.token;
}
export function storePortalToken(token: string | null) {
  if (token === null) localStorage.removeItem(portalStorageKey());
  else localStorage.setItem(portalStorageKey(), JSON.stringify({ version: 1, token }));
}
export function portalOperationHeaders(path: string): Record<string, string> {
  if (!/^\/api\/project\/ldaca\/(search|import)$/.test(path)) return {};
  const token = portalToken();
  return token ? { 'x-wordflow-portal-token': token } : {};
}
