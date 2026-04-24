import { secureStorageKeys, type SecureKeyValueStore } from '../../platform/secure-storage/secureStorageBoundary';

export const EVIDENCE_SYNC_API_CONTRACT_VERSION = '2026-04-v1' as const;

export interface EvidenceUploadMetadataRequest {
  contractVersion: typeof EVIDENCE_SYNC_API_CONTRACT_VERSION;
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  evidenceId: string;
  fileName: string;
  mimeType: string | null;
  executionStepId: 'context' | 'calculation' | 'history' | 'guidance' | 'report';
  source: 'camera' | 'library';
  localCapturedAt: string;
  metadataIdempotencyKey: string;
}

export interface EvidenceUploadMetadataResponse {
  contractVersion: typeof EVIDENCE_SYNC_API_CONTRACT_VERSION;
  serverEvidenceId: string;
  reportId: string;
  evidenceId: string;
  metadataReceivedAt: string;
  presenceStatus: 'metadata-recorded' | 'binary-finalized';
}

export interface EvidenceBinaryUploadAuthorization {
  contractVersion: typeof EVIDENCE_SYNC_API_CONTRACT_VERSION;
  serverEvidenceId: string;
  reportId: string;
  evidenceId: string;
  objectKey: string;
  uploadUrl: string;
  uploadMethod: 'PUT';
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

export interface EvidenceBinaryFinalizationResponse {
  contractVersion: typeof EVIDENCE_SYNC_API_CONTRACT_VERSION;
  serverEvidenceId: string;
  reportId: string;
  evidenceId: string;
  presenceStatus: 'binary-finalized';
  presenceFinalizedAt: string;
}

export interface EvidenceUploadApiClient {
  syncEvidenceMetadata(
    request: EvidenceUploadMetadataRequest,
  ): Promise<EvidenceUploadMetadataResponse>;
  authorizeEvidenceBinaryUpload(input: {
    contractVersion: typeof EVIDENCE_SYNC_API_CONTRACT_VERSION;
    reportId: string;
    evidenceId: string;
  }): Promise<EvidenceBinaryUploadAuthorization>;
  finalizeEvidenceBinaryUpload(input: {
    contractVersion: typeof EVIDENCE_SYNC_API_CONTRACT_VERSION;
    serverEvidenceId: string;
  }): Promise<EvidenceBinaryFinalizationResponse>;
}

export class EvidenceUploadApiError extends Error {
  readonly statusCode: number;
  readonly kind: 'network' | 'server';

  constructor(message: string, statusCode: number, kind: 'network' | 'server') {
    super(message);
    this.name = 'EvidenceUploadApiError';
    this.statusCode = statusCode;
    this.kind = kind;
  }
}

export function createFetchEvidenceUploadApiClient(options: {
  baseUrl: string;
  secureStorage: SecureKeyValueStore;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}): EvidenceUploadApiClient {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;

  return {
    syncEvidenceMetadata(request) {
      return postJson<EvidenceUploadMetadataResponse>(
        buildUrl(options.baseUrl, '/sync/evidence-metadata'),
        request,
        options.secureStorage,
        fetchImplementation,
        timeoutMs,
      );
    },
    authorizeEvidenceBinaryUpload(request) {
      return postJson<EvidenceBinaryUploadAuthorization>(
        buildUrl(options.baseUrl, '/sync/evidence-upload-authorizations'),
        request,
        options.secureStorage,
        fetchImplementation,
        timeoutMs,
      );
    },
    finalizeEvidenceBinaryUpload(request) {
      return postJson<EvidenceBinaryFinalizationResponse>(
        buildUrl(options.baseUrl, '/sync/evidence-binary-finalizations'),
        request,
        options.secureStorage,
        fetchImplementation,
        timeoutMs,
      );
    },
  };
}

async function postJson<T>(
  url: string,
  payload: unknown,
  secureStorage: SecureKeyValueStore,
  fetchImplementation: typeof fetch,
  timeoutMs: number,
): Promise<T> {
  const accessToken = await secureStorage.getItem(secureStorageKeys.sessionAccessToken);
  if (!accessToken) {
    throw new EvidenceUploadApiError(
      'Connected session is required before uploading evidence.',
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
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const raw = await response.text();
    const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

    if (!response.ok) {
      throw new EvidenceUploadApiError(
        typeof data.message === 'string'
          ? data.message
          : `Evidence upload request failed with ${response.status}.`,
        response.status,
        'server',
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof EvidenceUploadApiError) {
      throw error;
    }

    throw new EvidenceUploadApiError(
      error instanceof Error ? error.message : 'Evidence upload request failed.',
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
