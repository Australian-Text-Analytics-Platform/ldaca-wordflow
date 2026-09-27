import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateDuckDBVersion } from './build-quicklook.mjs';

const read = (path) => readFileSync(resolve(import.meta.dirname, '..', path), 'utf8');

describe('Quick Look packaging contracts', () => {
  it('pins the backend DuckDB engine and rejects dependency drift', () => {
    const pin = JSON.parse(read('src-tauri/quicklook/duckdb.json'));
    validateDuckDBVersion(pin, read('../Cargo.lock'));
    expect(pin.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(pin.url).toContain(`/v${pin.version}/`);
    expect(() => validateDuckDBVersion({ version: '1.4.0' }, read('../Cargo.lock'))).toThrow('must match');
  });

  it('keeps extension builds in macOS bundling, out of desktop development and Windows', () => {
    const mac = JSON.parse(read('src-tauri/tauri.macos.conf.json'));
    const base = JSON.parse(read('src-tauri/tauri.conf.json'));
    expect(mac.build.beforeBundleCommand).toBe('pnpm build:quicklook');
    expect(mac.bundle.macOS.files['PlugIns/WordflowPreview.appex']).toBe('target/quicklook/products/WordflowPreview.appex');
    expect(base.build.beforeBundleCommand).toBeUndefined();
    expect(JSON.parse(read('package.json')).scripts['dev:desktop']).toBe('tauri dev --config src-tauri/tauri.dev.conf.json');
  });

  it('registers the same file type, preserves format compatibility and has no network entitlement', () => {
    const base = JSON.parse(read('src-tauri/tauri.conf.json'));
    expect(read('src-tauri/quicklook/Info.plist')).toContain(base.bundle.fileAssociations[0].exportedType.identifier);
    expect(read('src-tauri/quicklook/Info.plist')).toContain('QLIsDataBasedPreview');
    expect(read('src-tauri/quicklook/entitlements.plist')).not.toContain('network');
    const version = read('../backend/src/schema.sql').match(/CHECK \(schema_version = (\d+)\)/)[1];
    expect(read('src-tauri/quicklook/ProjectPreview.swift')).toContain(`project[0][0] == "${version}"`);
  });
});
