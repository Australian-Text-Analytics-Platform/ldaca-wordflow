import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { client } from '@/api/generated/client.gen';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}));

vi.mock('@/config/env', () => ({
  BACKEND_API_BASE: '',
  BACKEND_PORT: '',
}));

import { resolveBackendConnection } from './backendConnection';

describe('resolveBackendConnection', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
  });

  afterEach(() => {
    delete window.__WORDFLOW_CONFIG__;
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  });

  it('uses hosted browser runtime configuration without calling Tauri', async () => {
    window.__WORDFLOW_CONFIG__ = { basePath: '/user/example/proxy/3000' };

    const connection = await resolveBackendConnection();

    expect(connection).toEqual({
      apiBaseUrl: `${window.location.origin}/user/example/proxy/3000/api`,
      clientBaseUrl: `${window.location.origin}/user/example/proxy/3000`,
      liveUrl: `${window.location.origin}/user/example/proxy/3000/health/live`,
      readyUrl: `${window.location.origin}/user/example/proxy/3000/health/ready`,
      dataRootUrl: `${window.location.origin}/user/example/proxy/3000/api/data-root`,
    });
    expect(client.getConfig().baseUrl).toBe(`${window.location.origin}/user/example/proxy/3000`);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
