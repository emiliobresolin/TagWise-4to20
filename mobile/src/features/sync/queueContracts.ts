import type {
  SharedExecutionPhotoAttachmentSource,
  SharedExecutionStepKind,
} from '../execution/model';

export const LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE = 'per-tag-report' as const;
export const SUBMIT_REPORT_QUEUE_ITEM_KIND = 'submit-report' as const;
export const UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND = 'upload-evidence-metadata' as const;
export const UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND = 'upload-evidence-binary' as const;

export interface SubmitReportQueuePayload {
  queueItemSchemaVersion: '2026-04-v1';
  itemType: typeof SUBMIT_REPORT_QUEUE_ITEM_KIND;
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  localObjectReference: {
    businessObjectType: typeof LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE;
    businessObjectId: string;
  };
  objectVersion: string;
  idempotencyKey: string;
  dependencyStatus: 'ready';
  retryCount: number;
  queuedAt: string;
}

export interface UploadEvidenceMetadataQueuePayload {
  queueItemSchemaVersion: '2026-04-v1';
  itemType: typeof UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND;
  reportId: string;
  workPackageId: string;
  tagId: string;
  templateId: string;
  templateVersion: string;
  evidenceId: string;
  fileName: string;
  mimeType: string | null;
  executionStepId: SharedExecutionStepKind;
  source: SharedExecutionPhotoAttachmentSource;
  localObjectReference: {
    businessObjectType: typeof LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE;
    businessObjectId: string;
  };
  objectVersion: string;
  idempotencyKey: string;
  dependencyStatus: 'ready';
  retryCount: number;
  queuedAt: string;
}

export interface UploadEvidenceBinaryQueuePayload {
  queueItemSchemaVersion: '2026-04-v1';
  itemType: typeof UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND;
  reportId: string;
  evidenceId: string;
  mediaRelativePath: string;
  mimeType: string | null;
  executionStepId: SharedExecutionStepKind;
  localObjectReference: {
    businessObjectType: typeof LOCAL_DRAFT_REPORT_BUSINESS_OBJECT_TYPE;
    businessObjectId: string;
  };
  objectVersion: string;
  idempotencyKey: string;
  dependsOnQueueItemId: string;
  dependencyStatus: 'waiting-on-evidence-metadata' | 'ready';
  retryCount: number;
  queuedAt: string;
}

export function buildSubmitReportQueueItemId(reportId: string): string {
  return `${SUBMIT_REPORT_QUEUE_ITEM_KIND}:${reportId}`;
}

export function buildUploadEvidenceMetadataQueueItemId(evidenceId: string): string {
  return `${UPLOAD_EVIDENCE_METADATA_QUEUE_ITEM_KIND}:${evidenceId}`;
}

export function buildUploadEvidenceBinaryQueueItemId(evidenceId: string): string {
  return `${UPLOAD_EVIDENCE_BINARY_QUEUE_ITEM_KIND}:${evidenceId}`;
}
