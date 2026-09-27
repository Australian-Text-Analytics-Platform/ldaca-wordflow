import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { DesktopUpdateSettings } from './DesktopUpdateSettings';
import { getUpdatePreferences, setAutomaticUpdateChecks } from './desktopUpdater';
vi.mock('./desktopUpdater', () => ({
  getUpdatePreferences: vi.fn(),
  setAutomaticUpdateChecks: vi.fn(),
}));
it('reads and updates the shared native updater preference through IPC', async () => {
  vi.mocked(getUpdatePreferences).mockResolvedValue({ automaticChecks: true });
  vi.mocked(setAutomaticUpdateChecks).mockResolvedValue({ automaticChecks: false });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DesktopUpdateSettings />
    </QueryClientProvider>,
  );
  const toggle = await screen.findByRole('switch', { name: 'Automatically check for updates' });
  await waitFor(() => {
    expect(toggle).toBeChecked();
  });
  await userEvent.setup().click(toggle);
  expect(setAutomaticUpdateChecks).toHaveBeenCalledWith(false, expect.anything());
  await waitFor(() => {
    expect(toggle).not.toBeChecked();
  });
});
it('explains disabled updates without offering a preference that could enable them', async () => {
  vi.mocked(getUpdatePreferences).mockResolvedValue(null);
  vi.mocked(setAutomaticUpdateChecks).mockClear();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DesktopUpdateSettings />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Updates are disabled for this build.')).toBeVisible();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(setAutomaticUpdateChecks).not.toHaveBeenCalled();
});
