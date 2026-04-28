import {
  REPORT_SUBMISSION_API_CONTRACT_VERSION,
  ReportSubmissionError,
  type ReportSubmissionEvidenceReference,
  type ReportSubmissionPhotoAttachment,
  type ReportSubmissionRequest,
  type ReportSubmissionRiskFlag,
  type ReportSubmissionSyncIssue,
} from './model';

export function parseReportSubmissionRequestPayload(
  body: unknown,
): ReportSubmissionRequest {
  if (!isRecord(body)) {
    throw malformedReportSubmissionPayload('Report submission body must be a JSON object.', 400);
  }

  assertReportSubmissionContractVersion(body.contractVersion);

  const evidenceReferences = parseEvidenceReferences(body.evidenceReferences);
  const riskFlags = parseRiskFlags(body.riskFlags);
  const photoAttachments = parsePhotoAttachments(body.photoAttachments);

  return {
    contractVersion: REPORT_SUBMISSION_API_CONTRACT_VERSION,
    reportId: requireNonEmptyString(body.reportId, 'reportId'),
    workPackageId: requireNonEmptyString(body.workPackageId, 'workPackageId'),
    tagId: requireNonEmptyString(body.tagId, 'tagId'),
    templateId: requireNonEmptyString(body.templateId, 'templateId'),
    templateVersion: requireNonEmptyString(body.templateVersion, 'templateVersion'),
    reportState: requireLiteral(
      body.reportState,
      ['submitted-pending-sync'],
      'reportState',
    ),
    lifecycleState: requireLiteral(
      body.lifecycleState,
      ['Submitted - Pending Sync'],
      'lifecycleState',
    ),
    syncState: requireLiteral(
      body.syncState,
      ['queued', 'syncing', 'pending-validation'],
      'syncState',
    ),
    objectVersion: requireNonEmptyString(body.objectVersion, 'objectVersion'),
    idempotencyKey: requireNonEmptyString(body.idempotencyKey, 'idempotencyKey'),
    submittedAt: requireNonEmptyString(body.submittedAt, 'submittedAt'),
    executionSummary: requireString(body.executionSummary, 'executionSummary'),
    historySummary: requireString(body.historySummary, 'historySummary'),
    draftDiagnosisSummary: requireString(body.draftDiagnosisSummary, 'draftDiagnosisSummary'),
    evidenceReferences,
    riskFlags,
    photoAttachments,
  };
}

export function malformedReportSubmissionPayload(message: string, statusCode = 422): ReportSubmissionError {
  const syncIssue: ReportSubmissionSyncIssue = {
    reasonCode: 'malformed-report-payload',
    message,
  };

  return new ReportSubmissionError(message, statusCode, syncIssue);
}

function assertReportSubmissionContractVersion(contractVersion: unknown): void {
  if (contractVersion !== REPORT_SUBMISSION_API_CONTRACT_VERSION) {
    throw malformedReportSubmissionPayload(
      `Report submission contractVersion must be ${REPORT_SUBMISSION_API_CONTRACT_VERSION}.`,
      400,
    );
  }
}

function parseEvidenceReferences(value: unknown): ReportSubmissionEvidenceReference[] {
  if (!Array.isArray(value)) {
    throw malformedReportSubmissionPayload('Report submission evidenceReferences must be an array.');
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw malformedReportSubmissionPayload(`Report submission evidenceReferences[${index}] must be an object.`);
    }

    return {
      label: requireNonEmptyString(item.label, `evidenceReferences[${index}].label`),
      requirementLevel: requireLiteral(
        item.requirementLevel,
        ['minimum', 'expected'],
        `evidenceReferences[${index}].requirementLevel`,
      ),
      evidenceKind: requireLiteral(
        item.evidenceKind,
        ['structured-readings', 'observation-notes', 'photo-evidence', 'unmapped'],
        `evidenceReferences[${index}].evidenceKind`,
      ),
      satisfied: requireBoolean(item.satisfied, `evidenceReferences[${index}].satisfied`),
      detail: requireString(item.detail, `evidenceReferences[${index}].detail`),
    };
  });
}

function parseRiskFlags(value: unknown): ReportSubmissionRiskFlag[] {
  if (!Array.isArray(value)) {
    throw malformedReportSubmissionPayload('Report submission riskFlags must be an array.');
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw malformedReportSubmissionPayload(`Report submission riskFlags[${index}] must be an object.`);
    }

    return {
      id: requireNonEmptyString(item.id, `riskFlags[${index}].id`),
      reasonType: requireNonEmptyString(item.reasonType, `riskFlags[${index}].reasonType`),
      justificationRequired: requireBoolean(
        item.justificationRequired,
        `riskFlags[${index}].justificationRequired`,
      ),
      justificationText: requireString(item.justificationText, `riskFlags[${index}].justificationText`),
    };
  });
}

function parsePhotoAttachments(value: unknown): ReportSubmissionPhotoAttachment[] {
  if (!Array.isArray(value)) {
    throw malformedReportSubmissionPayload('Report submission photoAttachments must be an array.');
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw malformedReportSubmissionPayload(`Report submission photoAttachments[${index}] must be an object.`);
    }

    return {
      evidenceId: requireNonEmptyString(item.evidenceId, `photoAttachments[${index}].evidenceId`),
      serverEvidenceId: requireNullableString(
        item.serverEvidenceId,
        `photoAttachments[${index}].serverEvidenceId`,
      ),
      presenceFinalizedAt: requireNullableString(
        item.presenceFinalizedAt,
        `photoAttachments[${index}].presenceFinalizedAt`,
      ),
      syncState: requireLiteral(
        item.syncState,
        ['local-only', 'queued', 'syncing', 'pending-validation', 'synced', 'sync-issue'],
        `photoAttachments[${index}].syncState`,
      ),
    };
  });
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const stringValue = requireString(value, fieldName);
  if (stringValue.trim().length === 0) {
    throw malformedReportSubmissionPayload(`Report submission ${fieldName} must be a non-empty string.`);
  }

  return stringValue;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw malformedReportSubmissionPayload(`Report submission ${fieldName} must be a string.`);
  }

  return value;
}

function requireNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  return requireString(value, fieldName);
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw malformedReportSubmissionPayload(`Report submission ${fieldName} must be a boolean.`);
  }

  return value;
}

function requireLiteral<const T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  fieldName: string,
): T {
  if (typeof value !== 'string' || !allowedValues.includes(value as T)) {
    throw malformedReportSubmissionPayload(
      `Report submission ${fieldName} has an unsupported value.`,
    );
  }

  return value as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
