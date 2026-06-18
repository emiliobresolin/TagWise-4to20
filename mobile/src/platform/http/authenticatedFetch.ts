import type { AuthApiClient } from '../../features/auth/authApiClient';
import type { SecureKeyValueStore } from '../secure-storage/secureStorageBoundary';

const ACCESS_TOKEN_KEY = 'tagwise_access_token';
const REFRESH_TOKEN_KEY = 'tagwise_refresh_token';

export interface AuthenticatedFetchOptions {
  authApiClient: AuthApiClient;
  secureStorage: SecureKeyValueStore;
  onSessionInvalidated: () => void;
}

export function createAuthenticatedFetch(options: AuthenticatedFetchOptions): typeof fetch {
  let isRefreshing = false;
  let refreshPromise: Promise<string | null> | null = null;

  async function refreshAccessToken(): Promise<string | null> {
    if (isRefreshing && refreshPromise) {
      return refreshPromise;
    }

    isRefreshing = true;
    refreshPromise = (async () => {
      try {
        const refreshToken = await options.secureStorage.getItem(REFRESH_TOKEN_KEY);
        if (!refreshToken) {
          options.onSessionInvalidated();
          return null;
        }

        const session = await options.authApiClient.refresh({ refreshToken });
        await options.secureStorage.setItem(ACCESS_TOKEN_KEY, session.tokens.accessToken);
        await options.secureStorage.setItem(REFRESH_TOKEN_KEY, session.tokens.refreshToken);
        return session.tokens.accessToken;
      } catch {
        options.onSessionInvalidated();
        return null;
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  return async function authenticatedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const accessToken = await options.secureStorage.getItem(ACCESS_TOKEN_KEY);

    const headers = new Headers(init?.headers);
    if (accessToken) {
      headers.set('authorization', `Bearer ${accessToken}`);
    }

    const response = await fetch(input, { ...init, headers });

    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      if (!newToken) {
        return response;
      }

      const retryHeaders = new Headers(init?.headers);
      retryHeaders.set('authorization', `Bearer ${newToken}`);
      return fetch(input, { ...init, headers: retryHeaders });
    }

    return response;
  };
}
