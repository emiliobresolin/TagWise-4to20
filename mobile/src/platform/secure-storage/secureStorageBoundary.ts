export interface SecureKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface SecureStoreModule {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const secureStorageKeys = {
  sessionAccessToken: 'session.access-token',
  sessionRefreshToken: 'session.refresh-token',
} as const;

export function createSecureStorageBoundary(
  secureStoreLoader: () => Promise<SecureStoreModule> = loadExpoSecureStore,
): SecureKeyValueStore {
  return {
    async getItem(key: string): Promise<string | null> {
      const secureStore = await secureStoreLoader();
      return secureStore.getItemAsync(key);
    },
    async setItem(key: string, value: string): Promise<void> {
      const secureStore = await secureStoreLoader();
      await secureStore.setItemAsync(key, value);
    },
    async removeItem(key: string): Promise<void> {
      const secureStore = await secureStoreLoader();
      await secureStore.deleteItemAsync(key);
    },
  };
}

export function createInMemorySecureStorageBoundary(
  initialValues: Record<string, string> = {},
): SecureKeyValueStore {
  const values = new Map(Object.entries(initialValues));

  return {
    async getItem(key: string): Promise<string | null> {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string): Promise<void> {
      values.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      values.delete(key);
    },
  };
}

async function loadExpoSecureStore(): Promise<SecureStoreModule> {
  return import('expo-secure-store');
}
