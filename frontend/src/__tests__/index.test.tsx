import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createRoot, installExternalFileDropGuard, render, isTauri, loadBrowser, loadDesktop } =
  vi.hoisted(() => ({
    createRoot: vi.fn(),
    installExternalFileDropGuard: vi.fn(),
    render: vi.fn(),
    isTauri: vi.fn(),
    loadBrowser: vi.fn(),
    loadDesktop: vi.fn(),
  }));

vi.mock('../lib/isTauri', () => ({ isTauri }));

vi.mock('react-dom/client', () => ({
  createRoot,
}));
vi.mock('../lib/externalFileDropGuard', () => ({
  installExternalFileDropGuard,
}));
describe('application entrypoint', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
    isTauri.mockReturnValue(false);
    vi.doMock('../router', () => {
      loadBrowser();
      return { router: {} };
    });
    vi.doMock('../features/desktop/DesktopApp', () => {
      loadDesktop();
      return { default: () => null };
    });
    createRoot.mockReturnValue({ render });
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('installs the external file drop guard during bootstrap', async () => {
    await import('../index');

    expect(installExternalFileDropGuard).toHaveBeenCalledOnce();
    expect(installExternalFileDropGuard).toHaveBeenCalledWith(window);
    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
  });

  it.each([
    ['development', false, ''],
    ['production', false, ''],
    ['tauri', true, undefined],
    ['production', true, undefined],
  ])(
    'loads the project app in %s (Tauri: %s) without retired server providers',
    async (mode, native, backendUrl) => {
      vi.stubEnv('MODE', mode);
      isTauri.mockReturnValue(native);
      await import('../index');
      await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
      expect(loadDesktop).toHaveBeenCalledOnce();
      expect(loadBrowser).not.toHaveBeenCalled();
      expect(render).toHaveBeenCalledWith(
        expect.objectContaining({
          props: expect.objectContaining({
            children: expect.objectContaining({ props: { backendUrl } }),
          }),
        }),
      );
    },
  );
});
