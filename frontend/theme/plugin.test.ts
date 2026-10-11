import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, createServer } from 'vite';
import { describe, expect, it, vi } from 'vite-plus/test';
import { wordflowTheme } from './plugin';

const manifest = {
  source: { version: 'test', commit: 'fixture' },
  metrics: { 'spacing.base': '4px' },
  themes: {
    'light-2026': { 'surface.background': '#fafafa' },
    'dark-2026': { 'surface.background': '#202020' },
  },
};

describe('on-demand theme CSS', () => {
  it('bundles both themes directly from the JSON source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wordflow-theme-build-'));
    try {
      const manifestPath = join(root, 'theme.json');
      await writeFile(manifestPath, JSON.stringify(manifest));
      await writeFile(join(root, 'index.html'), '<script type="module" src="/main.js"></script>');
      await writeFile(join(root, 'main.js'), "import 'virtual:wordflow-theme.css';");
      const result = await build({
        configFile: false,
        root,
        plugins: [wordflowTheme(manifestPath)],
        logLevel: 'silent',
        build: { write: false, cssMinify: false },
      });
      const outputs = (Array.isArray(result) ? result : [result]).flatMap((bundle) =>
        'output' in bundle ? bundle.output : [],
      );
      const css = outputs.find((output) => output.type === 'asset' && output.fileName.endsWith('.css'));
      const source = css?.type === 'asset' ? css.source : undefined;
      expect(source).toContain('--vscode-spacing-base: 4px');
      expect(source).toContain('--vscode-surface-background: #fafafa');
      expect(source).toContain('--vscode-surface-background: #202020');
      expect(source).toContain('[data-theme="dark-2026"]');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('updates CSS after a manifest edit without reloading the workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'wordflow-theme-dev-'));
    const manifestPath = join(root, 'theme.json');
    await writeFile(manifestPath, JSON.stringify(manifest));
    const server = await createServer({
      configFile: false,
      root,
      plugins: [wordflowTheme(manifestPath)],
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false, watch: { usePolling: true, interval: 20 } },
    });
    try {
      const url = 'virtual:wordflow-theme.css';
      expect((await server.transformRequest(url))?.code).toContain('#fafafa');
      const send = vi.spyOn(server.environments.client.hot, 'send');
      await vi.waitFor(() => expect(server.watcher.getWatched()[root]).toContain('theme.json'));
      await writeFile(
        manifestPath,
        JSON.stringify({
          ...manifest,
          themes: { ...manifest.themes, 'light-2026': { 'surface.background': '#abcdef' } },
        }),
      );
      await vi.waitFor(() =>
        expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'update' })),
      );
      expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'full-reload' }));
      expect((await server.transformRequest(url))?.code).toContain('#abcdef');
    } finally {
      await server.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
