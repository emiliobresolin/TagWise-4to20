import { secureStorageKeys, type SecureKeyValueStore } from '../../platform/secure-storage/secureStorageBoundary';

export const EVIDENCE_SYNC_API_CONTRACT_VERSION = '2026-04-v1' as const;
export const REPORT_SUBMISSION_API_CONTRACT_VERSION = '2026-04-v1' as const;

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

export interface ReportSubmissionSyncIssue {
  reasonCode:
    | 'malformed-report-payload'
    | 'out-of-scope'
    | 'invalid-lifecycle-transition'
    | 'minimum-evidence-missing'
    | 'required-justification-missing'
    | 'required-evidence-not-finalized'
    | 'conflicting-report-version';
  message: string;
  serverReportVersion?: string;
}

export interface ReportSubmissionRequest {
  contractVersion: typeof REPORT_SUBMISSION_API_CONTRACT_VERSION;
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  reportState: 'submitted-pending-sync';
  lifecycleState: 'Submitted - Pending Sync';
  syncState: 'queued' | 'syncing' | 'pending-validation';
  objectVersion: string;
  idempotencyKey: string;
  submittedAt: string;
  executionSummary: string;
  historySummary: string;
  draftDiagnosisSummary: string;
  evidenceReferences: Array<{
    label: string;
    requirementLevel: 'minimum' | 'expected';
    evidenceKind: 'structured-readings' | 'observation-notes' | 'photo-evidence' | 'unmapped';
    satisfied: boolean;
    detail: string;
  }>;
  riskFlags: Array<{
    id: string;
    reasonType: string;
    justificationRequired: boolean;
    justificationText: string;
  }>;
  photoAttachments: Array<{
    evidenceId: string;
    serverEvidenceId: string | null;
    presenceFinalizedAt: string | null;
    syncState: 'local-only' | 'queued' | 'syncing' | 'pending-validation' | 'synced' | 'sync-issue';
  }>;
}

export interface ReportSubmissionResponse {
  contractVersion: typeof REPORT_SUBMISSION_API_CONTRACT_VERSION;
  reportId: string;
  serverReportVersion: string;
  reportState: 'submitted-pending-review';
  lifecycleState: 'Submitted - Pending Supervisor Review';
  syncState: 'synced';
  acceptedAt: string;
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
  submitReportForValidation(request: ReportSubmissionRequest): Promise<ReportSubmissionResponse>;
}

export class EvidenceUploadApiError extends Error {
  readonly statusCode: number;
  readonly kind: 'network' | 'server';
  readonly syncIssue: ReportSubmissionSyncIssue | null;

  constructor(
    message: string,
    statusCode: number,
    kind: 'network' | 'server',
    syncIssue: ReportSubmissionSyncIssue | null = null,
  ) {
    super(message);
    this.name = 'EvidenceUploadApiError';
    this.statusCode = statusCode;
    this.kind = kind;
    this.syncIssue = syncIssue;
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
    submitReportForValidation(request) {
      return postJson<ReportSubmissionResponse>(
        buildUrl(options.baseUrl, '/sync/report-submissions'),
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
        parseReportSubmissionSyncIssue(data.syncIssue),
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

function parseReportSubmissionSyncIssue(value: unknown): ReportSubmissionSyncIssue | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Partial<ReportSubmissionSyncIssue>;
  if (
    !isReportSubmissionIssueReasonCode(candidate.reasonCode) ||
    typeof candidate.message !== 'string'
  ) {
    return null;
  }

  return {
    reasonCode: candidate.reasonCode,
    message: candidate.message,
    serverReportVersion:
      typeof candidate.serverReportVersion === 'string'
        ? candidate.serverReportVersion
        : undefined,
  };
}

function isReportSubmissionIssueReasonCode(
  value: unknown,
): value is ReportSubmissionSyncIssue['reasonCode'] {
  return (
    value === 'out-of-scope' ||
    value === 'malformed-report-payload' ||
    value === 'invalid-lifecycle-transition' ||
    value === 'minimum-evidence-missing' ||
    value === 'required-justification-missing' ||
    value === 'required-evidence-not-finalized' ||
    value === 'conflicting-report-version'
  );
}
