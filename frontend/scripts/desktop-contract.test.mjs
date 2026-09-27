import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nativeTestBuild } from './native-e2e.mjs';

const frontendRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(frontendRoot, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('desktop configuration contracts', () => {
  it('uses the Wordflow application identifier', () => {
    const tauri = JSON.parse(read('frontend/src-tauri/tauri.conf.json'));

    expect(tauri.identifier).toBe('au.edu.ldaca.wordflow');
  });

  it('isolates Dev while retaining production identity for local QA bundles', () => {
    const dev = JSON.parse(read('frontend/src-tauri/tauri.dev.conf.json'));
    const localBuild = JSON.parse(read('frontend/src-tauri/tauri.local-build.conf.json'));
    const scripts = JSON.parse(read('frontend/package.json')).scripts;

    expect(dev.identifier).toBe('au.edu.ldaca.wordflow.dev');
    expect(dev.productName).toBe('LDaCA Wordflow Dev');
    expect(dev.plugins.updater.endpoints).toEqual([]);
    expect(dev.bundle.createUpdaterArtifacts).toBe(false);
    expect(dev.bundle.fileAssociations).toEqual([]);
    expect(dev.build.beforeBundleCommand).toBeNull();
    expect(dev.bundle.macOS.files).toBeNull();
    // Do not replace the windows array: it would discard native document settings.
    expect(dev.app?.windows).toBeUndefined();
    expect(localBuild.identifier).toBeUndefined();
    expect(scripts['dev:desktop']).toBe('tauri dev --config src-tauri/tauri.dev.conf.json');
    expect(scripts['build:desktop:mac']).not.toContain('tauri.dev.conf.json');
    expect(scripts['build:desktop:windows']).not.toContain('tauri.dev.conf.json');
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
    expect(capability.windows).toEqual(['project-*']);
    expect(updaterCapability.windows).toEqual(['updater']);
    expect(updaterCapability.permissions).toEqual(['core:default']);
  });

  it('keeps embedded automation opt-in and outside normal application builds', () => {
    const cargo = read('frontend/src-tauri/Cargo.toml');
    const source = read('frontend/src-tauri/src/lib.rs');
    const config = JSON.parse(read('frontend/src-tauri/tauri.e2e.conf.json'));
    const scripts = JSON.parse(read('frontend/package.json')).scripts;

    expect(cargo).toMatch(/tauri-plugin-wdio-webdriver = \{[^\n]*optional = true/);
    expect(source).toMatch(/#\[cfg\(feature = "e2e"\)\]\s*let builder = builder\s*\.plugin\(tauri_plugin_wdio_webdriver::init\(\)\)/);
    expect(config.identifier).toBeUndefined();
    expect(config.app.withGlobalTauri).toBe(true);
    expect(config.plugins.updater.endpoints).toEqual([]);
    expect(scripts['build:e2e:native']).toBe('node scripts/native-e2e.mjs build debug');
    expect(config.build.beforeBuildCommand).not.toContain('prepare-icu');
    expect(config.build.frontendDist).toBe('../.tmp/e2e-build');
    for (const name of ['dev:desktop', 'tauri:build', 'build:desktop:mac', 'build:desktop:windows', 'build:qa:mac']) {
      expect(scripts[name]).not.toContain('--features');
      expect(scripts[name]).not.toContain('tauri.e2e.conf.json');
    }
  });

  it('separates optimized instrumented builds from clean release outputs', () => {
    for (const platform of ['darwin', 'win32']) {
      const debug = nativeTestBuild('debug', platform);
      const release = nativeTestBuild('release', platform);
      expect(debug.args).toContain('--debug');
      expect(release.args).not.toContain('--debug');
      expect(release.args).toContain('e2e');
      expect(release.args.at(-1)).toBe('--locked');
      expect(release.target).not.toBe(debug.target);
      expect(release.output).not.toBe(debug.output);
      expect(release.binary).toContain('e2e-release');
      expect(release.binary).toContain(platform === 'darwin' ? '.app/Contents/MacOS/' : '.exe');
    }
    expect(() => nativeTestBuild('production')).toThrow('Unknown native test profile');
    expect(() => nativeTestBuild('release', 'linux')).toThrow('not configured');
    const scripts = JSON.parse(read('frontend/package.json')).scripts;
    expect(scripts['build:qa:mac']).not.toContain('--debug');
    expect(scripts['build:qa:mac']).toContain('--locked');
  });

  it('uses opaque native windows with no private material API', () => {
    const tauri = JSON.parse(read('frontend/src-tauri/tauri.conf.json'));
    const macOS = JSON.parse(read('frontend/src-tauri/tauri.macos.conf.json'));
    expect(tauri.app.macOSPrivateApi ?? false).toBe(false);
    expect(tauri.app.windows[0].transparent).toBe(false);
    expect(macOS.app.windows[0].transparent).toBe(false);
  });

  it('uses least-privilege desktop capabilities and a production-only strict CSP', () => {
    const tauri = JSON.parse(read('frontend/src-tauri/tauri.conf.json'));
    const capability = JSON.parse(read('frontend/src-tauri/capabilities/default.json'));

    expect(capability.permissions).toEqual([
      'core:default',
      'core:window:allow-start-dragging',
      'core:webview:allow-set-webview-zoom',
      'dialog:allow-open',
      'dialog:allow-save',
    ]);
    expect(tauri.app.security.csp).not.toContain("'unsafe-eval'");
    expect(tauri.app.security.csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(tauri.app.security.devCsp).toContain("'unsafe-eval'");
    expect(tauri.app.security.devCsp).toContain('ws://127.0.0.1:3001');
  });

  it('links the backend into Tauri without staging a Python runtime', () => {
    const tauri = JSON.parse(read('frontend/src-tauri/tauri.conf.json'));
    const scripts = JSON.parse(read('frontend/package.json')).scripts;
    expect(tauri.build.beforeBuildCommand).toBe('pnpm build');
    expect(tauri.bundle.resources ?? []).not.toContain('resources/icu/*');
    expect(tauri.bundle.resources ?? []).toEqual([]);
    expect(scripts['dev:desktop']).toBe('tauri dev --config src-tauri/tauri.dev.conf.json');
    expect(scripts['tauri:build']).toBe('tauri build');
    expect(scripts).not.toHaveProperty('prepare:backend-runtime');
    expect(read('frontend/src-tauri/Cargo.toml')).toContain('wordflow-backend = { path = "../../backend" }');
  });
});
