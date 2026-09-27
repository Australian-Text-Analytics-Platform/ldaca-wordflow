/** Fail before macOS GUI registration can abort and create crash reports. */
export function assertGuiTestEnvironment(platform = process.platform, env = process.env) {
  if (platform === 'darwin' && env.CODEX_SANDBOX === 'seatbelt') {
    throw new Error(
      'macOS GUI tests cannot run inside the Codex seatbelt execution sandbox. ' +
        'Rerun this test command with approved execution outside that sandbox. ' +
        'Do not unset CODEX_SANDBOX or disable Chrome security to bypass this check. ' +
        'Unit tests, lint and builds can remain sandboxed.',
    );
  }
}
