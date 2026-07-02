#!/usr/bin/env node
/**
 * Build preflight for the TagWise mobile APK (ledger: apk-lan-url-no-preflight,
 * env-buildtime-check). Plain Node, zero dependencies.
 *
 * Fails (exit 1) when EXPO_PUBLIC_TAGWISE_API_BASE_URL is unset, empty, or a
 * loopback address (127.x / localhost) — a build like that would bake a server
 * URL the phone can never reach. Set TAGWISE_ALLOW_DEFAULT_URL=1 to bypass
 * (emulator-only builds, or when you plan to set the URL at runtime).
 *
 * Wired twice:
 *   - package.json "build:android:preview" runs it before invoking eas-cli
 *     (validates the local shell env; export the var or use the bypass).
 *   - package.json "eas-build-pre-install" runs it on the EAS build worker,
 *     where the "preview" environment's variables are already injected — so it
 *     validates the exact value that gets inlined into the APK.
 */
'use strict';

const ENV_KEY = 'EXPO_PUBLIC_TAGWISE_API_BASE_URL';
const BYPASS_KEY = 'TAGWISE_ALLOW_DEFAULT_URL';

const rawValue = (process.env[ENV_KEY] || '').trim();
const bypass = (process.env[BYPASS_KEY] || '').trim() === '1';
const isLoopback = /^https?:\/\/(127\.|localhost([:/]|$))/i.test(rawValue);

if (bypass) {
  console.log(
    `[check-env] ${BYPASS_KEY}=1 set — skipping the ${ENV_KEY} check ` +
      `(current value: ${rawValue || '<unset>'}).`,
  );
  process.exit(0);
}

if (!rawValue || isLoopback) {
  const problem = !rawValue
    ? `${ENV_KEY} is not set.`
    : `${ENV_KEY} is set to a loopback address (${rawValue}) — on a phone, ` +
      '127.0.0.1/localhost points at the phone itself, never at your backend PC.';

  console.error(
    [
      '',
      '[check-env] APK build preflight FAILED.',
      '',
      `  Problem: ${problem}`,
      '',
      '  Fix option 1 (build-time default): set the env var to your backend',
      "  PC's LAN address before building, e.g.:",
      `    ${ENV_KEY}=http://192.168.0.10:4100`,
      '  (For EAS cloud builds, set it in the "preview" environment via',
      '   `eas env:create` so the build worker sees it.)',
      '',
      '  Fix option 2 (runtime): the APK now supports changing the server URL',
      '  at runtime — open the app, and on the LOGIN screen tap the "Servidor"',
      '  section to enter the backend URL. It is persisted across restarts, so',
      '  a build with a wrong/unset default is field-recoverable.',
      '',
      `  To build anyway (emulator-only, or relying on the runtime URL), set:`,
      `    ${BYPASS_KEY}=1`,
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(`[check-env] OK: ${ENV_KEY}=${rawValue}`);
process.exit(0);
