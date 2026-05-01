import { secureStorageKeys, type SecureKeyValueStore } from '../../platform/secure-storage/secureStorageBoundary';
import type { MobileRuntimeErrorEvent } from './model';

export const MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION = '2026-04-v1' as const;

export interface MobileRuntimeErrorTelemetryRequest
  extends Omit<MobileRuntimeErrorEvent, 'reportedAt'> {
  contractVersion: typeof MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION;
}

export interface MobileRuntimeErrorTelemetryResponse extends MobileRuntimeErrorTelemetryRequest {
  reportedAt: string;
  reportingUserId: string;
}

export interface MobileDiagnosticsApiClient {
  reportRuntimeError(
    event: MobileRuntimeErrorEvent,
  ): Promise<MobileRuntimeErrorTelemetryResponse>;
}

export class MobileDiagnosticsApiError extends Error {
  readonly statusCode: number;
  readonly kind: 'network' | 'server';

  constructor(message: string, statusCode: number, kind: 'network' | 'server') {
    super(message);
    this.name = 'MobileDiagnosticsApiError';
    this.statusCode = statusCode;
    this.kind = kind;
  }
}

export function createFetchMobileDiagnosticsApiClient(options: {
  baseUrl: string;
  secureStorage: SecureKeyValueStore;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}): MobileDiagnosticsApiClient {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;

  return {
    reportRuntimeError(event) {
      const { reportedAt: _reportedAt, ...requestEvent } = event;
      return postJson<MobileRuntimeErrorTelemetryResponse>({
        url: buildUrl(options.baseUrl, '/diagnostics/mobile-errors'),
        payload: {
          contractVersion: MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
          ...requestEvent,
        } satisfies MobileRuntimeErrorTelemetryRequest,
        secureStorage: options.secureStorage,
        fetchImplementation,
        timeoutMs,
      });
    },
  };
}

async function postJson<T>(input: {
  url: string;
  payload: unknown;
  secureStorage: SecureKeyValueStore;
  fetchImplementation: typeof fetch;
  timeoutMs: number;
}): Promise<T> {
  const accessToken = await input.secureStorage.getItem(secureStorageKeys.sessionAccessToken);
  if (!accessToken) {
    throw new MobileDiagnosticsApiError(
      'Connected session is required before reporting diagnostics.',
      401,
      'server',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await input.fetchImplementation(input.url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(input.payload),
      signal: controller.signal,
    });

    const raw = await response.text();
    const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

    if (!response.ok) {
      throw new MobileDiagnosticsApiError(
        typeof data.message === 'string'
          ? data.message
          : `Mobile diagnostics request failed with ${response.status}.`,
        response.status,
        'server',
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof MobileDiagnosticsApiError) {
      throw error;
    }

    throw new MobileDiagnosticsApiError(
      error instanceof Error ? error.message : 'Mobile diagnostics request failed.',
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
