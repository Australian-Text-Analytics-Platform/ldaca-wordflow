import { expect, it, vi } from 'vite-plus/test';

it('supports unauthenticated API calls without a browser window', async () => {
  vi.stubGlobal('window', undefined);
  vi.resetModules();
  try {
    const { currentAccount, transportHeaders } = await import('./account');
    expect(currentAccount()).toBeNull();
    expect(transportHeaders('POST', { name: null })).toEqual({});
  } finally {
    vi.unstubAllGlobals();
  }
});
