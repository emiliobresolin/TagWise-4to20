import {
  secureStorageKeys,
  type SecureKeyValueStore,
} from '../../platform/secure-storage/secureStorageBoundary';
import type {
  CatalogInstrument,
  CatalogTechnician,
  CreateWorkPackageInput,
  CreateWorkPackageResult,
} from './model';

export interface SupervisorAuthoringApiClient {
  listInstruments(): Promise<CatalogInstrument[]>;
  listTechnicians(): Promise<CatalogTechnician[]>;
  createWorkPackage(input: CreateWorkPackageInput): Promise<CreateWorkPackageResult>;
}

export class SupervisorAuthoringApiError extends Error {
  readonly statusCode: number;
  readonly kind: 'network' | 'server';
  readonly missingInstrumentIds?: string[];

  constructor(
    message: string,
    statusCode: number,
    kind: 'network' | 'server',
    missingInstrumentIds?: string[],
  ) {
    super(message);
    this.name = 'SupervisorAuthoringApiError';
    this.statusCode = statusCode;
    this.kind = kind;
    this.missingInstrumentIds = missingInstrumentIds;
  }
}

export function createFetchSupervisorAuthoringApiClient(options: {
  baseUrl: string;
  secureStorage: SecureKeyValueStore;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}): SupervisorAuthoringApiClient {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;

  return {
    async listInstruments() {
      const response = await getJson<{ items: CatalogInstrument[] }>(
        buildUrl(options.baseUrl, '/supervisor/instruments'),
        options.secureStorage,
        fetchImplementation,
        timeoutMs,
      );
      return response.items;
    },
    async listTechnicians() {
      const response = await getJson<{ items: CatalogTechnician[] }>(
        buildUrl(options.baseUrl, '/supervisor/technicians'),
        options.secureStorage,
        fetchImplementation,
        timeoutMs,
      );
      return response.items;
    },
    async createWorkPackage(input) {
      const response = await postJson<{
        summary: { id: string; title: string; tagCount: number };
      }>(
        buildUrl(options.baseUrl, '/supervisor/work-packages'),
        options.secureStorage,
        fetchImplementation,
        timeoutMs,
        input as unknown as Record<string, unknown>,
      );

      return {
        workPackageId: response.summary.id,
        title: response.summary.title,
        tagCount: response.summary.tagCount,
        assignedUserId: input.assignedUserId,
      };
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
    throw new SupervisorAuthoringApiError(
      'Sessao de supervisor conectada e necessaria.',
      401,
      'server',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImplementation(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    const raw = await response.text();
    const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

    if (!response.ok) {
      throw new SupervisorAuthoringApiError(
        typeof data.message === 'string'
          ? data.message
          : `Requisicao falhou com ${response.status}.`,
        response.status,
        'server',
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof SupervisorAuthoringApiError) {
      throw error;
    }
    throw new SupervisorAuthoringApiError(
      error instanceof Error ? error.message : 'Falha de rede.',
      0,
      'network',
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function postJson<T>(
  url: string,
  secureStorage: SecureKeyValueStore,
  fetchImplementation: typeof fetch,
  timeoutMs: number,
  body: Record<string, unknown>,
): Promise<T> {
  const accessToken = await secureStorage.getItem(secureStorageKeys.sessionAccessToken);
  if (!accessToken) {
    throw new SupervisorAuthoringApiError(
      'Sessao de supervisor conectada e necessaria.',
      401,
      'server',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImplementation(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

    if (!response.ok) {
      const missingInstrumentIds = Array.isArray(data.missingInstrumentIds)
        ? (data.missingInstrumentIds as string[])
        : undefined;
      throw new SupervisorAuthoringApiError(
        typeof data.message === 'string'
          ? data.message
          : `Criacao do pacote falhou com ${response.status}.`,
        response.status,
        'server',
        missingInstrumentIds,
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof SupervisorAuthoringApiError) {
      throw error;
    }
    throw new SupervisorAuthoringApiError(
      error instanceof Error ? error.message : 'Falha de rede.',
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
