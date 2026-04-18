export interface SecureKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const secureStorageKeys = {
  sessionAccessToken: 'session.access-token',
  sessionRefreshToken: 'session.refresh-token',
} as const;

export function createSecureStorageBoundary(): SecureKeyValueStore {
  throw new Error(
    'Secure storage is intentionally not implemented in Story 1.1. Add the platform-backed implementation in the auth/session story.',
  );
}
