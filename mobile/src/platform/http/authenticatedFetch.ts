import type { SessionRestoreResult } from '../../features/auth/model';
import { secureStorageKeys, type SecureKeyValueStore } from '../secure-storage/secureStorageBoundary';

export interface AuthenticatedFetchOptions {
  secureStorage: SecureKeyValueStore;
  // Session refresh must flow through SessionController.restoreSession so the
  // renewed tokens land in secure storage AND the auth session cache stays in
  // sync (a direct authApiClient.refresh would leave the cache stale).
  restoreSession: () => Promise<SessionRestoreResult>;
  // Invoked when the refresh definitively fails (refresh token expired or
  // rejected) and the user must sign in again. Not invoked for transient
  // failures such as the cached-offline fallback.
  onSessionInvalidated: () => void;
  fetchImplementation?: typeof fetch;
}

/**
 * Centralized refresh-on-401 fetch wrapper. Inject as `fetchImplementation`
 * into the feature API clients (work packages, evidence upload, supervisor
 * review, supervisor authoring, diagnostics) so any request rejected with 401
 * triggers exactly one session refresh and one retry with the renewed access
 * token. The auth client itself (login/refresh) must NOT use this wrapper.
 *
 * The clients attach their own `authorization` header on the first attempt;
 * this wrapper only overrides it on the retry with the token that
 * `restoreSession` persisted into secure storage. Refreshes are single-flight:
 * concurrent 401s share one `restoreSession` call.
 */
export function createAuthenticatedFetch(options: AuthenticatedFetchOptions): typeof fetch {
  const baseFetch = options.fetchImplementation ?? fetch;
  let refreshPromise: Promise<string | null> | null = null;

  async function refreshAccessToken(): Promise<string | null> {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      try {
        const restored = await options.restoreSession();
        if (restored.state === 'signed_out') {
          options.onSessionInvalidated();
          return null;
        }

        if (restored.session?.connectionMode !== 'connected') {
          // Cached-offline fallback: the refresh endpoint was unreachable, so
          // no new token exists. Surface the original 401 to the caller
          // without invalidating the (still potentially valid) session.
          return null;
        }

        return await options.secureStorage.getItem(secureStorageKeys.sessionAccessToken);
      } catch {
        options.onSessionInvalidated();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  return async function authenticatedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const response = await baseFetch(input, init);

    if (response.status !== 401) {
      return response;
    }

    const refreshedToken = await refreshAccessToken();
    if (!refreshedToken) {
      return response;
    }

    const retryHeaders = new Headers(init?.headers);
    retryHeaders.set('authorization', `Bearer ${refreshedToken}`);
    return baseFetch(input, { ...init, headers: retryHeaders });
  };
}
