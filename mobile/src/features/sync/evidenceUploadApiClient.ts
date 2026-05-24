import { secureStorageKeys, type SecureKeyValueStore } from '../../platform/secure-storage/secureStorageBoundary';
import type {
  SharedExecutionApprovalHistoryItem,
  SharedExecutionReportLifecycleState,
} from '../execution/model';

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
  fileSizeBytes: number;
  // Story 8.8 D-03: widened to include 'instrument' for tag-detail photos
  // (nameplate / wiring / installation). The canonical type is
  // SharedExecutionStepKind in execution/model.ts; this literal is duplicated
  // here only because the sync API client surface is independent of the
  // execution model to avoid a circular import.
  executionStepId: 'context' | 'instrument' | 'calculation' | 'history' | 'guidance' | 'report';
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

// Story 10.2 (issue #4): supervisor + manager need pre-signed download URLs
// for finalized photo evidence so the review detail screen can render the
// images that the technician attached.
export interface EvidenceBinaryAccessAuthorization {
  contractVersion: typeof EVIDENCE_SYNC_API_CONTRACT_VERSION;
  serverEvidenceId: string;
  reportId: string;
  evidenceId: string;
  downloadUrl: string;
  downloadMethod: 'GET';
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
    // Story 8.8 D-02 / D-04: per-photo execution-step kind + free-form sub-step
    // label + technician free-text observation. All three are optional and
    // backwards-compatible; pre-8.8 mobile builds simply omit them. Backend
    // persists the whole request payload as JSON and the supervisor read path
    // surfaces these fields via payload.photoAttachments.
    contextNote?: string | null;
    executionStepId?:
      | 'context'
      | 'instrument'
      | 'calculation'
      | 'history'
      | 'guidance'
      | 'report'
      | null;
    technicianNote?: string | null;
  }>;
}

export interface ReportSubmissionResponse {
  contractVersion: typeof REPORT_SUBMISSION_API_CONTRACT_VERSION;
  reportId: string;
  serverReportVersion: string;
  reportState:
    | 'submitted-pending-review'
    | 'escalated-pending-manager-review'
    | 'returned-by-supervisor'
    | 'returned-by-manager'
    | 'approved';
  lifecycleState: SharedExecutionReportLifecycleState;
  syncState: 'synced';
  acceptedAt: string;
}

/**
 * Story 8.9 D-01: per-report AI diagnosis payload returned alongside report
 * status. Mirrors the backend `ReportSubmissionAiDiagnosisProjection`. Always
 * present; defaults to state='unavailable' when no row exists on the backend.
 */
export type ReportSubmissionAiDiagnosisState =
  | 'pending'
  | 'available'
  | 'unavailable'
  | 'failed-nonblocking';

export interface ReportSubmissionAiDiagnosisProjection {
  state: ReportSubmissionAiDiagnosisState;
  summary: string | null;
  detail: string | null;
  providerLabel: string | null;
  generatedAt: string | null;
  failureReason: string | null;
  lastRequestedAt: string | null;
}

export interface ReportSubmissionStatusResponse extends ReportSubmissionResponse {
  approvalHistory: {
    items: SharedExecutionApprovalHistoryItem[];
    placeholder: string;
  };
  aiDiagnosis: ReportSubmissionAiDiagnosisProjection;
}

/**
 * Story 8.9 D-01: response of the manual AI request endpoint
 * `POST /reports/:reportId/ai-diagnosis/request`. Wraps the AI projection so
 * the mobile client immediately reflects the current state (typically
 * 'pending' until the worker completes).
 */
export interface AiDiagnosisRequestResponse {
  aiDiagnosis: ReportSubmissionAiDiagnosisProjection;
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
  // Story 10.2 (issue #4): authorize the supervisor / manager to fetch a
  // finalized photo so the review detail screen can render the image.
  authorizeEvidenceBinaryAccess(input: {
    contractVersion: typeof EVIDENCE_SYNC_API_CONTRACT_VERSION;
    serverEvidenceId: string;
  }): Promise<EvidenceBinaryAccessAuthorization>;
  finalizeEvidenceBinaryUpload(input: {
    contractVersion: typeof EVIDENCE_SYNC_API_CONTRACT_VERSION;
    serverEvidenceId: string;
  }): Promise<EvidenceBinaryFinalizationResponse>;
  submitReportForValidation(request: ReportSubmissionRequest): Promise<ReportSubmissionResponse>;
  getReportSubmissionStatus(reportId: string): Promise<ReportSubmissionStatusResponse>;
  /**
   * Story 8.9 D-01: request a manual AI diagnosis for a submitted report.
   * The backend enqueues a worker job and returns the current AI projection
   * (typically state='pending'). Failures are surfaced as
   * `EvidenceUploadApiError`; the report itself is unaffected.
   */
  requestAiDiagnosis(reportId: string): Promise<AiDiagnosisRequestResponse>;
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
    authorizeEvidenceBinaryAccess(request) {
      return postJson<EvidenceBinaryAccessAuthorization>(
        buildUrl(options.baseUrl, '/sync/evidence-access-authorizations'),
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
    getReportSubmissionStatus(reportId) {
      return getJson<ReportSubmissionStatusResponse>(
        buildUrl(
          options.baseUrl,
          `/sync/report-submissions/${encodeURIComponent(reportId)}/status`,
        ),
        options.secureStorage,
        fetchImplementation,
        timeoutMs,
      );
    },
    requestAiDiagnosis(reportId) {
      // Story 8.9 D-01: empty body POST. The backend reads the authenticated
      // user from the bearer token and the report id from the URL.
      return postJson<AiDiagnosisRequestResponse>(
        buildUrl(
          options.baseUrl,
          `/reports/${encodeURIComponent(reportId)}/ai-diagnosis/request`,
        ),
        {},
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
  return requestJson<T>({
    url,
    secureStorage,
    fetchImplementation,
    timeoutMs,
    init: { method: 'GET' },
  });
}

async function postJson<T>(
  url: string,
  payload: unknown,
  secureStorage: SecureKeyValueStore,
  fetchImplementation: typeof fetch,
  timeoutMs: number,
): Promise<T> {
  return requestJson<T>({
    url,
    secureStorage,
    fetchImplementation,
    timeoutMs,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  });
}

async function requestJson<T>(input: {
  url: string;
  secureStorage: SecureKeyValueStore;
  fetchImplementation: typeof fetch;
  timeoutMs: number;
  init: RequestInit;
}): Promise<T> {
  const accessToken = await input.secureStorage.getItem(secureStorageKeys.sessionAccessToken);
  if (!accessToken) {
    throw new EvidenceUploadApiError(
      'Connected session is required before uploading evidence.',
      401,
      'server',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await input.fetchImplementation(input.url, {
      ...input.init,
      headers: {
        ...(input.init.headers ?? {}),
        authorization: `Bearer ${accessToken}`,
      },
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
