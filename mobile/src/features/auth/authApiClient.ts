import { resolveApiBaseUrl } from '../../platform/http/apiBaseUrl';
import type { AuthSessionPayload } from './model';

export interface AuthApiClient {
  login(request: { email: string; password: string }): Promise<AuthSessionPayload>;
  refresh(request: { refreshToken: string }): Promise<AuthSessionPayload>;
}

export class AuthApiError extends Error {
  readonly statusCode: number;
  readonly kind: 'network' | 'server';

  constructor(message: string, statusCode: number, kind: 'network' | 'server') {
    super(message);
    this.name = 'AuthApiError';
    this.statusCode = statusCode;
    this.kind = kind;
  }
}

/**
 * Build-time default only — does NOT see the runtime-configurable stored
 * preference (SQLite is not readable here). Production code should construct
 * clients from the effective runtime URL resolved in TagWiseApp's bootstrap;
 * this remains as the default parameter fallback for tests/harnesses.
 */
export function getDefaultAuthApiBaseUrl(): string {
  return resolveApiBaseUrl(null);
}

export function createFetchAuthApiClient(
  baseUrl: string = getDefaultAuthApiBaseUrl(),
  fetchImplementation: typeof fetch = fetch,
  timeoutMs: number = 2000,
): AuthApiClient {
  return {
    async login(request) {
      return postJson<AuthSessionPayload>(
        buildUrl(baseUrl, '/auth/login'),
        request,
        fetchImplementation,
        timeoutMs,
      );
    },
    async refresh(request) {
      return postJson<AuthSessionPayload>(
        buildUrl(baseUrl, '/auth/refresh'),
        request,
        fetchImplementation,
        timeoutMs,
      );
    },
  };
}

async function postJson<T>(
  url: string,
  payload: unknown,
  fetchImplementation: typeof fetch,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImplementation(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const raw = await response.text();
    const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

    if (!response.ok) {
      throw new AuthApiError(
        typeof data.message === 'string' ? data.message : `Authentication request failed with ${response.status}.`,
        response.status,
        'server',
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof AuthApiError) {
      throw error;
    }

    throw new AuthApiError(
      error instanceof Error ? error.message : 'Authentication request failed.',
      0,
      'network',
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}
