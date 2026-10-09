import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vite-plus/test';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/lib/isTauri';
import { FeedbackPanelView } from './FeedbackPanel';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@/lib/isTauri', () => ({ isTauri: vi.fn() }));
const context = {
  app_version: '8.0.0',
  app_build: 'fixture',
  deployment: 'desktop',
  feature: 'Topics',
  user_role: 'anonymous',
  submitted_at: '2026-10-10',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invoke).mockResolvedValue(undefined);
});
it('opens one independent native window under Strict Mode', async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  const close = vi.fn();
  render(
    <StrictMode>
      <FeedbackPanelView context={context} onClose={close} />
    </StrictMode>,
  );
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith('open_feedback', {
    url: expect.stringContaining('feature=Topics'),
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('keeps the server survey in a dialog without native IPC', () => {
  vi.mocked(isTauri).mockReturnValue(false);
  render(<FeedbackPanelView context={context} onClose={vi.fn()} />);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByTitle('Feedback survey')).toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalled();
});
