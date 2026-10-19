import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteSession: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteSession: mocks.deleteSession,
  getSession: mocks.getSession,
}));

import { authNavigation, useAuthStore } from '../authStore';

const session = (signOutUrl: string | null) => ({
  mode: 'multi_user' as const,
  authenticated: true,
  user: { id: 'u', email: 'a@uni.edu', name: 'A' },
  providers: [],
  csrf_token: 'csrf',
  sign_out_url: signOutUrl,
});

describe('signing out behind a sign-in proxy (issue 411)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteSession.mockResolvedValue({ data: undefined });
    mocks.getSession.mockResolvedValue({ data: { ...session(null), authenticated: false } });
  });

  it('ends the Wordflow session, then sends the browser to the proxy sign-out', async () => {
    const leave = vi.spyOn(authNavigation, 'leave').mockImplementation(() => undefined);
    useAuthStore.setState({ session: session('/oauth2/sign_out?rd=https%3A%2F%2Fhost%2F') });

    await useAuthStore.getState().logout();

    expect(mocks.deleteSession).toHaveBeenCalledOnce();
    expect(leave).toHaveBeenCalledWith('/oauth2/sign_out?rd=https%3A%2F%2Fhost%2F');
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it('signs out as before without a proxy', async () => {
    const leave = vi.spyOn(authNavigation, 'leave').mockImplementation(() => undefined);
    useAuthStore.setState({ session: session(null) });

    await useAuthStore.getState().logout();

    expect(leave).not.toHaveBeenCalled();
    expect(mocks.getSession).toHaveBeenCalled();
  });
});
