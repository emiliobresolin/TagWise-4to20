import { secureStorageKeys, type SecureKeyValueStore } from '../../platform/secure-storage/secureStorageBoundary';
import type { AssignedWorkPackageSnapshot, AssignedWorkPackageSummary } from './model';

export interface AssignedWorkPackageApiClient {
  listAssignedPackages(): Promise<AssignedWorkPackageSummary[]>;
  downloadAssignedPackage(workPackageId: string): Promise<AssignedWorkPackageSnapshot>;
}

export class AssignedWorkPackageApiError extends Error {
  readonly statusCode: number;
  readonly kind: 'network' | 'server';

  constructor(message: string, statusCode: number, kind: 'network' | 'server') {
    super(message);
    this.name = 'AssignedWorkPackageApiError';
    this.statusCode = statusCode;
    this.kind = kind;
  }
}

export function createFetchAssignedWorkPackageApiClient(options: {
  baseUrl: string;
  secureStorage: SecureKeyValueStore;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}): AssignedWorkPackageApiClient {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMs = options.timeoutMs ?? 3000;

  return {
    async listAssignedPackages() {
      const response = await getJson<{ items: AssignedWorkPackageSummary[] }>(
        buildUrl(options.baseUrl, '/work-packages'),
        options.secureStorage,
        fetchImplementation,
        timeoutMs,
      );
      return response.items;
    },
    async downloadAssignedPackage(workPackageId) {
      return getJson<AssignedWorkPackageSnapshot>(
        buildUrl(options.baseUrl, `/work-packages/${encodeURIComponent(workPackageId)}/download`),
        options.secureStorage,
        fetchImplementation,
        timeoutMs,
      );
    },
  };
}

async function getJson<T>(
  url: string,
  secureStorage: SecureKeyValueStore,
  fetchImplementation: typeof fetch,
  timeoutMs: number,
): Promise<T> {
  const accessToken = await secureStorage.getItem(secureStorageKeys.sessionAccessToken);
  if (!accessToken) {
    throw new AssignedWorkPackageApiError(
      'Connected session is required before loading assigned work packages.',
      401,
      'server',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImplementation(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });
    const raw = await response.text();
    const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

    if (!response.ok) {
      throw new AssignedWorkPackageApiError(
        typeof data.message === 'string'
          ? data.message
          : `Assigned work package request failed with ${response.status}.`,
        response.status,
        'server',
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof AssignedWorkPackageApiError) {
      throw error;
    }

    throw new AssignedWorkPackageApiError(
      error instanceof Error ? error.message : 'Assigned work package request failed.',
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
