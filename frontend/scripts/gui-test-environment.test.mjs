import { describe, expect, it } from 'vitest';
import { assertGuiTestEnvironment } from './gui-test-environment.mjs';

describe('GUI test execution boundary', () => {
  it('rejects the known restricted macOS launch environment before starting a process', () => {
    expect(() => assertGuiTestEnvironment('darwin', { CODEX_SANDBOX: 'seatbelt' })).toThrow(
      'approved execution outside that sandbox',
    );
  });

  it('allows ordinary macOS execution and leaves other platforms unchanged', () => {
    for (const [platform, env] of [
      ['darwin', {}],
      ['linux', { CODEX_SANDBOX: 'seatbelt' }],
      ['win32', {}],
    ])
      expect(() => assertGuiTestEnvironment(platform, env)).not.toThrow();
  });
});
