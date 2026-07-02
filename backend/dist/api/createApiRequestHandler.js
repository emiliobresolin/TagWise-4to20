"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiRequestHandler = createApiRequestHandler;
const model_1 = require("../modules/auth/model");
const model_2 = require("../modules/evidence-sync/model");
const model_3 = require("../modules/diagnostics/model");
const model_4 = require("../modules/report-submissions/model");
const reportSubmissionPayloadValidation_1 = require("../modules/report-submissions/reportSubmissionPayloadValidation");
const reportSubmissionService_1 = require("../modules/report-submissions/reportSubmissionService");
const model_5 = require("../modules/ai-diagnosis/model");
const model_6 = require("../modules/review/model");
const supervisorAuthoringService_1 = require("../modules/work-packages/supervisorAuthoringService");
const model_7 = require("../modules/instruments/model");
const LOGIN_RATE_LIMIT = { maxAttempts: 10, windowMs: 60_000 };
function createApiRequestHandler(dependencies) {
    // Per-instance rate limiter — scoped here so tests get independent state per handler
    const loginAttempts = new Map();
    function checkLoginRateLimit(ip) {
        const now = Date.now();
        const entry = loginAttempts.get(ip);
        if (!entry || now - entry.windowStart > LOGIN_RATE_LIMIT.windowMs) {
            loginAttempts.set(ip, { count: 1, windowStart: now });
            return;
        }
        if (entry.count >= LOGIN_RATE_LIMIT.maxAttempts) {
            throw Object.assign(new Error('Too many login attempts. Try again in a minute.'), { statusCode: 429 });
        }
        entry.count++;
    }
    return async function handleRequest(request, response, context) {
        const method = request.method ?? 'GET';
        const url = request.url ?? '/';
        if (method === 'POST' && url === '/auth/login') {
            const body = await readJsonBody(request);
            if (!body.email || !body.password) {
                writeJson(response, 400, { message: 'email and password are required.' });
                return true;
            }
            try {
                checkLoginRateLimit(request.socket.remoteAddress ?? 'unknown');
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
            }
            catch (error) {
                const statusCode = error instanceof model_1.AuthenticationError
                    ? error.statusCode
                    : isErrorWithStatusCode(error)
                        ? error.statusCode
                        : 500;
                context.logger.warn('auth.login.failed', { statusCode });
                if (isErrorWithStatusCode(error) && !(error instanceof model_1.AuthenticationError)) {
                    writeJson(response, error.statusCode, { message: error.message });
                }
                else {
                    writeAuthError(response, error);
                }
            }
            return true;
        }
        if (method === 'POST' && url === '/auth/refresh') {
            const body = await readJsonBody(request);
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
            }
            catch (error) {
                context.logger.warn('auth.refresh.failed', {
                    statusCode: error instanceof model_1.AuthenticationError ? error.statusCode : 500,
                });
                writeAuthError(response, error);
            }
            return true;
        }
        if (method === 'POST' && url === '/auth/logout') {
            try {
                const session = await authenticateRequest(request, dependencies.authService);
                await dependencies.authService.logoutConnected(session.id, {
                    correlationId: context.correlationId,
                });
                context.logger.info('auth.logout.succeeded', {
                    actorId: session.id,
                    actorRole: session.role,
                });
                writeJson(response, 200, { message: 'Signed out.' });
            }
            catch (error) {
                context.logger.warn('auth.logout.failed', {
                    statusCode: error instanceof model_1.AuthenticationError ? error.statusCode : 500,
                });
                writeAuthError(response, error);
            }
            return true;
        }
        if (method === 'POST' && url === '/diagnostics/mobile-errors') {
            try {
                if (!dependencies.mobileDiagnosticsService) {
                    throw new model_3.MobileDiagnosticsError('Mobile diagnostics service is not configured.', 503);
                }
                const user = await authenticateRequest(request, dependencies.authService);
                const body = await readMobileDiagnosticsJsonBody(request);
                const recorded = await dependencies.mobileDiagnosticsService.reportRuntimeError(user, {
                    contractVersion: body.contractVersion,
                    id: body.id ?? '',
                    severity: (body.severity ?? 'error'),
                    errorName: body.errorName ?? '',
                    message: body.message ?? '',
                    stack: body.stack ?? null,
                    capturedAt: body.capturedAt ?? '',
                    sessionUserId: body.sessionUserId ?? null,
                    sessionRole: (body.sessionRole ?? null),
                    sessionConnectionMode: (body.sessionConnectionMode ?? null),
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
            }
            catch (error) {
                context.logger.warn('mobile-diagnostics.runtime-error.failed', {
                    statusCode: error instanceof model_3.MobileDiagnosticsError
                        ? error.statusCode
                        : error instanceof model_1.AuthenticationError
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
            }
            catch (error) {
                context.logger.warn('work-packages.list.failed', {
                    statusCode: error instanceof model_1.AuthenticationError ? error.statusCode : 500,
                });
                writeWorkPackageError(response, error, 'Assigned work package list failed. Please retry while connected.');
            }
            return true;
        }
        const downloadMatch = method === 'GET' ? url.match(/^\/work-packages\/([^/]+)\/download$/) : null;
        if (downloadMatch) {
            try {
                const user = await authenticateRequest(request, dependencies.authService);
                const snapshot = await dependencies.assignedWorkPackageService.downloadAssignedPackage(user, decodeURIComponent(downloadMatch[1] ?? ''));
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
            }
            catch (error) {
                context.logger.warn('work-packages.download.failed', {
                    statusCode: error instanceof model_1.AuthenticationError ? error.statusCode : 500,
                });
                writeWorkPackageError(response, error, 'Assigned work package download failed. Please retry while connected.');
            }
            return true;
        }
        if (method === 'POST' && url === '/sync/evidence-metadata') {
            try {
                const user = await authenticateRequest(request, dependencies.authService);
                const body = await readJsonBody(request);
                assertEvidenceSyncContractVersion(body.contractVersion);
                if (!body.reportId ||
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
                    !body.metadataIdempotencyKey) {
                    writeJson(response, 400, { message: 'Evidence metadata sync requires the full evidence payload.' });
                    return true;
                }
                const synced = await dependencies.evidenceSyncService.syncEvidenceMetadata(user, {
                    contractVersion: model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION,
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
            }
            catch (error) {
                context.logger.warn('evidence.metadata-sync.failed', {
                    statusCode: error instanceof model_2.EvidenceSyncError
                        ? error.statusCode
                        : error instanceof model_1.AuthenticationError
                            ? error.statusCode
                            : 500,
                });
                writeEvidenceSyncError(response, error, 'Evidence metadata sync failed. The local attachment will remain queued.');
            }
            return true;
        }
        if (method === 'POST' && url === '/sync/evidence-upload-authorizations') {
            try {
                const user = await authenticateRequest(request, dependencies.authService);
                const body = await readJsonBody(request);
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
            }
            catch (error) {
                context.logger.warn('evidence.binary-upload-authorize.failed', {
                    statusCode: error instanceof model_2.EvidenceSyncError
                        ? error.statusCode
                        : error instanceof model_1.AuthenticationError
                            ? error.statusCode
                            : 500,
                });
                writeEvidenceSyncError(response, error, 'Evidence upload authorization failed. The local attachment will remain queued.');
            }
            return true;
        }
        if (method === 'POST' && url === '/sync/evidence-access-authorizations') {
            try {
                const user = await authenticateRequest(request, dependencies.authService);
                const body = await readJsonBody(request);
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
            }
            catch (error) {
                context.logger.warn('evidence.binary-access-authorize.failed', {
                    statusCode: error instanceof model_2.EvidenceSyncError
                        ? error.statusCode
                        : error instanceof model_1.AuthenticationError
                            ? error.statusCode
                            : 500,
                });
                writeEvidenceSyncError(response, error, 'Evidence access authorization failed. Please retry while connected.');
            }
            return true;
        }
        if (method === 'POST' && url === '/sync/evidence-binary-finalizations') {
            try {
                const user = await authenticateRequest(request, dependencies.authService);
                const body = await readJsonBody(request);
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
            }
            catch (error) {
                context.logger.warn('evidence.binary-finalize.failed', {
                    statusCode: error instanceof model_2.EvidenceSyncError
                        ? error.statusCode
                        : error instanceof model_1.AuthenticationError
                            ? error.statusCode
                            : 500,
                });
                writeEvidenceSyncError(response, error, 'Evidence binary finalization failed. The local attachment will remain queued until retry.');
            }
            return true;
        }
        if (method === 'POST' && url === '/sync/report-submissions') {
            try {
                const user = await authenticateRequest(request, dependencies.authService);
                const body = await readReportSubmissionJsonBody(request);
                const accepted = await dependencies.reportSubmissionService.submitForValidation(user, (0, reportSubmissionPayloadValidation_1.parseReportSubmissionRequestPayload)(body));
                context.logger.info('report-submission.validation.accepted', {
                    actorId: user.id,
                    actorRole: user.role,
                    reportId: accepted.reportId,
                    serverReportVersion: accepted.serverReportVersion,
                });
                writeJson(response, 200, accepted);
            }
            catch (error) {
                context.logger.warn('report-submission.validation.failed', {
                    statusCode: error instanceof model_4.ReportSubmissionError
                        ? error.statusCode
                        : error instanceof model_1.AuthenticationError
                            ? error.statusCode
                            : 500,
                });
                writeReportSubmissionError(response, error, 'Report submission validation failed. The local report will remain queued.');
            }
            return true;
        }
        const reportSubmissionStatusMatch = method === 'GET' ? url.match(/^\/sync\/report-submissions\/([^/]+)\/status$/) : null;
        if (reportSubmissionStatusMatch) {
            try {
                const user = await authenticateRequest(request, dependencies.authService);
                const status = await dependencies.reportSubmissionService.getReportStatus(user, decodeURIComponent(reportSubmissionStatusMatch[1] ?? ''));
                context.logger.info('report-submission.status.succeeded', {
                    actorId: user.id,
                    actorRole: user.role,
                    reportId: status.reportId,
                    lifecycleState: status.lifecycleState,
                });
                writeJson(response, 200, status);
            }
            catch (error) {
                context.logger.warn('report-submission.status.failed', {
                    statusCode: error instanceof model_4.ReportSubmissionError
                        ? error.statusCode
                        : error instanceof model_1.AuthenticationError
                            ? error.statusCode
                            : 500,
                });
                writeReportSubmissionError(response, error, 'Report submission status refresh failed. Please retry while connected.');
            }
            return true;
        }
        // Story 8.9 D-01: manual AI diagnosis request endpoint. The technician
        // taps "Solicitar diagnostico assistido" on the report screen; the
        // endpoint enqueues a worker job and returns the current state so the
        // mobile UI can immediately show "Pendente". When the worker completes,
        // the supervisor / technician status fetch shows the result. AI is
        // assistive: any error here MUST NOT halt the report itself.
        const aiDiagnosisRequestMatch = method === 'POST'
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
                        aiDiagnosis: (0, reportSubmissionService_1.toAiDiagnosisProjection)(null),
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
                writeJson(response, 200, { aiDiagnosis: (0, reportSubmissionService_1.toAiDiagnosisProjection)(record) });
            }
            catch (error) {
                if (error instanceof model_5.AiDiagnosisServiceError) {
                    context.logger.warn('ai-diagnosis.request.failed', {
                        statusCode: error.statusCode,
                    });
                    writeJson(response, error.statusCode, { message: error.message });
                    return true;
                }
                if (error instanceof model_1.AuthenticationError) {
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
                const user = await authenticateSupervisorOrManager(request, dependencies.authService);
                const items = await dependencies.instrumentsService.listInstruments();
                context.logger.info('supervisor-authoring.instruments.list.succeeded', {
                    actorId: user.id,
                    actorRole: user.role,
                    count: items.length,
                });
                writeJson(response, 200, { items });
            }
            catch (error) {
                context.logger.warn('supervisor-authoring.instruments.list.failed', {
                    statusCode: error instanceof model_7.InstrumentsError
                        ? error.statusCode
                        : error instanceof model_1.AuthenticationError
                            ? error.statusCode
                            : 500,
                });
                writeSupervisorAuthoringError(response, error, 'Instruments catalog failed. Please retry while connected.');
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
                const user = await authenticateSupervisorOrManager(request, dependencies.authService);
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
            }
            catch (error) {
                context.logger.warn('supervisor-authoring.technicians.list.failed', {
                    statusCode: error instanceof model_1.AuthenticationError ? error.statusCode : 500,
                });
                writeSupervisorAuthoringError(response, error, 'Technicians directory failed. Please retry while connected.');
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
                const user = await authenticateSupervisorOrManager(request, dependencies.authService);
                const body = await readJsonBody(request);
                const input = parseCreateSupervisorPackageBody(body);
                const snapshot = await dependencies.supervisorAuthoringService.createWorkPackage(user, input);
                context.logger.info('supervisor-authoring.work-package.created', {
                    actorId: user.id,
                    actorRole: user.role,
                    workPackageId: snapshot.summary.id,
                    tagCount: snapshot.summary.tagCount,
                });
                writeJson(response, 201, snapshot);
            }
            catch (error) {
                context.logger.warn('supervisor-authoring.work-package.create.failed', {
                    statusCode: error instanceof supervisorAuthoringService_1.SupervisorAuthoringError
                        ? error.statusCode
                        : error instanceof model_7.InstrumentsError
                            ? error.statusCode
                            : error instanceof model_1.AuthenticationError
                                ? error.statusCode
                                : 500,
                });
                writeSupervisorAuthoringError(response, error, 'Work package creation failed. Please retry while connected.');
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
            }
            catch (error) {
                context.logger.warn('supervisor-review.queue.failed', {
                    statusCode: error instanceof model_6.SupervisorReviewError
                        ? error.statusCode
                        : error instanceof model_1.AuthenticationError
                            ? error.statusCode
                            : 500,
                });
                writeSupervisorReviewError(response, error, 'Supervisor review queue failed. Please retry while connected.');
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
            }
            catch (error) {
                context.logger.warn('manager-review.queue.failed', {
                    statusCode: error instanceof model_6.ManagerReviewError
                        ? error.statusCode
                        : error instanceof model_1.AuthenticationError
                            ? error.statusCode
                            : 500,
                });
                writeManagerReviewError(response, error, 'Manager review queue failed. Please retry while connected.');
            }
            return true;
        }
        const supervisorReportDecisionMatch = method === 'POST'
            ? url.match(/^\/review\/supervisor\/reports\/([^/]+)\/(approve|return|escalate)$/)
            : null;
        if (supervisorReportDecisionMatch) {
            const reportId = decodeURIComponent(supervisorReportDecisionMatch[1] ?? '');
            const action = supervisorReportDecisionMatch[2];
            try {
                const user = await authenticateRequest(request, dependencies.authService);
                let decision;
                if (action === 'approve') {
                    decision = await dependencies.supervisorReviewService.approveStandardReport(user, reportId, { correlationId: context.correlationId });
                }
                else if (action === 'return') {
                    decision = await dependencies.supervisorReviewService.returnStandardReport(user, reportId, getStringProperty(await readSupervisorReviewJsonBody(request), 'comment'), { correlationId: context.correlationId });
                }
                else {
                    decision = await dependencies.supervisorReviewService.escalateHigherRiskReport(user, reportId, getStringProperty(await readSupervisorReviewJsonBody(request), 'rationale'), { correlationId: context.correlationId });
                }
                context.logger.info('supervisor-review.decision.succeeded', {
                    actorId: user.id,
                    actorRole: user.role,
                    reportId: decision.reportId,
                    decisionType: decision.decisionType,
                });
                writeJson(response, 200, decision);
            }
            catch (error) {
                context.logger.warn('supervisor-review.decision.failed', {
                    statusCode: error instanceof model_6.SupervisorReviewError
                        ? error.statusCode
                        : error instanceof model_1.AuthenticationError
                            ? error.statusCode
                            : 500,
                });
                writeSupervisorReviewError(response, error, 'Supervisor review decision failed. Please retry while connected.');
            }
            return true;
        }
        const managerReportDecisionMatch = method === 'POST'
            ? url.match(/^\/review\/manager\/reports\/([^/]+)\/(approve|return)$/)
            : null;
        if (managerReportDecisionMatch) {
            const reportId = decodeURIComponent(managerReportDecisionMatch[1] ?? '');
            const action = managerReportDecisionMatch[2];
            try {
                const user = await authenticateRequest(request, dependencies.authService);
                const decision = action === 'approve'
                    ? await dependencies.managerReviewService.approveEscalatedReport(user, reportId, { correlationId: context.correlationId })
                    : await dependencies.managerReviewService.returnEscalatedReport(user, reportId, getStringProperty(await readManagerReviewJsonBody(request), 'comment'), { correlationId: context.correlationId });
                context.logger.info('manager-review.decision.succeeded', {
                    actorId: user.id,
                    actorRole: user.role,
                    reportId: decision.reportId,
                    decisionType: decision.decisionType,
                });
                writeJson(response, 200, decision);
            }
            catch (error) {
                context.logger.warn('manager-review.decision.failed', {
                    statusCode: error instanceof model_6.ManagerReviewError
                        ? error.statusCode
                        : error instanceof model_1.AuthenticationError
                            ? error.statusCode
                            : 500,
                });
                writeManagerReviewError(response, error, 'Manager review decision failed. Please retry while connected.');
            }
            return true;
        }
        const supervisorReportMatch = method === 'GET' ? url.match(/^\/review\/supervisor\/reports\/([^/]+)$/) : null;
        if (supervisorReportMatch) {
            try {
                const user = await authenticateRequest(request, dependencies.authService);
                const report = await dependencies.supervisorReviewService.getSupervisorReportDetail(user, decodeURIComponent(supervisorReportMatch[1] ?? ''));
                context.logger.info('supervisor-review.detail.succeeded', {
                    actorId: user.id,
                    actorRole: user.role,
                    reportId: report.report.reportId,
                });
                writeJson(response, 200, report);
            }
            catch (error) {
                context.logger.warn('supervisor-review.detail.failed', {
                    statusCode: error instanceof model_6.SupervisorReviewError
                        ? error.statusCode
                        : error instanceof model_1.AuthenticationError
                            ? error.statusCode
                            : 500,
                });
                writeSupervisorReviewError(response, error, 'Supervisor review report failed. Please retry while connected.');
            }
            return true;
        }
        const managerReportMatch = method === 'GET' ? url.match(/^\/review\/manager\/reports\/([^/]+)$/) : null;
        if (managerReportMatch) {
            try {
                const user = await authenticateRequest(request, dependencies.authService);
                const report = await dependencies.managerReviewService.getManagerReportDetail(user, decodeURIComponent(managerReportMatch[1] ?? ''));
                context.logger.info('manager-review.detail.succeeded', {
                    actorId: user.id,
                    actorRole: user.role,
                    reportId: report.report.reportId,
                });
                writeJson(response, 200, report);
            }
            catch (error) {
                context.logger.warn('manager-review.detail.failed', {
                    statusCode: error instanceof model_6.ManagerReviewError
                        ? error.statusCode
                        : error instanceof model_1.AuthenticationError
                            ? error.statusCode
                            : 500,
                });
                writeManagerReviewError(response, error, 'Manager review report failed. Please retry while connected.');
            }
            return true;
        }
        return false;
    };
}
async function authenticateSupervisorOrManager(request, authService) {
    const user = await authenticateRequest(request, authService);
    if (user.role !== 'supervisor' && user.role !== 'manager') {
        throw new model_1.AuthenticationError('Supervisor or manager role is required for this resource.', 403);
    }
    return user;
}
function parseCreateSupervisorPackageBody(body) {
    const title = typeof body.title === 'string' ? body.title : '';
    const assignedTeam = typeof body.assignedTeam === 'string' ? body.assignedTeam : '';
    const priorityRaw = typeof body.priority === 'string' ? body.priority : '';
    if (priorityRaw !== 'routine' && priorityRaw !== 'high') {
        throw new supervisorAuthoringService_1.SupervisorAuthoringError("Priority must be 'routine' or 'high'.");
    }
    const assignedUserId = typeof body.assignedUserId === 'string' ? body.assignedUserId : '';
    if (assignedUserId.length === 0) {
        throw new supervisorAuthoringService_1.SupervisorAuthoringError('assignedUserId is required.');
    }
    const instrumentIdsRaw = Array.isArray(body.instrumentIds)
        ? body.instrumentIds
        : [];
    const instrumentIds = instrumentIdsRaw.filter((id) => typeof id === 'string' && id.length > 0);
    const dueWindowRaw = isRecord(body.dueWindow) ? body.dueWindow : {};
    const startsAt = typeof dueWindowRaw.startsAt === 'string' && dueWindowRaw.startsAt.length > 0
        ? dueWindowRaw.startsAt
        : null;
    const endsAt = typeof dueWindowRaw.endsAt === 'string' && dueWindowRaw.endsAt.length > 0
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
function writeSupervisorAuthoringError(response, error, fallbackMessage) {
    if (error instanceof model_1.AuthenticationError) {
        writeAuthError(response, error);
        return;
    }
    if (error instanceof supervisorAuthoringService_1.SupervisorAuthoringError) {
        writeJson(response, error.statusCode, {
            message: error.message,
            ...(error.missingIds ? { missingInstrumentIds: error.missingIds } : {}),
        });
        return;
    }
    if (error instanceof model_7.InstrumentsError) {
        writeJson(response, error.statusCode, {
            message: error.message,
            ...(error.missingIds ? { missingInstrumentIds: error.missingIds } : {}),
        });
        return;
    }
    writeJson(response, 500, { message: fallbackMessage });
}
async function authenticateRequest(request, authService) {
    const authorizationHeader = request.headers.authorization;
    if (!authorizationHeader) {
        throw new model_1.AuthenticationError('Authorization header is required.');
    }
    const [scheme, token] = authorizationHeader.split(/\s+/);
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
        throw new model_1.AuthenticationError('Bearer access token is required.');
    }
    return authService.authenticateAccessToken(token);
}
async function readJsonBody(request) {
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.length;
        if (totalBytes > 2 * 1024 * 1024) {
            throw new Error('Request body too large.');
        }
        chunks.push(buffer);
    }
    const raw = Buffer.concat(chunks).toString('utf-8');
    try {
        return (raw ? JSON.parse(raw) : {});
    }
    catch {
        throw Object.assign(new Error('Request body is not valid JSON.'), { statusCode: 400 });
    }
}
async function readMobileDiagnosticsJsonBody(request) {
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.length;
        if (totalBytes > model_3.MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.requestBodyBytes) {
            throw new model_3.MobileDiagnosticsError(`Mobile diagnostics request body must not exceed ${model_3.MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.requestBodyBytes} bytes.`, 413);
        }
        chunks.push(buffer);
    }
    try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        const body = raw ? JSON.parse(raw) : {};
        return isRecord(body) ? body : {};
    }
    catch {
        throw new model_3.MobileDiagnosticsError('Mobile diagnostics body must be valid JSON.', 400);
    }
}
async function readReportSubmissionJsonBody(request) {
    try {
        return await readJsonBody(request);
    }
    catch {
        throw (0, reportSubmissionPayloadValidation_1.malformedReportSubmissionPayload)('Report submission body must be valid JSON.', 400);
    }
}
async function readSupervisorReviewJsonBody(request) {
    try {
        const body = await readJsonBody(request);
        return isRecord(body) ? body : {};
    }
    catch {
        throw new model_6.SupervisorReviewError('Supervisor review body must be valid JSON.', 400);
    }
}
async function readManagerReviewJsonBody(request) {
    try {
        const body = await readJsonBody(request);
        return isRecord(body) ? body : {};
    }
    catch {
        throw new model_6.ManagerReviewError('Manager review body must be valid JSON.', 400);
    }
}
function writeAuthError(response, error) {
    if (error instanceof model_1.AuthenticationError) {
        writeJson(response, error.statusCode, { message: error.message });
        return;
    }
    writeJson(response, 500, { message: 'Unexpected authentication error.' });
}
function writeWorkPackageError(response, error, fallbackMessage) {
    if (error instanceof model_1.AuthenticationError) {
        writeAuthError(response, error);
        return;
    }
    writeJson(response, 500, { message: fallbackMessage });
}
function writeMobileDiagnosticsError(response, error) {
    if (error instanceof model_1.AuthenticationError) {
        writeAuthError(response, error);
        return;
    }
    if (error instanceof model_3.MobileDiagnosticsError) {
        writeJson(response, error.statusCode, { message: error.message });
        return;
    }
    writeJson(response, 500, { message: 'Mobile diagnostics capture failed.' });
}
function writeEvidenceSyncError(response, error, fallbackMessage) {
    if (error instanceof model_1.AuthenticationError) {
        writeAuthError(response, error);
        return;
    }
    if (error instanceof model_2.EvidenceSyncError) {
        writeJson(response, error.statusCode, { message: error.message });
        return;
    }
    writeJson(response, 500, { message: fallbackMessage });
}
function writeReportSubmissionError(response, error, fallbackMessage) {
    if (error instanceof model_1.AuthenticationError) {
        writeAuthError(response, error);
        return;
    }
    if (error instanceof model_4.ReportSubmissionError) {
        writeJson(response, error.statusCode, {
            message: error.message,
            ...(error.syncIssue ? { syncIssue: error.syncIssue } : {}),
        });
        return;
    }
    writeJson(response, 500, { message: fallbackMessage });
}
function writeSupervisorReviewError(response, error, fallbackMessage) {
    if (error instanceof model_1.AuthenticationError) {
        writeAuthError(response, error);
        return;
    }
    if (error instanceof model_6.SupervisorReviewError) {
        writeJson(response, error.statusCode, { message: error.message });
        return;
    }
    writeJson(response, 500, { message: fallbackMessage });
}
function writeManagerReviewError(response, error, fallbackMessage) {
    if (error instanceof model_1.AuthenticationError) {
        writeAuthError(response, error);
        return;
    }
    if (error instanceof model_6.ManagerReviewError) {
        writeJson(response, error.statusCode, { message: error.message });
        return;
    }
    writeJson(response, 500, { message: fallbackMessage });
}
function assertEvidenceSyncContractVersion(contractVersion) {
    if (contractVersion !== model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION) {
        throw new model_2.EvidenceSyncError(`Evidence sync contractVersion must be ${model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION}.`, 400);
    }
}
function withEvidenceSyncContractVersion(payload) {
    return {
        contractVersion: model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION,
        ...payload,
    };
}
function getStringProperty(record, property) {
    const value = record[property];
    return typeof value === 'string' ? value : '';
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isErrorWithStatusCode(error) {
    return (error instanceof Error &&
        'statusCode' in error &&
        typeof error.statusCode === 'number');
}
function writeJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        'content-type': 'application/json; charset=utf-8',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
    });
    response.end(JSON.stringify(payload));
}
