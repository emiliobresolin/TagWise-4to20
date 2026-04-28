import type { IncomingMessage, ServerResponse } from 'node:http';

import { AuthenticationError } from '../modules/auth/model';
import type { AuthService } from '../modules/auth/authService';
import {
  EVIDENCE_SYNC_API_CONTRACT_VERSION,
  EvidenceSyncError,
} from '../modules/evidence-sync/model';
import type { EvidenceSyncService } from '../modules/evidence-sync/evidenceSyncService';
import {
  ReportSubmissionError,
} from '../modules/report-submissions/model';
import {
  malformedReportSubmissionPayload,
  parseReportSubmissionRequestPayload,
} from '../modules/report-submissions/reportSubmissionPayloadValidation';
import type { ReportSubmissionService } from '../modules/report-submissions/reportSubmissionService';
import { ManagerReviewError, SupervisorReviewError } from '../modules/review/model';
import type {
  ManagerReviewService,
  SupervisorReviewService,
} from '../modules/review/supervisorReviewService';
import type { AssignedWorkPackageService } from '../modules/work-packages/assignedWorkPackageService';
import type { HttpRequestContext } from '../platform/health/httpHealthServer';

export interface ApiRequestHandlerDependencies {
  authService: AuthService;
  assignedWorkPackageService: AssignedWorkPackageService;
  evidenceSyncService: EvidenceSyncService;
  reportSubmissionService: ReportSubmissionService;
  managerReviewService: ManagerReviewService;
  supervisorReviewService: SupervisorReviewService;
}

export function createApiRequestHandler(dependencies: ApiRequestHandlerDependencies) {
  return async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
    context: HttpRequestContext,
  ): Promise<boolean> {
    const method = request.method ?? 'GET';
    const url = request.url ?? '/';

    if (method === 'POST' && url === '/auth/login') {
      const body = await readJsonBody<{ email?: string; password?: string }>(request);
      if (!body.email || !body.password) {
        writeJson(response, 400, { message: 'email and password are required.' });
        return true;
      }

      try {
        const session = await dependencies.authService.loginConnected({
          email: body.email,
          password: body.password,
        }, {
          correlationId: context.correlationId,
        });
        context.logger.info('auth.login.succeeded', {
          actorId: session.user.id,
          actorRole: session.user.role,
        });
        writeJson(response, 200, session);
      } catch (error) {
        context.logger.warn('auth.login.failed', {
          statusCode:
            error instanceof AuthenticationError ? error.statusCode : 500,
        });
        writeAuthError(response, error);
      }

      return true;
    }

    if (method === 'POST' && url === '/auth/refresh') {
      const body = await readJsonBody<{ refreshToken?: string }>(request);
      if (!body.refreshToken) {
        writeJson(response, 400, { message: 'refreshToken is required.' });
        return true;
      }

      try {
        const session = await dependencies.authService.refreshConnected(body.refreshToken, {
          correlationId: context.correlationId,
        });
        context.logger.info('auth.refresh.succeeded', {
          actorId: session.user.id,
          actorRole: session.user.role,
        });
        writeJson(response, 200, session);
      } catch (error) {
        context.logger.warn('auth.refresh.failed', {
          statusCode:
            error instanceof AuthenticationError ? error.statusCode : 500,
        });
        writeAuthError(response, error);
      }

      return true;
    }

    if (method === 'GET' && url === '/work-packages') {
      try {
        const user = await authenticateRequest(request, dependencies.authService);
        const items = await dependencies.assignedWorkPackageService.listAssignedPackages(user);
        context.logger.info('work-packages.list.succeeded', {
          actorId: user.id,
          actorRole: user.role,
          packageCount: items.length,
        });
        writeJson(response, 200, { items });
      } catch (error) {
        context.logger.warn('work-packages.list.failed', {
          statusCode: error instanceof AuthenticationError ? error.statusCode : 500,
        });
        writeWorkPackageError(
          response,
          error,
          'Assigned work package list failed. Please retry while connected.',
        );
      }

      return true;
    }

    const downloadMatch =
      method === 'GET' ? url.match(/^\/work-packages\/([^/]+)\/download$/) : null;
    if (downloadMatch) {
      try {
        const user = await authenticateRequest(request, dependencies.authService);
        const snapshot = await dependencies.assignedWorkPackageService.downloadAssignedPackage(
          user,
          decodeURIComponent(downloadMatch[1] ?? ''),
        );

        if (!snapshot) {
          writeJson(response, 404, { message: 'Assigned work package was not found in scope.' });
          return true;
        }

        context.logger.info('work-packages.download.succeeded', {
          actorId: user.id,
          actorRole: user.role,
          workPackageId: snapshot.summary.id,
          tagCount: snapshot.summary.tagCount,
        });
        writeJson(response, 200, snapshot);
      } catch (error) {
        context.logger.warn('work-packages.download.failed', {
          statusCode: error instanceof AuthenticationError ? error.statusCode : 500,
        });
        writeWorkPackageError(
          response,
          error,
          'Assigned work package download failed. Please retry while connected.',
        );
      }

      return true;
    }

    if (method === 'POST' && url === '/sync/evidence-metadata') {
      try {
        const user = await authenticateRequest(request, dependencies.authService);
        const body = await readJsonBody<{
          contractVersion?: string;
          reportId?: string;
          workPackageId?: string;
          tagId?: string;
          templateId?: string;
          templateVersion?: string;
          evidenceId?: string;
          fileName?: string;
          mimeType?: string | null;
          executionStepId?: 'context' | 'calculation' | 'history' | 'guidance' | 'report';
          source?: 'camera' | 'library';
          localCapturedAt?: string;
          metadataIdempotencyKey?: string;
        }>(request);

        assertEvidenceSyncContractVersion(body.contractVersion);

        if (
          !body.reportId ||
          !body.workPackageId ||
          !body.tagId ||
          !body.templateId ||
          !body.templateVersion ||
          !body.evidenceId ||
          !body.fileName ||
          !body.executionStepId ||
          !body.source ||
          !body.localCapturedAt ||
          !body.metadataIdempotencyKey
        ) {
          writeJson(response, 400, { message: 'Evidence metadata sync requires the full evidence payload.' });
          return true;
        }

        const synced = await dependencies.evidenceSyncService.syncEvidenceMetadata(user, {
          contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
          reportId: body.reportId,
          workPackageId: body.workPackageId,
          tagId: body.tagId,
          templateId: body.templateId,
          templateVersion: body.templateVersion,
          evidenceId: body.evidenceId,
          fileName: body.fileName,
          mimeType: body.mimeType ?? null,
          executionStepId: body.executionStepId,
          source: body.source,
          localCapturedAt: body.localCapturedAt,
          metadataIdempotencyKey: body.metadataIdempotencyKey,
        });

        context.logger.info('evidence.metadata-sync.succeeded', {
          actorId: user.id,
          actorRole: user.role,
          reportId: synced.reportId,
          evidenceId: synced.evidenceId,
        });
        writeJson(response, 200, withEvidenceSyncContractVersion(synced));
      } catch (error) {
        context.logger.warn('evidence.metadata-sync.failed', {
          statusCode:
            error instanceof EvidenceSyncError
              ? error.statusCode
              : error instanceof AuthenticationError
                ? error.statusCode
                : 500,
        });
        writeEvidenceSyncError(
          response,
          error,
          'Evidence metadata sync failed. The local attachment will remain queued.',
        );
      }

      return true;
    }

    if (method === 'POST' && url === '/sync/evidence-upload-authorizations') {
      try {
        const user = await authenticateRequest(request, dependencies.authService);
        const body = await readJsonBody<{
          contractVersion?: string;
          reportId?: string;
          evidenceId?: string;
        }>(request);

        assertEvidenceSyncContractVersion(body.contractVersion);

        if (!body.reportId || !body.evidenceId) {
          writeJson(response, 400, { message: 'Evidence upload authorization requires reportId and evidenceId.' });
          return true;
        }

        const authorization = await dependencies.evidenceSyncService.authorizeBinaryUpload(user, {
          reportId: body.reportId,
          evidenceId: body.evidenceId,
        });

        context.logger.info('evidence.binary-upload-authorized', {
          actorId: user.id,
          actorRole: user.role,
          reportId: authorization.reportId,
          evidenceId: authorization.evidenceId,
        });
        writeJson(response, 200, withEvidenceSyncContractVersion(authorization));
      } catch (error) {
        context.logger.warn('evidence.binary-upload-authorize.failed', {
          statusCode:
            error instanceof EvidenceSyncError
              ? error.statusCode
              : error instanceof AuthenticationError
                ? error.statusCode
                : 500,
        });
        writeEvidenceSyncError(
          response,
          error,
          'Evidence upload authorization failed. The local attachment will remain queued.',
        );
      }

      return true;
    }

    if (method === 'POST' && url === '/sync/evidence-binary-finalizations') {
      try {
        const user = await authenticateRequest(request, dependencies.authService);
        const body = await readJsonBody<{
          contractVersion?: string;
          serverEvidenceId?: string;
        }>(request);

        assertEvidenceSyncContractVersion(body.contractVersion);

        if (!body.serverEvidenceId) {
          writeJson(response, 400, { message: 'Evidence binary finalization requires serverEvidenceId.' });
          return true;
        }

        const finalized = await dependencies.evidenceSyncService.finalizeBinaryUpload(user, {
          serverEvidenceId: body.serverEvidenceId,
        });

        context.logger.info('evidence.binary-finalized', {
          actorId: user.id,
          actorRole: user.role,
          reportId: finalized.reportId,
          evidenceId: finalized.evidenceId,
        });
        writeJson(response, 200, withEvidenceSyncContractVersion(finalized));
      } catch (error) {
        context.logger.warn('evidence.binary-finalize.failed', {
          statusCode:
            error instanceof EvidenceSyncError
              ? error.statusCode
              : error instanceof AuthenticationError
                ? error.statusCode
                : 500,
        });
        writeEvidenceSyncError(
          response,
          error,
          'Evidence binary finalization failed. The local attachment will remain queued until retry.',
        );
      }

      return true;
    }

    if (method === 'POST' && url === '/sync/report-submissions') {
      try {
        const user = await authenticateRequest(request, dependencies.authService);
        const body = await readReportSubmissionJsonBody(request);

        const accepted = await dependencies.reportSubmissionService.submitForValidation(
          user,
          parseReportSubmissionRequestPayload(body),
        );

        context.logger.info('report-submission.validation.accepted', {
          actorId: user.id,
          actorRole: user.role,
          reportId: accepted.reportId,
          serverReportVersion: accepted.serverReportVersion,
        });
        writeJson(response, 200, accepted);
      } catch (error) {
        context.logger.warn('report-submission.validation.failed', {
          statusCode:
            error instanceof ReportSubmissionError
              ? error.statusCode
              : error instanceof AuthenticationError
                ? error.statusCode
                : 500,
        });
        writeReportSubmissionError(
          response,
          error,
          'Report submission validation failed. The local report will remain queued.',
        );
      }

      return true;
    }

    const reportSubmissionStatusMatch =
      method === 'GET' ? url.match(/^\/sync\/report-submissions\/([^/]+)\/status$/) : null;
    if (reportSubmissionStatusMatch) {
      try {
        const user = await authenticateRequest(request, dependencies.authService);
        const status = await dependencies.reportSubmissionService.getReportStatus(
          user,
          decodeURIComponent(reportSubmissionStatusMatch[1] ?? ''),
        );

        context.logger.info('report-submission.status.succeeded', {
          actorId: user.id,
          actorRole: user.role,
          reportId: status.reportId,
          lifecycleState: status.lifecycleState,
        });
        writeJson(response, 200, status);
      } catch (error) {
        context.logger.warn('report-submission.status.failed', {
          statusCode:
            error instanceof ReportSubmissionError
              ? error.statusCode
              : error instanceof AuthenticationError
                ? error.statusCode
                : 500,
        });
        writeReportSubmissionError(
          response,
          error,
          'Report submission status refresh failed. Please retry while connected.',
        );
      }

      return true;
    }

    if (method === 'GET' && url === '/review/supervisor/reports') {
      try {
        const user = await authenticateRequest(request, dependencies.authService);
        const queue = await dependencies.supervisorReviewService.listSupervisorQueue(user);

        context.logger.info('supervisor-review.queue.succeeded', {
          actorId: user.id,
          actorRole: user.role,
          reportCount: queue.items.length,
        });
        writeJson(response, 200, queue);
      } catch (error) {
        context.logger.warn('supervisor-review.queue.failed', {
          statusCode:
            error instanceof SupervisorReviewError
              ? error.statusCode
              : error instanceof AuthenticationError
                ? error.statusCode
                : 500,
        });
        writeSupervisorReviewError(
          response,
          error,
          'Supervisor review queue failed. Please retry while connected.',
        );
      }

      return true;
    }

    if (method === 'GET' && url === '/review/manager/reports') {
      try {
        const user = await authenticateRequest(request, dependencies.authService);
        const queue = await dependencies.managerReviewService.listManagerQueue(user);

        context.logger.info('manager-review.queue.succeeded', {
          actorId: user.id,
          actorRole: user.role,
          reportCount: queue.items.length,
        });
        writeJson(response, 200, queue);
      } catch (error) {
        context.logger.warn('manager-review.queue.failed', {
          statusCode:
            error instanceof ManagerReviewError
              ? error.statusCode
              : error instanceof AuthenticationError
                ? error.statusCode
                : 500,
        });
        writeManagerReviewError(
          response,
          error,
          'Manager review queue failed. Please retry while connected.',
        );
      }

      return true;
    }

    const supervisorReportDecisionMatch =
      method === 'POST'
        ? url.match(/^\/review\/supervisor\/reports\/([^/]+)\/(approve|return|escalate)$/)
        : null;
    if (supervisorReportDecisionMatch) {
      const reportId = decodeURIComponent(supervisorReportDecisionMatch[1] ?? '');
      const action = supervisorReportDecisionMatch[2];

      try {
        const user = await authenticateRequest(request, dependencies.authService);
        let decision: Awaited<ReturnType<SupervisorReviewService['approveStandardReport']>>;
        if (action === 'approve') {
          decision = await dependencies.supervisorReviewService.approveStandardReport(
            user,
            reportId,
            { correlationId: context.correlationId },
          );
        } else if (action === 'return') {
          decision = await dependencies.supervisorReviewService.returnStandardReport(
            user,
            reportId,
            getStringProperty(await readSupervisorReviewJsonBody(request), 'comment'),
            { correlationId: context.correlationId },
          );
        } else {
          decision = await dependencies.supervisorReviewService.escalateHigherRiskReport(
            user,
            reportId,
            getStringProperty(await readSupervisorReviewJsonBody(request), 'rationale'),
            { correlationId: context.correlationId },
          );
        }

        context.logger.info('supervisor-review.decision.succeeded', {
          actorId: user.id,
          actorRole: user.role,
          reportId: decision.reportId,
          decisionType: decision.decisionType,
        });
        writeJson(response, 200, decision);
      } catch (error) {
        context.logger.warn('supervisor-review.decision.failed', {
          statusCode:
            error instanceof SupervisorReviewError
              ? error.statusCode
              : error instanceof AuthenticationError
                ? error.statusCode
                : 500,
        });
        writeSupervisorReviewError(
          response,
          error,
          'Supervisor review decision failed. Please retry while connected.',
        );
      }

      return true;
    }

    const managerReportDecisionMatch =
      method === 'POST'
        ? url.match(/^\/review\/manager\/reports\/([^/]+)\/(approve|return)$/)
        : null;
    if (managerReportDecisionMatch) {
      const reportId = decodeURIComponent(managerReportDecisionMatch[1] ?? '');
      const action = managerReportDecisionMatch[2];

      try {
        const user = await authenticateRequest(request, dependencies.authService);
        const decision =
          action === 'approve'
            ? await dependencies.managerReviewService.approveEscalatedReport(
                user,
                reportId,
                { correlationId: context.correlationId },
              )
            : await dependencies.managerReviewService.returnEscalatedReport(
                user,
                reportId,
                getStringProperty(await readManagerReviewJsonBody(request), 'comment'),
                { correlationId: context.correlationId },
              );

        context.logger.info('manager-review.decision.succeeded', {
          actorId: user.id,
          actorRole: user.role,
          reportId: decision.reportId,
          decisionType: decision.decisionType,
        });
        writeJson(response, 200, decision);
      } catch (error) {
        context.logger.warn('manager-review.decision.failed', {
          statusCode:
            error instanceof ManagerReviewError
              ? error.statusCode
              : error instanceof AuthenticationError
                ? error.statusCode
                : 500,
        });
        writeManagerReviewError(
          response,
          error,
          'Manager review decision failed. Please retry while connected.',
        );
      }

      return true;
    }

    const supervisorReportMatch =
      method === 'GET' ? url.match(/^\/review\/supervisor\/reports\/([^/]+)$/) : null;
    if (supervisorReportMatch) {
      try {
        const user = await authenticateRequest(request, dependencies.authService);
        const report = await dependencies.supervisorReviewService.getSupervisorReportDetail(
          user,
          decodeURIComponent(supervisorReportMatch[1] ?? ''),
        );

        context.logger.info('supervisor-review.detail.succeeded', {
          actorId: user.id,
          actorRole: user.role,
          reportId: report.report.reportId,
        });
        writeJson(response, 200, report);
      } catch (error) {
        context.logger.warn('supervisor-review.detail.failed', {
          statusCode:
            error instanceof SupervisorReviewError
              ? error.statusCode
              : error instanceof AuthenticationError
                ? error.statusCode
                : 500,
        });
        writeSupervisorReviewError(
          response,
          error,
          'Supervisor review report failed. Please retry while connected.',
        );
      }

      return true;
    }

    const managerReportMatch =
      method === 'GET' ? url.match(/^\/review\/manager\/reports\/([^/]+)$/) : null;
    if (managerReportMatch) {
      try {
        const user = await authenticateRequest(request, dependencies.authService);
        const report = await dependencies.managerReviewService.getManagerReportDetail(
          user,
          decodeURIComponent(managerReportMatch[1] ?? ''),
        );

        context.logger.info('manager-review.detail.succeeded', {
          actorId: user.id,
          actorRole: user.role,
          reportId: report.report.reportId,
        });
        writeJson(response, 200, report);
      } catch (error) {
        context.logger.warn('manager-review.detail.failed', {
          statusCode:
            error instanceof ManagerReviewError
              ? error.statusCode
              : error instanceof AuthenticationError
                ? error.statusCode
                : 500,
        });
        writeManagerReviewError(
          response,
          error,
          'Manager review report failed. Please retry while connected.',
        );
      }

      return true;
    }

    return false;
  };
}

async function authenticateRequest(request: IncomingMessage, authService: AuthService) {
  const authorizationHeader = request.headers.authorization;
  if (!authorizationHeader) {
    throw new AuthenticationError('Authorization header is required.');
  }

  const [scheme, token] = authorizationHeader.split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new AuthenticationError('Bearer access token is required.');
  }

  return authService.authenticateAccessToken(token);
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf-8');
  return (raw ? JSON.parse(raw) : {}) as T;
}

async function readReportSubmissionJsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  try {
    return await readJsonBody<Record<string, unknown>>(request);
  } catch {
    throw malformedReportSubmissionPayload('Report submission body must be valid JSON.', 400);
  }
}

async function readSupervisorReviewJsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  try {
    const body = await readJsonBody<unknown>(request);
    return isRecord(body) ? body : {};
  } catch {
    throw new SupervisorReviewError('Supervisor review body must be valid JSON.', 400);
  }
}

async function readManagerReviewJsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  try {
    const body = await readJsonBody<unknown>(request);
    return isRecord(body) ? body : {};
  } catch {
    throw new ManagerReviewError('Manager review body must be valid JSON.', 400);
  }
}

function writeAuthError(response: ServerResponse, error: unknown) {
  if (error instanceof AuthenticationError) {
    writeJson(response, error.statusCode, { message: error.message });
    return;
  }

  writeJson(response, 500, { message: 'Unexpected authentication error.' });
}

function writeWorkPackageError(response: ServerResponse, error: unknown, fallbackMessage: string) {
  if (error instanceof AuthenticationError) {
    writeAuthError(response, error);
    return;
  }

  writeJson(response, 500, { message: fallbackMessage });
}

function writeEvidenceSyncError(response: ServerResponse, error: unknown, fallbackMessage: string) {
  if (error instanceof AuthenticationError) {
    writeAuthError(response, error);
    return;
  }

  if (error instanceof EvidenceSyncError) {
    writeJson(response, error.statusCode, { message: error.message });
    return;
  }

  writeJson(response, 500, { message: fallbackMessage });
}

function writeReportSubmissionError(
  response: ServerResponse,
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof AuthenticationError) {
    writeAuthError(response, error);
    return;
  }

  if (error instanceof ReportSubmissionError) {
    writeJson(response, error.statusCode, {
      message: error.message,
      ...(error.syncIssue ? { syncIssue: error.syncIssue } : {}),
    });
    return;
  }

  writeJson(response, 500, { message: fallbackMessage });
}

function writeSupervisorReviewError(
  response: ServerResponse,
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof AuthenticationError) {
    writeAuthError(response, error);
    return;
  }

  if (error instanceof SupervisorReviewError) {
    writeJson(response, error.statusCode, { message: error.message });
    return;
  }

  writeJson(response, 500, { message: fallbackMessage });
}

function writeManagerReviewError(
  response: ServerResponse,
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof AuthenticationError) {
    writeAuthError(response, error);
    return;
  }

  if (error instanceof ManagerReviewError) {
    writeJson(response, error.statusCode, { message: error.message });
    return;
  }

  writeJson(response, 500, { message: fallbackMessage });
}

function assertEvidenceSyncContractVersion(contractVersion: unknown): void {
  if (contractVersion !== EVIDENCE_SYNC_API_CONTRACT_VERSION) {
    throw new EvidenceSyncError(
      `Evidence sync contractVersion must be ${EVIDENCE_SYNC_API_CONTRACT_VERSION}.`,
      400,
    );
  }
}

function withEvidenceSyncContractVersion<T extends object>(payload: T) {
  return {
    contractVersion: EVIDENCE_SYNC_API_CONTRACT_VERSION,
    ...payload,
  };
}

function getStringProperty(record: Record<string, unknown>, property: string): string {
  const value = record[property];
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}
