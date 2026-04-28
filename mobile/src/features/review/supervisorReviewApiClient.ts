import { secureStorageKeys, type SecureKeyValueStore } from '../../platform/secure-storage/secureStorageBoundary';
import type {
  SupervisorReviewDecisionResponse,
  SupervisorReviewQueueResponse,
  SupervisorReviewReportResponse,
} from './model';

export interface SupervisorReviewApiClient {
  listSupervisorQueue(): Promise<SupervisorReviewQueueResponse>;
  getSupervisorReportDetail(reportId: string): Promise<SupervisorReviewReportResponse>;
  approveSupervisorReport(reportId: string): Promise<SupervisorReviewDecisionResponse>;
  returnSupervisorReport(
    reportId: string,
    comment: string,
  ): Promise<SupervisorReviewDecisionResponse>;
  escalateSupervisorReport(
    reportId: string,
    rationale: string,
  ): Promise<SupervisorReviewDecisionResponse>;
}

export class SupervisorReviewApiError extends Error {
  readonly statusCode: number;
  readonly kind: 'network' | 'server';

  constructor(message: string, statusCode: number, kind: 'network' | 'server') {
    super(message);
    this.name = 'SupervisorReviewApiError';
    this.statusCode = statusCode;
    this.kind = kind;
  }
}

export function createFetchSupervisorReviewApiClient(options: {
  baseUrl: string;
  secureStorage: SecureKeyValueStore;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}): SupervisorReviewApiClient {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMs = options.timeoutMs ?? 3000;

  return {
    listSupervisorQueue() {
      return getJson<SupervisorReviewQueueResponse>(
        buildUrl(options.baseUrl, '/review/supervisor/reports'),
        options.secureStorage,
        fetchImplementation,
        timeoutMs,
      );
    },
    getSupervisorReportDetail(reportId) {
      return getJson<SupervisorReviewReportResponse>(
        buildUrl(options.baseUrl, `/review/supervisor/reports/${encodeURIComponent(reportId)}`),
        options.secureStorage,
        fetchImplementation,
        timeoutMs,
      );
    },
    approveSupervisorReport(reportId) {
      return postJson<SupervisorReviewDecisionResponse>(
        buildUrl(
          options.baseUrl,
          `/review/supervisor/reports/${encodeURIComponent(reportId)}/approve`,
        ),
        options.secureStorage,
        fetchImplementation,
        timeoutMs,
      );
    },
    returnSupervisorReport(reportId, comment) {
      return postJson<SupervisorReviewDecisionResponse>(
        buildUrl(
          options.baseUrl,
          `/review/supervisor/reports/${encodeURIComponent(reportId)}/return`,
        ),
        options.secureStorage,
        fetchImplementation,
        timeoutMs,
        { comment },
      );
    },
    escalateSupervisorReport(reportId, rationale) {
      return postJson<SupervisorReviewDecisionResponse>(
        buildUrl(
          options.baseUrl,
          `/review/supervisor/reports/${encodeURIComponent(reportId)}/escalate`,
        ),
        options.secureStorage,
        fetchImplementation,
        timeoutMs,
        { rationale },
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
    throw new SupervisorReviewApiError(
      'Connected supervisor session is required before loading review reports.',
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
      throw new SupervisorReviewApiError(
        typeof data.message === 'string'
          ? data.message
          : `Supervisor review request failed with ${response.status}.`,
        response.status,
        'server',
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof SupervisorReviewApiError) {
      throw error;
    }

    throw new SupervisorReviewApiError(
      error instanceof Error ? error.message : 'Supervisor review request failed.',
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
  body: Record<string, unknown> = {},
): Promise<T> {
  const accessToken = await secureStorage.getItem(secureStorageKeys.sessionAccessToken);
  if (!accessToken) {
    throw new SupervisorReviewApiError(
      'Connected supervisor session is required before sending review decisions.',
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
      throw new SupervisorReviewApiError(
        typeof data.message === 'string'
          ? data.message
          : `Supervisor review decision failed with ${response.status}.`,
        response.status,
        'server',
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof SupervisorReviewApiError) {
      throw error;
    }

    throw new SupervisorReviewApiError(
      error instanceof Error ? error.message : 'Supervisor review decision failed.',
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
