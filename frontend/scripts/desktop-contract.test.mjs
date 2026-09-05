import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const frontendRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(frontendRoot, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('desktop configuration contracts', () => {
  it('uses the Wordflow application identifier', () => {
    const tauri = JSON.parse(read('frontend/src-tauri/tauri.conf.json'));

    expect(tauri.identifier).toBe('au.edu.ldaca.wordflow');
  });

  it('configures updater artifacts and isolates window permissions', () => {
    const tauri = JSON.parse(read('frontend/src-tauri/tauri.conf.json'));
    const capability = JSON.parse(read('frontend/src-tauri/capabilities/default.json'));
    const updaterCapability = JSON.parse(read('frontend/src-tauri/capabilities/updater.json'));

    expect(tauri.bundle.createUpdaterArtifacts).toBe(true);
    expect(tauri.plugins.updater.endpoints).toEqual([
      'https://github.com/Australian-Text-Analytics-Platform/ldaca-wordflow/releases/latest/download/latest.json',
    ]);
    expect(capability.permissions).not.toContain('updater:default');
    expect(capability.permissions).not.toContain('process:allow-restart');
    expect(capability.windows).toEqual(['main']);
    expect(updaterCapability.windows).toEqual(['updater']);
    expect(updaterCapability.permissions).toEqual(['core:default']);
  });

  it('enables Liquid Glass only for the transparent macOS main window', () => {
    const tauri = JSON.parse(read('frontend/src-tauri/tauri.conf.json'));
    const macOS = JSON.parse(read('frontend/src-tauri/tauri.macos.conf.json'));
    const liquidGlassCapability = JSON.parse(
      read('frontend/src-tauri/capabilities/liquid-glass.json'),
    );
    const updaterCapability = JSON.parse(read('frontend/src-tauri/capabilities/updater.json'));
    const [baseMainWindow] = tauri.app.windows;

    expect(tauri.app.macOSPrivateApi).toBe(true);
    expect(macOS.app.windows).toEqual([{ ...baseMainWindow, transparent: true }]);
    expect(liquidGlassCapability).toMatchObject({
      windows: ['main'],
      platforms: ['macOS'],
      permissions: ['liquid-glass:default'],
    });
    expect(updaterCapability.permissions).not.toContain('liquid-glass:default');
  });

  it('uses least-privilege desktop capabilities and a production-only strict CSP', () => {
    const tauri = JSON.parse(read('frontend/src-tauri/tauri.conf.json'));
    const capability = JSON.parse(read('frontend/src-tauri/capabilities/default.json'));

    expect(capability.permissions).toEqual([
      'core:default',
      'core:window:allow-start-dragging',
      'core:webview:allow-set-webview-zoom',
      'opener:allow-reveal-item-in-dir',
      'dialog:allow-open',
    ]);
    expect(tauri.app.security.csp).not.toContain("'unsafe-eval'");
    expect(tauri.app.security.csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(tauri.app.security.devCsp).toContain("'unsafe-eval'");
    expect(tauri.app.security.devCsp).toContain('ws://127.0.0.1:3001');
  });

  it('uses one explicit runtime for development and one bundled runtime for packaging', () => {
    const tauri = JSON.parse(read('frontend/src-tauri/tauri.conf.json'));
    const bundleConfig = JSON.parse(read('frontend/src-tauri/tauri.bundle.conf.json'));

    expect(tauri.build.beforeBuildCommand).toContain('stage-backend-runtime.mjs --validate-only');
    expect(tauri.bundle).not.toHaveProperty('resources');
    expect(bundleConfig).toEqual({ bundle: { resources: ['backend-runtime'] } });
  });
});
