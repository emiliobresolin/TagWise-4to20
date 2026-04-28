import { describe, expect, it } from 'vitest';

import {
  REPORT_SUBMISSION_API_CONTRACT_VERSION,
  ReportSubmissionError,
} from './model';
import { parseReportSubmissionRequestPayload } from './reportSubmissionPayloadValidation';

describe('parseReportSubmissionRequestPayload', () => {
  it('rejects a null report-submission body with a structured sync issue', () => {
    const error = captureReportSubmissionError(() =>
      parseReportSubmissionRequestPayload(null),
    );

    expect(error.statusCode).toBe(400);
    expect(error.syncIssue).toEqual({
      reasonCode: 'malformed-report-payload',
      message: 'Report submission body must be a JSON object.',
    });
  });

  it('allows valid empty summary strings while preserving the report-submission contract', () => {
    const parsed = parseReportSubmissionRequestPayload(
      buildPayload({
        executionSummary: '',
        historySummary: '',
        draftDiagnosisSummary: '',
      }),
    );

    expect(parsed).toMatchObject({
      contractVersion: REPORT_SUBMISSION_API_CONTRACT_VERSION,
      executionSummary: '',
      historySummary: '',
      draftDiagnosisSummary: '',
    });
  });

  it('rejects malformed nested evidence references with a structured sync issue', () => {
    const error = captureReportSubmissionError(() =>
      parseReportSubmissionRequestPayload(
        buildPayload({
          evidenceReferences: [
            {
              requirementLevel: 'minimum',
              evidenceKind: 'structured-readings',
              satisfied: true,
              detail: 'missing label',
            },
          ],
        }),
      ),
    );

    expect(error.statusCode).toBe(422);
    expect(error.syncIssue).toEqual({
      reasonCode: 'malformed-report-payload',
      message: 'Report submission evidenceReferences[0].label must be a string.',
    });
  });

  it('rejects malformed nested risk flags before service validation can throw', () => {
    const error = captureReportSubmissionError(() =>
      parseReportSubmissionRequestPayload(
        buildPayload({
          riskFlags: [
            {
              id: 'missing-history',
              reasonType: 'missing-history',
              justificationRequired: true,
            },
          ],
        }),
      ),
    );

    expect(error.statusCode).toBe(422);
    expect(error.syncIssue).toEqual({
      reasonCode: 'malformed-report-payload',
      message: 'Report submission riskFlags[0].justificationText must be a string.',
    });
  });

  it('rejects unsupported report-submission contract versions with a structured sync issue', () => {
    const error = captureReportSubmissionError(() =>
      parseReportSubmissionRequestPayload(
        buildPayload({
          contractVersion: '2026-03-v0',
        }),
      ),
    );

    expect(error.statusCode).toBe(400);
    expect(error.syncIssue).toEqual({
      reasonCode: 'malformed-report-payload',
      message: `Report submission contractVersion must be ${REPORT_SUBMISSION_API_CONTRACT_VERSION}.`,
    });
  });
});

function captureReportSubmissionError(work: () => unknown): ReportSubmissionError {
  try {
    work();
  } catch (error) {
    if (error instanceof ReportSubmissionError) {
      return error;
    }
  }

  throw new Error('Expected ReportSubmissionError.');
}

function buildPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contractVersion: REPORT_SUBMISSION_API_CONTRACT_VERSION,
    reportId: 'tag-report:wp-seed-1001:tag-pt-101',
    workPackageId: 'wp-seed-1001',
    tagId: 'tag-pt-101',
    templateId: 'tpl-pressure-as-found',
    templateVersion: '2026-04-v1',
    reportState: 'submitted-pending-sync',
    lifecycleState: 'Submitted - Pending Sync',
    syncState: 'pending-validation',
    objectVersion: '2026-04-23T14:10:00.000Z',
    idempotencyKey:
      'submit-report:tag-report:wp-seed-1001:tag-pt-101:2026-04-23T14:10:00.000Z',
    submittedAt: '2026-04-23T14:06:00.000Z',
    executionSummary: 'Structured pressure readings are captured.',
    historySummary: 'History available.',
    draftDiagnosisSummary: 'No local diagnosis.',
    evidenceReferences: [
      {
        label: 'as-found readings',
        requirementLevel: 'minimum',
        evidenceKind: 'structured-readings',
        satisfied: true,
        detail: 'Structured readings saved locally.',
      },
    ],
    riskFlags: [
      {
        id: 'missing-history',
        reasonType: 'missing-history',
        justificationRequired: true,
        justificationText: 'Compared against paper record on site.',
      },
    ],
    photoAttachments: [],
    ...overrides,
  };
}
