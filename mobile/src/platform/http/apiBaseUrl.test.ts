import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  API_BASE_URL_FALLBACK,
  getBuildTimeApiBaseUrl,
  isLoopbackApiBaseUrl,
  normalizeApiBaseUrl,
  resolveApiBaseUrl,
} from './apiBaseUrl';

const ENV_KEY = 'EXPO_PUBLIC_TAGWISE_API_BASE_URL';

describe('normalizeApiBaseUrl', () => {
  it('accepts a plain http LAN URL unchanged', () => {
    expect(normalizeApiBaseUrl('http://192.168.0.10:4100')).toBe('http://192.168.0.10:4100');
  });

  it('accepts https URLs', () => {
    expect(normalizeApiBaseUrl('https://api.tagwise.example')).toBe(
      'https://api.tagwise.example',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeApiBaseUrl('  http://192.168.0.10:4100  ')).toBe(
      'http://192.168.0.10:4100',
    );
  });

  it('strips trailing slashes', () => {
    expect(normalizeApiBaseUrl('http://192.168.0.10:4100/')).toBe('http://192.168.0.10:4100');
    expect(normalizeApiBaseUrl('http://192.168.0.10:4100///')).toBe(
      'http://192.168.0.10:4100',
    );
  });

  it('keeps a base path when present', () => {
    expect(normalizeApiBaseUrl('http://192.168.0.10:4100/api/')).toBe(
      'http://192.168.0.10:4100/api',
    );
  });

  it('rejects null, undefined and empty values', () => {
    expect(normalizeApiBaseUrl(null)).toBeNull();
    expect(normalizeApiBaseUrl(undefined)).toBeNull();
    expect(normalizeApiBaseUrl('')).toBeNull();
    expect(normalizeApiBaseUrl('   ')).toBeNull();
  });

  it('rejects URLs without an http(s) scheme', () => {
    expect(normalizeApiBaseUrl('192.168.0.10:4100')).toBeNull();
    expect(normalizeApiBaseUrl('ftp://192.168.0.10:4100')).toBeNull();
    expect(normalizeApiBaseUrl('ws://192.168.0.10:4100')).toBeNull();
  });

  it('rejects scheme-only and hostless inputs', () => {
    expect(normalizeApiBaseUrl('http://')).toBeNull();
    expect(normalizeApiBaseUrl('http://:4100')).toBeNull();
  });

  it('rejects URLs with embedded whitespace', () => {
    expect(normalizeApiBaseUrl('http://192.168.0.10:4100 /api')).toBeNull();
  });
});

describe('resolveApiBaseUrl', () => {
  const originalEnvValue = process.env[ENV_KEY];

  beforeEach(() => {
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (originalEnvValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnvValue;
    }
  });

  it('prefers the stored preference over the build-time env var', () => {
    process.env[ENV_KEY] = 'http://10.0.0.5:4100';
    expect(resolveApiBaseUrl('http://192.168.0.10:4100')).toBe('http://192.168.0.10:4100');
  });

  it('normalizes the stored preference', () => {
    expect(resolveApiBaseUrl(' http://192.168.0.10:4100/ ')).toBe('http://192.168.0.10:4100');
  });

  it('falls back to the build-time env var when no preference is stored', () => {
    process.env[ENV_KEY] = 'http://10.0.0.5:4100/';
    expect(resolveApiBaseUrl(null)).toBe('http://10.0.0.5:4100');
  });

  it('falls back to the env var when the stored preference is invalid', () => {
    process.env[ENV_KEY] = 'http://10.0.0.5:4100';
    expect(resolveApiBaseUrl('not-a-url')).toBe('http://10.0.0.5:4100');
  });

  it('falls back to loopback when nothing is configured', () => {
    expect(resolveApiBaseUrl(null)).toBe(API_BASE_URL_FALLBACK);
  });

  it('falls back to loopback when the env var is invalid too', () => {
    process.env[ENV_KEY] = 'nonsense';
    expect(resolveApiBaseUrl('also-nonsense')).toBe(API_BASE_URL_FALLBACK);
  });
});

describe('getBuildTimeApiBaseUrl', () => {
  const originalEnvValue = process.env[ENV_KEY];

  afterEach(() => {
    if (originalEnvValue === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = originalEnvValue;
    }
  });

  it('returns null when unset or blank', () => {
    delete process.env[ENV_KEY];
    expect(getBuildTimeApiBaseUrl()).toBeNull();
    process.env[ENV_KEY] = '   ';
    expect(getBuildTimeApiBaseUrl()).toBeNull();
  });

  it('returns the trimmed value when set', () => {
    process.env[ENV_KEY] = ' http://10.0.0.5:4100 ';
    expect(getBuildTimeApiBaseUrl()).toBe('http://10.0.0.5:4100');
  });
});

describe('isLoopbackApiBaseUrl', () => {
  it('detects 127.x and localhost URLs', () => {
    expect(isLoopbackApiBaseUrl('http://127.0.0.1:4100')).toBe(true);
    expect(isLoopbackApiBaseUrl('http://localhost:4100')).toBe(true);
    expect(isLoopbackApiBaseUrl('https://localhost')).toBe(true);
  });

  it('does not flag LAN or hostname URLs', () => {
    expect(isLoopbackApiBaseUrl('http://192.168.0.10:4100')).toBe(false);
    expect(isLoopbackApiBaseUrl('https://api.tagwise.example')).toBe(false);
    expect(isLoopbackApiBaseUrl('http://localhost.example.com')).toBe(false);
  });
});
