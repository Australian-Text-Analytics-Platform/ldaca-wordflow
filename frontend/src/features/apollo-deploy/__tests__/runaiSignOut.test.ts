import type * as GeneratedClient from '@/api/generated/client.gen';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/authStore';
import { fetchRunaiSignOutUrl, runaiNavigation } from '../runaiSignOut';

const mocks = vi.hoisted(() => ({
  clientGet: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/api/generated/client.gen', async (importOriginal) => {
  const original: typeof GeneratedClient = await importOriginal();
  return { ...original, client: { ...original.client, get: mocks.clientGet } };
});
vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteSession: mocks.deleteSession,
  getSession: mocks.getSession,
}));

const SIGN_OUT = '/oauth2/sign_out?rd=https%3A%2F%2Fwordflow.example%2F';

describe('Run:ai sign-out (apollo-deploy)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteSession.mockResolvedValue({ data: undefined });
    mocks.getSession.mockResolvedValue({
      data: {
        mode: 'multi_user',
        authenticated: false,
        user: null,
        providers: [],
        csrf_token: null,
      },
    });
  });

  it('returns the sidecar sign-out address under Run:ai sign-in', async () => {
    mocks.clientGet.mockResolvedValue({ data: { runai_proxy: true, sign_out_url: SIGN_OUT } });
    await expect(fetchRunaiSignOutUrl()).resolves.toBe(SIGN_OUT);
  });

  it('returns null without Run:ai sign-in or when the server has no Apollo route', async () => {
    mocks.clientGet.mockResolvedValueOnce({ data: { runai_proxy: false, sign_out_url: null } });
    await expect(fetchRunaiSignOutUrl()).resolves.toBeNull();
    mocks.clientGet.mockRejectedValueOnce(new Error('404'));
    await expect(fetchRunaiSignOutUrl()).resolves.toBeNull();
  });

  it('logout ends the Wordflow session, then leaves for the sidecar sign-out', async () => {
    mocks.clientGet.mockResolvedValue({ data: { runai_proxy: true, sign_out_url: SIGN_OUT } });
    const leave = vi.spyOn(runaiNavigation, 'leave').mockImplementation(() => undefined);
    await useAuthStore.getState().logout();
    expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
    expect(leave).toHaveBeenCalledWith(SIGN_OUT);
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('logout keeps the upstream behaviour without Run:ai sign-in', async () => {
    mocks.clientGet.mockResolvedValue({ data: { runai_proxy: false, sign_out_url: null } });
    const leave = vi.spyOn(runaiNavigation, 'leave').mockImplementation(() => undefined);
    await useAuthStore.getState().logout();
    expect(mocks.deleteSession).toHaveBeenCalledTimes(1);
    expect(leave).not.toHaveBeenCalled();
    expect(mocks.getSession).toHaveBeenCalled();
  });
});
