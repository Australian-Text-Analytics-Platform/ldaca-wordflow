import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/postcss';

const frontendRootDir = path.dirname(fileURLToPath(import.meta.url));

const packageVersion = (() => {
  try {
    const packageJson: unknown = JSON.parse(
      readFileSync(path.join(frontendRootDir, 'package.json'), 'utf-8'),
    ) as unknown;
    return packageJson &&
      typeof packageJson === 'object' &&
      'version' in packageJson &&
      typeof packageJson.version === 'string'
      ? packageJson.version
      : '';
  } catch {
    return '';
  }
})();

const gitShortSha = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: frontendRootDir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
})();

process.env.VITE_APP_VERSION ??= packageVersion;
process.env.VITE_APP_BUILD ??= gitShortSha;
// Build date in DD/MMM/YYYY form — matches the human-readable footer in
// the references panel and lets the markdown there reference
// `{{BUILD_DATE}}` instead of carrying a hand-edited date.
process.env.VITE_APP_BUILD_DATE ??= (() => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[now.getMonth()] ?? 'Jan';
  return `${day}/${month}/${String(now.getFullYear())}`;
})();

export default defineConfig(({ mode }) => {
  if (mode !== 'test') {
    execFileSync(process.execPath, [path.join(frontendRootDir, 'scripts/sync-language-assets.mjs')], { stdio: 'inherit' });
  }
  return ({
  clearScreen: false,
  base: './',
  plugins: [
    process.env.WORDFLOW_E2E_ERRORS === '1' && {
      name: 'browser-error-capture',
      transformIndexHtml() {
        return [{ tag: 'script', attrs: { type: 'module', src: '/e2e-browser/errorBridge.ts' }, injectTo: 'head-prepend' as const }];
      },
    },
    mode === 'e2e' && {
      name: 'native-test-bridge',
      transformIndexHtml: {
        order: 'pre',
        handler() {
          return [{ tag: 'script', attrs: { type: 'module', src: '/e2e-native/setup.ts' }, injectTo: 'head-prepend' as const }];
        },
      },
    },
    react(),
    babel({
      include: /\.[tj]sx?$/,
      presets: [reactCompilerPreset()],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(frontendRootDir, './src'),
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  build: {
    target: 'esnext',
    outDir: 'build',
    rolldownOptions: {
      input: {
        main: path.resolve(frontendRootDir, 'index.html'),
        updater: path.resolve(frontendRootDir, 'updater.html'),
      },
    },
  },
  server: {
    port: mode === 'tauri' ? 3001 : Number(process.env.FRONTEND_PORT ?? 3000),
    host: '127.0.0.1',
    strictPort: true,
    proxy: mode !== 'tauri' ? {
      '/api/ai': `http://127.0.0.1:${process.env.VITE_BACKEND_PORT ?? '8002'}`,
      '/api/project': `http://127.0.0.1:${process.env.VITE_BACKEND_PORT ?? '8002'}`,
      '/health': `http://127.0.0.1:${process.env.VITE_BACKEND_PORT ?? '8002'}`,
    } : undefined,
    watch: {
      ignored: ['**/src-tauri/**', '**/.tmp/**'],
    },
    forwardConsole: {
      unhandledErrors: true,
      logLevels: ['warn', 'error'],
    },
  },
  preview: {
    port: Number(process.env.FRONTEND_PORT ?? 3002),
  },
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**', 'e2e-browser/**', 'e2e-native/**', 'e2e-server/**'],
    setupFiles: ['./src/test/setup.ts'],
  },
  });
});
