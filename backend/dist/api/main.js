"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../config/env");
const postgres_1 = require("../platform/db/postgres");
const correlation_1 = require("../platform/diagnostics/correlation");
const structuredLogger_1 = require("../platform/diagnostics/structuredLogger");
const serviceRuntime_1 = require("../runtime/serviceRuntime");
const auditEventRepository_1 = require("../modules/audit/auditEventRepository");
const auditEventService_1 = require("../modules/audit/auditEventService");
const authRepository_1 = require("../modules/auth/authRepository");
const authService_1 = require("../modules/auth/authService");
const assignedWorkPackageRepository_1 = require("../modules/work-packages/assignedWorkPackageRepository");
const assignedWorkPackageService_1 = require("../modules/work-packages/assignedWorkPackageService");
const supervisorAuthoringService_1 = require("../modules/work-packages/supervisorAuthoringService");
const instrumentsRepository_1 = require("../modules/instruments/instrumentsRepository");
const instrumentsService_1 = require("../modules/instruments/instrumentsService");
const mobileDiagnosticsRepository_1 = require("../modules/diagnostics/mobileDiagnosticsRepository");
const mobileDiagnosticsService_1 = require("../modules/diagnostics/mobileDiagnosticsService");
const evidenceSyncRepository_1 = require("../modules/evidence-sync/evidenceSyncRepository");
const evidenceSyncService_1 = require("../modules/evidence-sync/evidenceSyncService");
const reportSubmissionRepository_1 = require("../modules/report-submissions/reportSubmissionRepository");
const reportSubmissionService_1 = require("../modules/report-submissions/reportSubmissionService");
const supervisorReviewRepository_1 = require("../modules/review/supervisorReviewRepository");
const supervisorReviewService_1 = require("../modules/review/supervisorReviewService");
const aiDiagnosisRepository_1 = require("../modules/ai-diagnosis/aiDiagnosisRepository");
const aiDiagnosisService_1 = require("../modules/ai-diagnosis/aiDiagnosisService");
const workerJobRepository_1 = require("../modules/worker-jobs/workerJobRepository");
const createApiRequestHandler_1 = require("./createApiRequestHandler");
const objectStorage_1 = require("../platform/storage/objectStorage");
async function main() {
    const environment = (0, env_1.loadServiceEnvironment)('api');
    const pool = (0, postgres_1.createPostgresPool)(environment);
    const logger = (0, structuredLogger_1.createStructuredLogger)({
        serviceName: 'api-service',
        serviceRole: 'api',
        correlationId: (0, correlation_1.generateCorrelationId)(),
    });
    if (!environment.auth) {
        throw new Error('API auth configuration is missing.');
    }
    const authRepository = new authRepository_1.AuthRepository(pool);
    const authService = new authService_1.AuthService(authRepository, environment.auth, new auditEventService_1.AuditEventService(new auditEventRepository_1.AuditEventRepository(pool)));
    await authService.ensureSeedUsers();
    const technician = await authRepository.findByEmail(environment.auth.seedUsers.technician.email);
    if (!technician) {
        throw new Error('Seed technician account is missing after auth bootstrap.');
    }
    const supervisor = await authRepository.findByEmail(environment.auth.seedUsers.supervisor.email);
    if (!supervisor) {
        throw new Error('Seed supervisor account is missing after auth bootstrap.');
    }
    const manager = await authRepository.findByEmail(environment.auth.seedUsers.manager.email);
    if (!manager) {
        throw new Error('Seed manager account is missing after auth bootstrap.');
    }
    const assignedWorkPackageRepository = new assignedWorkPackageRepository_1.AssignedWorkPackageRepository(pool);
    const assignedWorkPackageService = new assignedWorkPackageService_1.AssignedWorkPackageService(assignedWorkPackageRepository);
    await assignedWorkPackageService.ensureSeedPackages(technician.id);
    const seededWorkPackages = await assignedWorkPackageService.listAssignedPackages(technician);
    const instrumentsService = new instrumentsService_1.InstrumentsService(new instrumentsRepository_1.InstrumentsRepository(pool));
    await instrumentsService.ensureSeedInstruments();
    const supervisorAuthoringService = new supervisorAuthoringService_1.SupervisorAuthoringService(instrumentsService, authRepository, assignedWorkPackageRepository);
    const evidenceSyncService = new evidenceSyncService_1.EvidenceSyncService(new evidenceSyncRepository_1.EvidenceSyncRepository(pool), (0, objectStorage_1.createS3EvidenceObjectStorageClient)(environment.objectStorage));
    const mobileDiagnosticsService = new mobileDiagnosticsService_1.MobileDiagnosticsService(new mobileDiagnosticsRepository_1.MobileDiagnosticsRepository(pool));
    // Story 8.9 D-01: wire AI diagnosis service. It needs the report
    // submission repo + work package service to derive the provider input at
    // request time, and the worker job repo to enqueue the background job.
    const reportSubmissionRepository = new reportSubmissionRepository_1.ReportSubmissionRepository(pool);
    const aiDiagnosisRepository = new aiDiagnosisRepository_1.AiDiagnosisRepository(pool);
    const workerJobRepository = new workerJobRepository_1.WorkerJobRepository(pool);
    const aiDiagnosisService = new aiDiagnosisService_1.AiDiagnosisService(aiDiagnosisRepository, workerJobRepository, reportSubmissionRepository, assignedWorkPackageService);
    const reportSubmissionService = new reportSubmissionService_1.ReportSubmissionService(reportSubmissionRepository, assignedWorkPackageService, undefined, {
        aiDiagnosisService,
        onAiEnqueueError: (error, reportId) => {
            logger.warn('ai-diagnosis.enqueue.failed', {
                reportId,
                message: error instanceof Error ? error.message : 'unknown',
            });
        },
    });
    const supervisorReviewService = new supervisorReviewService_1.SupervisorReviewService(new supervisorReviewRepository_1.SupervisorReviewRepository(pool), undefined, manager.id, aiDiagnosisService);
    const managerReviewService = new supervisorReviewService_1.ManagerReviewService(new supervisorReviewRepository_1.SupervisorReviewRepository(pool), undefined, aiDiagnosisService);
    await supervisorReviewService.ensureSeedRoutes(supervisor.id, seededWorkPackages.map((workPackage) => workPackage.id));
    const runtime = (0, serviceRuntime_1.createServiceRuntime)({
        serviceName: 'api-service',
        serviceRole: 'api',
        host: environment.host,
        port: environment.port,
        verifyDatabaseReadiness: () => (0, postgres_1.verifyPostgresConnectivity)(pool),
        logger,
        handleRequest: (0, createApiRequestHandler_1.createApiRequestHandler)({
            authService,
            authRepository,
            assignedWorkPackageService,
            instrumentsService,
            supervisorAuthoringService,
            evidenceSyncService,
            mobileDiagnosticsService,
            managerReviewService,
            reportSubmissionService,
            supervisorReviewService,
            aiDiagnosisService,
        }),
    });
    const { port } = await runtime.start();
    logger.info('api.boot.completed', {
        port,
        readiness: runtime.snapshot(),
    });
    registerShutdown(async () => {
        await runtime.stop();
        await pool.end();
    });
}
function registerShutdown(shutdown) {
    let shuttingDown = false;
    const handler = async () => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        await shutdown();
        process.exit(0);
    };
    process.on('SIGINT', () => void handler());
    process.on('SIGTERM', () => void handler());
}
void main().catch((error) => {
    (0, structuredLogger_1.createStructuredLogger)({
        serviceName: 'api-service',
        serviceRole: 'api',
        correlationId: (0, correlation_1.generateCorrelationId)(),
    }).error('api.boot.failed', error);
    process.exitCode = 1;
});
