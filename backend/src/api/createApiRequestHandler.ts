import type { IncomingMessage, ServerResponse } from 'node:http';

import { AuthenticationError } from '../modules/auth/model';
import type { AuthService } from '../modules/auth/authService';
import {
  EVIDENCE_SYNC_API_CONTRACT_VERSION,
  EvidenceSyncError,
} from '../modules/evidence-sync/model';
import type { EvidenceSyncService } from '../modules/evidence-sync/evidenceSyncService';
import {
  MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
  MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS,
  MobileDiagnosticsError,
} from '../modules/diagnostics/model';
import type { MobileDiagnosticsService } from '../modules/diagnostics/mobileDiagnosticsService';
import {
  ReportSubmissionError,
} from '../modules/report-submissions/model';
import {
  malformedReportSubmissionPayload,
  parseReportSubmissionRequestPayload,
} from '../modules/report-submissions/reportSubmissionPayloadValidation';
import type { ReportSubmissionService } from '../modules/report-submissions/reportSubmissionService';
import { toAiDiagnosisProjection } from '../modules/report-submissions/reportSubmissionService';
import type { AiDiagnosisService } from '../modules/ai-diagnosis/aiDiagnosisService';
import { AiDiagnosisServiceError } from '../modules/ai-diagnosis/model';
import { ManagerReviewError, SupervisorReviewError } from '../modules/review/model';
import type {
  ManagerReviewService,
  SupervisorReviewService,
} from '../modules/review/supervisorReviewService';
import type { AssignedWorkPackageService } from '../modules/work-packages/assignedWorkPackageService';
import {
  SupervisorAuthoringError,
  type CreateSupervisorPackageInput,
  type SupervisorAuthoringService,
} from '../modules/work-packages/supervisorAuthoringService';
import { InstrumentsError } from '../modules/instruments/model';
import type { InstrumentsService } from '../modules/instruments/instrumentsService';
import type { AuthRepository } from '../modules/auth/authRepository';
import type { HttpRequestContext } from '../platform/health/httpHealthServer';

export interface ApiRequestHandlerDependencies {
  authService: AuthService;
  /**
   * Story 9.2: required only when the supervisor authoring endpoints are
   * wired. Optional for legacy bootstraps and unrelated handler tests.
   */
  authRepository?: AuthRepository;
  assignedWorkPackageService: AssignedWorkPackageService;
  /**
   * Story 9.1: instruments catalog service used by the supervisor authoring
   * endpoints. Optional for handler tests that do not exercise the catalog.
   */
  instrumentsService?: InstrumentsService;
  /**
   * Story 9.3: optional. When missing, /supervisor/work-packages returns 503.
   */
  supervisorAuthoringService?: SupervisorAuthoringService;
  evidenceSyncService: EvidenceSyncService;
  mobileDiagnosticsService?: MobileDiagnosticsService;
  reportSubmissionService: ReportSubmissionService;
  managerReviewService: ManagerReviewService;
  supervisorReviewService: SupervisorReviewService;
  /**
   * Story 8.9 D-01: optional AI diagnosis service. When wired, the
   * `POST /reports/:reportId/ai-diagnosis/request` endpoint enqueues a
   * worker job. When omitted (legacy bootstrap), the endpoint returns 503
   * with a clear message so the mobile client can surface "AI indisponivel".
   */
  aiDiagnosisService?: AiDiagnosisService;
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

    if (method === 'POST' && url === '/diagnostics/mobile-errors') {
      try {
        if (!dependencies.mobileDiagnosticsService) {
          throw new MobileDiagnosticsError('Mobile diagnostics service is not configured.', 503);
        }

        const user = await authenticateRequest(request, dependencies.authService);
        const body = await readMobileDiagnosticsJsonBody(request);
        const recorded = await dependencies.mobileDiagnosticsService.reportRuntimeError(user, {
          contractVersion: body.contractVersion as typeof MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
          id: body.id ?? '',
          severity: (body.severity ?? 'error') as 'error',
          errorName: body.errorName ?? '',
          message: body.message ?? '',
          stack: body.stack ?? null,
          capturedAt: body.capturedAt ?? '',
          sessionUserId: body.sessionUserId ?? null,
          sessionRole: (body.sessionRole ?? null) as 'technician' | 'supervisor' | 'manager' | null,
          sessionConnectionMode: (body.sessionConnectionMode ?? null) as 'connected' | 'offline' | null,
          shellRoute: body.shellRoute ?? null,
          devicePlatform: body.devicePlatform ?? '',
          devicePlatformVersion: body.devicePlatformVersion ?? '',
          appEnvironment: body.appEnvironment ?? '',
          apiBaseUrl: body.apiBaseUrl ?? null,
          contextJson: body.contextJson ?? '{}',
        });

        context.logger.info('mobile-diagnostics.runtime-error.recorded', {
          actorId: user.id,
          actorRole: user.role,
          mobileRuntimeErrorId: recorded.id,
          devicePlatform: recorded.devicePlatform,
        });
        writeJson(response, 200, recorded);
      } catch (error) {
        context.logger.warn('mobile-diagnostics.runtime-error.failed', {
          statusCode:
            error instanceof MobileDiagnosticsError
              ? error.statusCode
              : error instanceof AuthenticationError
                ? error.statusCode
                : 500,
        });
        writeMobileDiagnosticsError(response, error);
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
          fileSizeBytes?: number;
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
          typeof body.fileSizeBytes !== 'number' ||
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
          fileSizeBytes: body.fileSizeBytes,
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

    if (method === 'POST' && url === '/sync/evidence-access-authorizations') {
      try {
        const user = await authenticateRequest(request, dependencies.authService);
        const body = await readJsonBody<{
          contractVersion?: string;
          serverEvidenceId?: string;
        }>(request);

        assertEvidenceSyncContractVersion(body.contractVersion);

        if (!body.serverEvidenceId) {
          writeJson(response, 400, { message: 'Evidence access authorization requires serverEvidenceId.' });
          return true;
        }

        const authorization = await dependencies.evidenceSyncService.authorizeBinaryAccess(user, {
          serverEvidenceId: body.serverEvidenceId,
        });

        context.logger.info('evidence.binary-access-authorized', {
          actorId: user.id,
          actorRole: user.role,
          reportId: authorization.reportId,
          evidenceId: authorization.evidenceId,
        });
        writeJson(response, 200, withEvidenceSyncContractVersion(authorization));
      } catch (error) {
        context.logger.warn('evidence.binary-access-authorize.failed', {
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
          'Evidence access authorization failed. Please retry while connected.',
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

    // Story 8.9 D-01: manual AI diagnosis request endpoint. The technician
    // taps "Solicitar diagnostico assistido" on the report screen; the
    // endpoint enqueues a worker job and returns the current state so the
    // mobile UI can immediately show "Pendente". When the worker completes,
    // the supervisor / technician status fetch shows the result. AI is
    // assistive: any error here MUST NOT halt the report itself.
    const aiDiagnosisRequestMatch =
      method === 'POST'
        ? url.match(/^\/reports\/([^/]+)\/ai-diagnosis\/request$/)
        : null;
    if (aiDiagnosisRequestMatch) {
      try {
        const user = await authenticateRequest(request, dependencies.authService);
        const reportId = decodeURIComponent(aiDiagnosisRequestMatch[1] ?? '');

        if (!dependencies.aiDiagnosisService) {
          context.logger.warn('ai-diagnosis.request.unavailable', {
            actorId: user.id,
            reportId,
          });
          writeJson(response, 503, {
            message: 'AI diagnosis service is not configured.',
            aiDiagnosis: toAiDiagnosisProjection(null),
          });
          return true;
        }

        const record = await dependencies.aiDiagnosisService.requestForReport({
          user,
          reportId,
          requestSource: 'manual',
        });

        context.logger.info('ai-diagnosis.request.accepted', {
          actorId: user.id,
          actorRole: user.role,
          reportId,
          state: record.state,
        });
        writeJson(response, 200, { aiDiagnosis: toAiDiagnosisProjection(record) });
      } catch (error) {
        if (error instanceof AiDiagnosisServiceError) {
          context.logger.warn('ai-diagnosis.request.failed', {
            statusCode: error.statusCode,
          });
          writeJson(response, error.statusCode, { message: error.message });
          return true;
        }
        if (error instanceof AuthenticationError) {
          context.logger.warn('ai-diagnosis.request.unauthorized', {
            statusCode: error.statusCode,
          });
          writeJson(response, error.statusCode, { message: error.message });
          return true;
        }
        context.logger.warn('ai-diagnosis.request.failed', { statusCode: 500 });
        writeJson(response, 500, {
          message: 'AI diagnosis request failed. Report submission is unaffected.',
        });
      }

      return true;
    }

    // Story 9.2: supervisor instruments catalog. Used by the mobile authoring
    // flow to render the instrument-picker step. Role-gated to supervisor /
    // manager; technicians get 403.
    if (method === 'GET' && url === '/supervisor/instruments') {
      try {
        if (!dependencies.instrumentsService) {
          writeJson(response, 503, { message: 'Instruments catalog is not configured.' });
          return true;
        }
        const user = await authenticateSupervisorOrManager(
          request,
          dependencies.authService,
        );
        const items = await dependencies.instrumentsService.listInstruments();
        context.logger.info('supervisor-authoring.instruments.list.succeeded', {
          actorId: user.id,
          actorRole: user.role,
          count: items.length,
        });
        writeJson(response, 200, { items });
      } catch (error) {
        context.logger.warn('supervisor-authoring.instruments.list.failed', {
          statusCode:
            error instanceof InstrumentsError
              ? error.statusCode
              : error instanceof AuthenticationError
                ? error.statusCode
                : 500,
        });
        writeSupervisorAuthoringError(
          response,
          error,
          'Instruments catalog failed. Please retry while connected.',
        );
      }

      return true;
    }

    // Story 9.2: supervisor-visible technicians directory. Limited to
    // (id, displayName, email) so other user fields are never exposed.
    if (method === 'GET' && url === '/supervisor/technicians') {
      try {
        if (!dependencies.authRepository) {
          writeJson(response, 503, { message: 'Auth repository is not configured.' });
          return true;
        }
        const user = await authenticateSupervisorOrManager(
          request,
          dependencies.authService,
        );
        const technicians = await dependencies.authRepository.listByRole('technician');
        const items = technicians.map((technician) => ({
          id: technician.id,
          displayName: technician.displayName,
          email: technician.email,
        }));
        context.logger.info('supervisor-authoring.technicians.list.succeeded', {
          actorId: user.id,
          actorRole: user.role,
          count: items.length,
        });
        writeJson(response, 200, { items });
      } catch (error) {
        context.logger.warn('supervisor-authoring.technicians.list.failed', {
          statusCode:
            error instanceof AuthenticationError ? error.statusCode : 500,
        });
        writeSupervisorAuthoringError(
          response,
          error,
          'Technicians directory failed. Please retry while connected.',
        );
      }

      return true;
    }

    // Story 9.3: supervisor-authored work package creation. The body lists
    // instrument ids from the catalog; the server assembles a full snapshot
    // (tags + templates + guidance) and persists it via the same tables that
    // back seeded packages, so the chosen technician sees it on their next
    // refresh and downloads it through the existing GET /work-packages flow.
    if (method === 'POST' && url === '/supervisor/work-packages') {
      try {
        if (!dependencies.supervisorAuthoringService) {
          writeJson(response, 503, {
            message: 'Supervisor authoring service is not configured.',
          });
          return true;
        }
        const user = await authenticateSupervisorOrManager(
          request,
          dependencies.authService,
        );
        const body = await readJsonBody<Record<string, unknown>>(request);
        const input = parseCreateSupervisorPackageBody(body);
        const snapshot = await dependencies.supervisorAuthoringService.createWorkPackage(
          user,
          input,
        );

        context.logger.info('supervisor-authoring.work-package.created', {
          actorId: user.id,
          actorRole: user.role,
          workPackageId: snapshot.summary.id,
          tagCount: snapshot.summary.tagCount,
        });
        writeJson(response, 201, snapshot);
      } catch (error) {
        context.logger.warn('supervisor-authoring.work-package.create.failed', {
          statusCode:
            error instanceof SupervisorAuthoringError
              ? error.statusCode
              : error instanceof InstrumentsError
                ? error.statusCode
                : error instanceof AuthenticationError
                  ? error.statusCode
                  : 500,
        });
        writeSupervisorAuthoringError(
          response,
          error,
          'Work package creation failed. Please retry while connected.',
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

async function authenticateSupervisorOrManager(
  request: IncomingMessage,
  authService: AuthService,
) {
  const user = await authenticateRequest(request, authService);
  if (user.role !== 'supervisor' && user.role !== 'manager') {
    throw new AuthenticationError(
      'Supervisor or manager role is required for this resource.',
      403,
    );
  }
  return user;
}

function parseCreateSupervisorPackageBody(
  body: Record<string, unknown>,
): CreateSupervisorPackageInput {
  const title = typeof body.title === 'string' ? body.title : '';
  const assignedTeam = typeof body.assignedTeam === 'string' ? body.assignedTeam : '';
  const priorityRaw = typeof body.priority === 'string' ? body.priority : '';
  if (priorityRaw !== 'routine' && priorityRaw !== 'high') {
    throw new SupervisorAuthoringError(
      "Priority must be 'routine' or 'high'.",
    );
  }
  const assignedUserId =
    typeof body.assignedUserId === 'string' ? body.assignedUserId : '';
  if (assignedUserId.length === 0) {
    throw new SupervisorAuthoringError('assignedUserId is required.');
  }
  const instrumentIdsRaw = Array.isArray(body.instrumentIds)
    ? (body.instrumentIds as unknown[])
    : [];
  const instrumentIds = instrumentIdsRaw.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  const dueWindowRaw = isRecord(body.dueWindow) ? body.dueWindow : {};
  const startsAt =
    typeof dueWindowRaw.startsAt === 'string' && dueWindowRaw.startsAt.length > 0
      ? dueWindowRaw.startsAt
      : null;
  const endsAt =
    typeof dueWindowRaw.endsAt === 'string' && dueWindowRaw.endsAt.length > 0
      ? dueWindowRaw.endsAt
      : null;

  return {
    title,
    assignedTeam,
    priority: priorityRaw,
    dueWindow: { startsAt, endsAt },
    assignedUserId,
    instrumentIds,
  };
}

function writeSupervisorAuthoringError(
  response: ServerResponse,
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof AuthenticationError) {
    writeAuthError(response, error);
    return;
  }

  if (error instanceof SupervisorAuthoringError) {
    writeJson(response, error.statusCode, {
      message: error.message,
      ...(error.missingIds ? { missingInstrumentIds: error.missingIds } : {}),
    });
    return;
  }

  if (error instanceof InstrumentsError) {
    writeJson(response, error.statusCode, {
      message: error.message,
      ...(error.missingIds ? { missingInstrumentIds: error.missingIds } : {}),
    });
    return;
  }

  writeJson(response, 500, { message: fallbackMessage });
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

type MobileDiagnosticsJsonBody = {
  contractVersion?: string;
  id?: string;
  severity?: string;
  errorName?: string;
  message?: string;
  stack?: string | null;
  capturedAt?: string;
  sessionUserId?: string | null;
  sessionRole?: string | null;
  sessionConnectionMode?: string | null;
  shellRoute?: string | null;
  devicePlatform?: string;
  devicePlatformVersion?: string;
  appEnvironment?: string;
  apiBaseUrl?: string | null;
  contextJson?: string;
};

async function readMobileDiagnosticsJsonBody(
  request: IncomingMessage,
): Promise<MobileDiagnosticsJsonBody> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.requestBodyBytes) {
      throw new MobileDiagnosticsError(
        `Mobile diagnostics request body must not exceed ${MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.requestBodyBytes} bytes.`,
        413,
      );
    }

    chunks.push(buffer);
  }

  try {
    const raw = Buffer.concat(chunks).toString('utf-8');
    const body = raw ? JSON.parse(raw) : {};
    return isRecord(body) ? body : {};
  } catch {
    throw new MobileDiagnosticsError('Mobile diagnostics body must be valid JSON.', 400);
  }
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

function writeMobileDiagnosticsError(response: ServerResponse, error: unknown) {
  if (error instanceof AuthenticationError) {
    writeAuthError(response, error);
    return;
  }

  if (error instanceof MobileDiagnosticsError) {
    writeJson(response, error.statusCode, { message: error.message });
    return;
  }

  writeJson(response, 500, { message: 'Mobile diagnostics capture failed.' });
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
