// Runtime-configurable API base URL resolution.
//
// The APK bakes EXPO_PUBLIC_TAGWISE_API_BASE_URL at build time, which forced
// a rebuild every time the backend PC's LAN IP changed. The server URL is now
// a runtime preference persisted in the app_preferences SQLite table; this
// module owns the precedence chain and the normalization/validation rules so
// every consumer (client factories, NetInfo reachability, login-screen
// editor) agrees on the effective URL.
//
// Precedence: stored preference > EXPO_PUBLIC_TAGWISE_API_BASE_URL > loopback
// fallback (only useful on emulators / dev hosts).

export const API_BASE_URL_FALLBACK = 'http://127.0.0.1:4100';

/**
 * Build-time env value, or null when unset/blank. Kept separate from
 * `resolveApiBaseUrl` so callers can distinguish "no env configured" from
 * "env configured but invalid".
 */
export function getBuildTimeApiBaseUrl(): string | null {
  const value = process.env.EXPO_PUBLIC_TAGWISE_API_BASE_URL?.trim();
  return value ? value : null;
}

/**
 * Normalizes a candidate server URL: trims whitespace, strips trailing
 * slashes, and requires an explicit http:// or https:// scheme followed by a
 * plausible host. Returns null when the input is not a usable base URL —
 * callers must treat null as "invalid, do not persist".
 */
export function normalizeApiBaseUrl(input: string | null | undefined): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim().replace(/\/+$/, '');
  if (trimmed.length === 0 || /\s/.test(trimmed)) {
    return null;
  }

  // Scheme is mandatory (cleartext http is expected on LAN demos; the
  // Android manifest already allows it via withAndroidCleartextTraffic).
  const match = /^(https?):\/\/([^/]+)(\/.*)?$/i.exec(trimmed);
  if (!match) {
    return null;
  }

  const host = match[2];
  // Reject empty hosts ("http://"), bare ports ("http://:4100") and
  // credentials-only fragments ("http://@").
  if (!host || host.startsWith(':') || host === '@') {
    return null;
  }

  return trimmed;
}

/**
 * Resolves the effective API base URL from the persisted preference with the
 * build-time env var and the loopback default as fallbacks. Invalid values at
 * any level fall through to the next one, so a corrupt stored preference can
 * never brick connectivity.
 */
export function resolveApiBaseUrl(stored: string | null): string {
  return (
    normalizeApiBaseUrl(stored) ??
    normalizeApiBaseUrl(getBuildTimeApiBaseUrl()) ??
    API_BASE_URL_FALLBACK
  );
}

/**
 * True when the URL points at the device itself — useful for surfacing a
 * "this phone cannot reach the backend at a loopback address" warning.
 */
export function isLoopbackApiBaseUrl(url: string): boolean {
  return /^https?:\/\/(127\.|localhost([:/]|$))/i.test(url);
}
