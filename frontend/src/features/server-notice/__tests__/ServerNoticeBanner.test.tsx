import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerNoticeBanner } from '../ServerNoticeBanner';

const api = vi.hoisted(() => ({
  getServerNotice: vi.fn(),
  acknowledgeServerNotice: vi.fn(),
}));
vi.mock('@/api', () => api);
vi.mock('@/features/auth/hooks/useAuth', () => ({ useAuth: () => ({ isAuthenticated: true }) }));

const notice = (id: string, text: string, acknowledged = false) => ({
  data: { notice: { id, text }, acknowledged },
});

const renderBanner = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ServerNoticeBanner />
    </QueryClientProvider>,
  );

describe('ServerNoticeBanner (issue 438)', () => {
  beforeEach(() => {
    api.getServerNotice.mockReset();
    api.acknowledgeServerNotice.mockReset();
  });

  it('shows the Markdown notice and records Got it on the server', async () => {
    api.getServerNotice.mockResolvedValue(
      notice('aaaa', '**Shared service.** See [the policy](https://example.org/p) and <b>x</b>.'),
    );
    api.acknowledgeServerNotice.mockResolvedValue(notice('aaaa', 'Shared service.', true));
    renderBanner();
    const region = await screen.findByRole('region', { name: 'Notice from this server' });
    expect(screen.getByText('Shared service.').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: 'the policy' })).toHaveAttribute('target', '_blank');
    expect(region).not.toContainHTML('<b>');

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => {
      expect(screen.queryByTestId('server-notice')).not.toBeInTheDocument();
    });
    expect(api.acknowledgeServerNotice).toHaveBeenCalledWith(
      expect.objectContaining({ path: { notice_id: 'aaaa' } }),
    );
  });

  it('shows nothing when acknowledged or when there is no notice', async () => {
    api.getServerNotice.mockResolvedValue(notice('aaaa', 'Seen before', true));
    const view = renderBanner();
    await waitFor(() => {
      expect(api.getServerNotice).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('server-notice')).not.toBeInTheDocument();
    view.unmount();

    api.getServerNotice.mockResolvedValue({ data: { notice: null, acknowledged: false } });
    renderBanner();
    await waitFor(() => {
      expect(api.getServerNotice).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByTestId('server-notice')).not.toBeInTheDocument();
  });
});
