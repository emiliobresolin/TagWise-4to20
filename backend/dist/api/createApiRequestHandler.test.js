"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pg_mem_1 = require("pg-mem");
const createApiRequestHandler_1 = require("./createApiRequestHandler");
const auditEventRepository_1 = require("../modules/audit/auditEventRepository");
const auditEventService_1 = require("../modules/audit/auditEventService");
const authRepository_1 = require("../modules/auth/authRepository");
const authService_1 = require("../modules/auth/authService");
const mobileDiagnosticsRepository_1 = require("../modules/diagnostics/mobileDiagnosticsRepository");
const mobileDiagnosticsService_1 = require("../modules/diagnostics/mobileDiagnosticsService");
const model_1 = require("../modules/diagnostics/model");
const evidenceSyncRepository_1 = require("../modules/evidence-sync/evidenceSyncRepository");
const evidenceSyncService_1 = require("../modules/evidence-sync/evidenceSyncService");
const evidencePolicy_1 = require("../modules/evidence-sync/evidencePolicy");
const model_2 = require("../modules/evidence-sync/model");
const reportSubmissionRepository_1 = require("../modules/report-submissions/reportSubmissionRepository");
const reportSubmissionService_1 = require("../modules/report-submissions/reportSubmissionService");
const model_3 = require("../modules/report-submissions/model");
const model_4 = require("../modules/review/model");
const supervisorReviewRepository_1 = require("../modules/review/supervisorReviewRepository");
const supervisorReviewService_1 = require("../modules/review/supervisorReviewService");
const assignedWorkPackageRepository_1 = require("../modules/work-packages/assignedWorkPackageRepository");
const assignedWorkPackageService_1 = require("../modules/work-packages/assignedWorkPackageService");
const serviceRuntime_1 = require("../runtime/serviceRuntime");
const migrations_1 = require("../platform/db/migrations");
const authConfig = {
    tokenSecret: 'unit-test-secret',
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 3600,
    seedUsers: {
        technician: {
            email: 'tech@tagwise.local',
            password: 'TagWise123!',
            displayName: 'Field Technician',
            role: 'technician',
        },
        supervisor: {
            email: 'supervisor@tagwise.local',
            password: 'TagWise123!',
            displayName: 'Field Supervisor',
            role: 'supervisor',
        },
        manager: {
            email: 'manager@tagwise.local',
            password: 'TagWise123!',
            displayName: 'Operations Manager',
            role: 'manager',
        },
    },
};
const runtimes = [];
(0, vitest_1.afterEach)(async () => {
    while (runtimes.length > 0) {
        const runtime = runtimes.pop();
        if (runtime) {
            await runtime.stop();
        }
    }
});
(0, vitest_1.describe)('createApiRequestHandler', () => {
    (0, vitest_1.it)('serves connected login and refresh endpoints on the API runtime', async () => {
        const database = (0, pg_mem_1.newDb)();
        const adapter = database.adapters.createPg();
        const pool = new adapter.Pool();
        await (0, migrations_1.runPostgresMigrations)(pool);
        const auditRepository = new auditEventRepository_1.AuditEventRepository(pool);
        const authService = new authService_1.AuthService(new authRepository_1.AuthRepository(pool), authConfig, new auditEventService_1.AuditEventService(auditRepository));
        await authService.ensureSeedUsers();
        const technician = await new authRepository_1.AuthRepository(pool).findByEmail(authConfig.seedUsers.technician.email);
        if (!technician) {
            throw new Error('Missing seeded technician for test.');
        }
        const assignedWorkPackageService = new assignedWorkPackageService_1.AssignedWorkPackageService(new assignedWorkPackageRepository_1.AssignedWorkPackageRepository(pool));
        await assignedWorkPackageService.ensureSeedPackages(technician.id);
        const evidenceSyncService = new evidenceSyncService_1.EvidenceSyncService(new evidenceSyncRepository_1.EvidenceSyncRepository(pool), createTestEvidenceObjectStorageClient());
        const reportSubmissionService = new reportSubmissionService_1.ReportSubmissionService(new reportSubmissionRepository_1.ReportSubmissionRepository(pool), assignedWorkPackageService);
        const runtime = (0, serviceRuntime_1.createServiceRuntime)({
            serviceName: 'api-service',
            serviceRole: 'api',
            host: '127.0.0.1',
            port: 0,
            verifyDatabaseReadiness: async () => undefined,
            handleRequest: (0, createApiRequestHandler_1.createApiRequestHandler)({
                authService,
                assignedWorkPackageService,
                evidenceSyncService,
                managerReviewService: new supervisorReviewService_1.ManagerReviewService(new supervisorReviewRepository_1.SupervisorReviewRepository(pool)),
                reportSubmissionService,
                supervisorReviewService: new supervisorReviewService_1.SupervisorReviewService(new supervisorReviewRepository_1.SupervisorReviewRepository(pool)),
            }),
        });
        runtimes.push(runtime);
        const { port } = await runtime.start();
        const login = await fetch(`http://127.0.0.1:${port}/auth/login`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-correlation-id': 'corr-api-login',
            },
            body: JSON.stringify({
                email: authConfig.seedUsers.supervisor.email,
                password: authConfig.seedUsers.supervisor.password,
            }),
        });
        (0, vitest_1.expect)(login.status).toBe(200);
        (0, vitest_1.expect)(login.headers.get('x-correlation-id')).toBe('corr-api-login');
        const loginBody = (await login.json());
        (0, vitest_1.expect)(loginBody.user.role).toBe('supervisor');
        const refresh = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                refreshToken: loginBody.tokens.refreshToken,
            }),
        });
        (0, vitest_1.expect)(refresh.status).toBe(200);
        (0, vitest_1.expect)((await refresh.json()).user.role).toBe('supervisor');
        const metrics = await fetch(`http://127.0.0.1:${port}/metrics`);
        const metricsBody = (await metrics.json());
        (0, vitest_1.expect)(metrics.status).toBe(200);
        (0, vitest_1.expect)(metricsBody.requestCount).toBeGreaterThanOrEqual(2);
        (0, vitest_1.expect)(metricsBody.errorRate).toBe(0);
        const auditEvents = await auditRepository.listEventsByTarget('user-session', loginBody.user.id);
        (0, vitest_1.expect)(auditEvents).toHaveLength(2);
        (0, vitest_1.expect)(auditEvents[0]?.correlationId).toBe('corr-api-login');
        (0, vitest_1.expect)(auditEvents[1]?.correlationId).toBeTruthy();
        await pool.end();
    });
    (0, vitest_1.it)('lists and downloads assigned work packages for an authenticated technician', async () => {
        const database = (0, pg_mem_1.newDb)();
        const adapter = database.adapters.createPg();
        const pool = new adapter.Pool();
        await (0, migrations_1.runPostgresMigrations)(pool);
        const authRepository = new authRepository_1.AuthRepository(pool);
        const authService = new authService_1.AuthService(authRepository, authConfig, new auditEventService_1.AuditEventService(new auditEventRepository_1.AuditEventRepository(pool)));
        await authService.ensureSeedUsers();
        const technician = await authRepository.findByEmail(authConfig.seedUsers.technician.email);
        if (!technician) {
            throw new Error('Missing seeded technician for work package test.');
        }
        const assignedWorkPackageService = new assignedWorkPackageService_1.AssignedWorkPackageService(new assignedWorkPackageRepository_1.AssignedWorkPackageRepository(pool));
        await assignedWorkPackageService.ensureSeedPackages(technician.id);
        const evidenceSyncService = new evidenceSyncService_1.EvidenceSyncService(new evidenceSyncRepository_1.EvidenceSyncRepository(pool), createTestEvidenceObjectStorageClient());
        const reportSubmissionService = new reportSubmissionService_1.ReportSubmissionService(new reportSubmissionRepository_1.ReportSubmissionRepository(pool), assignedWorkPackageService);
        const runtime = (0, serviceRuntime_1.createServiceRuntime)({
            serviceName: 'api-service',
            serviceRole: 'api',
            host: '127.0.0.1',
            port: 0,
            verifyDatabaseReadiness: async () => undefined,
            handleRequest: (0, createApiRequestHandler_1.createApiRequestHandler)({
                authService,
                assignedWorkPackageService,
                evidenceSyncService,
                managerReviewService: new supervisorReviewService_1.ManagerReviewService(new supervisorReviewRepository_1.SupervisorReviewRepository(pool)),
                reportSubmissionService,
                supervisorReviewService: new supervisorReviewService_1.SupervisorReviewService(new supervisorReviewRepository_1.SupervisorReviewRepository(pool)),
            }),
        });
        runtimes.push(runtime);
        const { port } = await runtime.start();
        const login = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-work-package-login',
        });
        const listResponse = await fetch(`http://127.0.0.1:${port}/work-packages`, {
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'x-correlation-id': 'corr-work-package-list',
            },
        });
        const listBody = (await listResponse.json());
        (0, vitest_1.expect)(listResponse.status).toBe(200);
        (0, vitest_1.expect)(listResponse.headers.get('x-correlation-id')).toBe('corr-work-package-list');
        (0, vitest_1.expect)(listBody.items).toHaveLength(2);
        (0, vitest_1.expect)(listBody.items[0]?.tagCount).toBeGreaterThan(0);
        (0, vitest_1.expect)(listBody.items[0]?.snapshotContractVersion).toBe('2026-04-v1');
        const downloadResponse = await fetch(`http://127.0.0.1:${port}/work-packages/${listBody.items[0]?.id}/download`, {
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'x-correlation-id': 'corr-work-package-download',
            },
        });
        const downloadBody = (await downloadResponse.json());
        (0, vitest_1.expect)(downloadResponse.status).toBe(200);
        (0, vitest_1.expect)(downloadBody.contractVersion).toBe('2026-04-v1');
        (0, vitest_1.expect)(downloadBody.summary.id).toBe(listBody.items[0]?.id);
        (0, vitest_1.expect)(downloadBody.tags.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(downloadBody.templates.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(downloadBody.guidance.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(downloadBody.historySummaries.length).toBeGreaterThan(0);
        const unauthorizedResponse = await fetch(`http://127.0.0.1:${port}/work-packages`);
        (0, vitest_1.expect)(unauthorizedResponse.status).toBe(401);
        await pool.end();
    });
    (0, vitest_1.it)('returns actionable non-auth failure messages for work package endpoints', async () => {
        const database = (0, pg_mem_1.newDb)();
        const adapter = database.adapters.createPg();
        const pool = new adapter.Pool();
        await (0, migrations_1.runPostgresMigrations)(pool);
        const authRepository = new authRepository_1.AuthRepository(pool);
        const authService = new authService_1.AuthService(authRepository, authConfig, new auditEventService_1.AuditEventService(new auditEventRepository_1.AuditEventRepository(pool)));
        await authService.ensureSeedUsers();
        const assignedWorkPackageService = {
            listAssignedPackages: async () => {
                throw new Error('database unavailable');
            },
            downloadAssignedPackage: async () => {
                throw new Error('storage unavailable');
            },
            ensureSeedPackages: async () => undefined,
        };
        const runtime = (0, serviceRuntime_1.createServiceRuntime)({
            serviceName: 'api-service',
            serviceRole: 'api',
            host: '127.0.0.1',
            port: 0,
            verifyDatabaseReadiness: async () => undefined,
            handleRequest: (0, createApiRequestHandler_1.createApiRequestHandler)({
                authService,
                assignedWorkPackageService,
                evidenceSyncService: new evidenceSyncService_1.EvidenceSyncService(new evidenceSyncRepository_1.EvidenceSyncRepository(pool), createTestEvidenceObjectStorageClient()),
                reportSubmissionService: new reportSubmissionService_1.ReportSubmissionService(new reportSubmissionRepository_1.ReportSubmissionRepository(pool), assignedWorkPackageService),
                managerReviewService: new supervisorReviewService_1.ManagerReviewService(new supervisorReviewRepository_1.SupervisorReviewRepository(pool)),
                supervisorReviewService: new supervisorReviewService_1.SupervisorReviewService(new supervisorReviewRepository_1.SupervisorReviewRepository(pool)),
            }),
        });
        runtimes.push(runtime);
        const { port } = await runtime.start();
        const login = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-work-package-error-login',
        });
        const listResponse = await fetch(`http://127.0.0.1:${port}/work-packages`, {
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
            },
        });
        (0, vitest_1.expect)(listResponse.status).toBe(500);
        (0, vitest_1.expect)(await listResponse.json()).toEqual({
            message: 'Assigned work package list failed. Please retry while connected.',
        });
        const downloadResponse = await fetch(`http://127.0.0.1:${port}/work-packages/wp-seed-1001/download`, {
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
            },
        });
        (0, vitest_1.expect)(downloadResponse.status).toBe(500);
        (0, vitest_1.expect)(await downloadResponse.json()).toEqual({
            message: 'Assigned work package download failed. Please retry while connected.',
        });
        await pool.end();
    });
    (0, vitest_1.it)('syncs evidence metadata, issues upload authorization, and finalizes binary presence', async () => {
        const database = (0, pg_mem_1.newDb)();
        const adapter = database.adapters.createPg();
        const pool = new adapter.Pool();
        await (0, migrations_1.runPostgresMigrations)(pool);
        const authRepository = new authRepository_1.AuthRepository(pool);
        const authService = new authService_1.AuthService(authRepository, authConfig, new auditEventService_1.AuditEventService(new auditEventRepository_1.AuditEventRepository(pool)));
        await authService.ensureSeedUsers();
        const technician = await authRepository.findByEmail(authConfig.seedUsers.technician.email);
        if (!technician) {
            throw new Error('Missing seeded technician for evidence sync test.');
        }
        const assignedWorkPackageService = new assignedWorkPackageService_1.AssignedWorkPackageService(new assignedWorkPackageRepository_1.AssignedWorkPackageRepository(pool));
        await assignedWorkPackageService.ensureSeedPackages(technician.id);
        const uploadedObjects = new Map();
        const evidenceSyncService = new evidenceSyncService_1.EvidenceSyncService(new evidenceSyncRepository_1.EvidenceSyncRepository(pool), createTestEvidenceObjectStorageClient(uploadedObjects), () => new Date('2026-04-23T14:30:00.000Z'));
        const reportSubmissionService = new reportSubmissionService_1.ReportSubmissionService(new reportSubmissionRepository_1.ReportSubmissionRepository(pool), assignedWorkPackageService);
        const runtime = (0, serviceRuntime_1.createServiceRuntime)({
            serviceName: 'api-service',
            serviceRole: 'api',
            host: '127.0.0.1',
            port: 0,
            verifyDatabaseReadiness: async () => undefined,
            handleRequest: (0, createApiRequestHandler_1.createApiRequestHandler)({
                authService,
                assignedWorkPackageService,
                evidenceSyncService,
                managerReviewService: new supervisorReviewService_1.ManagerReviewService(new supervisorReviewRepository_1.SupervisorReviewRepository(pool)),
                reportSubmissionService,
                supervisorReviewService: new supervisorReviewService_1.SupervisorReviewService(new supervisorReviewRepository_1.SupervisorReviewRepository(pool)),
            }),
        });
        runtimes.push(runtime);
        const { port } = await runtime.start();
        const login = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-evidence-sync-login',
        });
        const metadataResponse = await fetch(`http://127.0.0.1:${port}/sync/evidence-metadata`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                contractVersion: model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION,
                reportId: 'tag-report:wp-seed-1001:tag-001',
                workPackageId: 'wp-seed-1001',
                tagId: 'tag-001',
                templateId: 'tpl-pressure-as-found',
                templateVersion: '2026-04-v1',
                evidenceId: 'photo:20260423143000:test',
                fileName: 'field-photo.jpg',
                mimeType: 'image/jpeg',
                fileSizeBytes: 2048,
                executionStepId: 'guidance',
                source: 'camera',
                localCapturedAt: '2026-04-23T14:25:00.000Z',
                metadataIdempotencyKey: 'upload-evidence-metadata:photo:20260423143000:test:2026-04-23T14:25:00.000Z',
            }),
        });
        const metadataBody = (await metadataResponse.json());
        (0, vitest_1.expect)(metadataResponse.status).toBe(200);
        (0, vitest_1.expect)(metadataBody.presenceStatus).toBe('metadata-recorded');
        const authorizationResponse = await fetch(`http://127.0.0.1:${port}/sync/evidence-upload-authorizations`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                contractVersion: model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION,
                reportId: 'tag-report:wp-seed-1001:tag-001',
                evidenceId: 'photo:20260423143000:test',
            }),
        });
        const authorizationBody = (await authorizationResponse.json());
        (0, vitest_1.expect)(authorizationResponse.status).toBe(200);
        (0, vitest_1.expect)(authorizationBody.serverEvidenceId).toBe(metadataBody.serverEvidenceId);
        (0, vitest_1.expect)(authorizationBody.uploadMethod).toBe('PUT');
        (0, vitest_1.expect)(authorizationBody.requiredHeaders).toEqual({
            'content-type': 'image/jpeg',
        });
        uploadedObjects.set(authorizationBody.objectKey, {
            contentLengthBytes: 2048,
            contentType: 'image/jpeg',
        });
        const finalizationResponse = await fetch(`http://127.0.0.1:${port}/sync/evidence-binary-finalizations`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                contractVersion: model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION,
                serverEvidenceId: metadataBody.serverEvidenceId,
            }),
        });
        const finalizationBody = (await finalizationResponse.json());
        (0, vitest_1.expect)(finalizationResponse.status).toBe(200);
        (0, vitest_1.expect)(finalizationBody).toMatchObject({
            serverEvidenceId: metadataBody.serverEvidenceId,
            presenceStatus: 'binary-finalized',
            presenceFinalizedAt: '2026-04-23T14:30:00.000Z',
        });
        const evidenceRows = (await pool.query(`
        SELECT file_size_bytes, retention_policy, retention_expires_at
        FROM evidence_sync_records
        WHERE server_evidence_id = $1;
      `, [metadataBody.serverEvidenceId]));
        (0, vitest_1.expect)(evidenceRows.rows[0]).toEqual({
            file_size_bytes: 2048,
            retention_policy: evidencePolicy_1.EVIDENCE_BINARY_POLICY.id,
            retention_expires_at: '2027-04-23T14:30:00.000Z',
        });
        const unauthenticatedAccessResponse = await fetch(`http://127.0.0.1:${port}/sync/evidence-access-authorizations`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                contractVersion: model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION,
                serverEvidenceId: metadataBody.serverEvidenceId,
            }),
        });
        (0, vitest_1.expect)(unauthenticatedAccessResponse.status).toBe(401);
        const accessResponse = await fetch(`http://127.0.0.1:${port}/sync/evidence-access-authorizations`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                contractVersion: model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION,
                serverEvidenceId: metadataBody.serverEvidenceId,
            }),
        });
        const accessBody = (await accessResponse.json());
        (0, vitest_1.expect)(accessResponse.status).toBe(200);
        (0, vitest_1.expect)(accessBody).toMatchObject({
            contractVersion: model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION,
            serverEvidenceId: metadataBody.serverEvidenceId,
            downloadMethod: 'GET',
            requiredHeaders: {},
            expiresAt: '2026-04-23T14:35:00.000Z',
        });
        (0, vitest_1.expect)(accessBody.downloadUrl).toContain('download=1');
        await pool.end();
    });
    (0, vitest_1.it)('keeps evidence metadata accepted but rejects unsupported contracts and missing binary finalization', async () => {
        const database = (0, pg_mem_1.newDb)();
        const adapter = database.adapters.createPg();
        const pool = new adapter.Pool();
        await (0, migrations_1.runPostgresMigrations)(pool);
        const authRepository = new authRepository_1.AuthRepository(pool);
        const authService = new authService_1.AuthService(authRepository, authConfig, new auditEventService_1.AuditEventService(new auditEventRepository_1.AuditEventRepository(pool)));
        await authService.ensureSeedUsers();
        const technician = await authRepository.findByEmail(authConfig.seedUsers.technician.email);
        if (!technician) {
            throw new Error('Missing seeded technician for evidence failure test.');
        }
        const assignedWorkPackageService = new assignedWorkPackageService_1.AssignedWorkPackageService(new assignedWorkPackageRepository_1.AssignedWorkPackageRepository(pool));
        await assignedWorkPackageService.ensureSeedPackages(technician.id);
        const uploadedObjects = new Map();
        const evidenceSyncService = new evidenceSyncService_1.EvidenceSyncService(new evidenceSyncRepository_1.EvidenceSyncRepository(pool), createTestEvidenceObjectStorageClient(uploadedObjects), () => new Date('2026-04-23T15:00:00.000Z'));
        const reportSubmissionService = new reportSubmissionService_1.ReportSubmissionService(new reportSubmissionRepository_1.ReportSubmissionRepository(pool), assignedWorkPackageService);
        const runtime = (0, serviceRuntime_1.createServiceRuntime)({
            serviceName: 'api-service',
            serviceRole: 'api',
            host: '127.0.0.1',
            port: 0,
            verifyDatabaseReadiness: async () => undefined,
            handleRequest: (0, createApiRequestHandler_1.createApiRequestHandler)({
                authService,
                assignedWorkPackageService,
                evidenceSyncService,
                managerReviewService: new supervisorReviewService_1.ManagerReviewService(new supervisorReviewRepository_1.SupervisorReviewRepository(pool)),
                reportSubmissionService,
                supervisorReviewService: new supervisorReviewService_1.SupervisorReviewService(new supervisorReviewRepository_1.SupervisorReviewRepository(pool)),
            }),
        });
        runtimes.push(runtime);
        const { port } = await runtime.start();
        const login = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-evidence-failure-login',
        });
        const unsupportedContractResponse = await fetch(`http://127.0.0.1:${port}/sync/evidence-metadata`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                contractVersion: '2026-03-v0',
                reportId: 'tag-report:wp-seed-1001:tag-001',
                workPackageId: 'wp-seed-1001',
                tagId: 'tag-001',
                templateId: 'tpl-pressure-as-found',
                templateVersion: '2026-04-v1',
                evidenceId: 'photo:20260423150000:bad-contract',
                fileName: 'field-photo.jpg',
                mimeType: 'image/jpeg',
                fileSizeBytes: 2048,
                executionStepId: 'guidance',
                source: 'camera',
                localCapturedAt: '2026-04-23T14:55:00.000Z',
                metadataIdempotencyKey: 'upload-evidence-metadata:photo:20260423150000:bad-contract:2026-04-23T14:55:00.000Z',
            }),
        });
        (0, vitest_1.expect)(unsupportedContractResponse.status).toBe(400);
        (0, vitest_1.expect)(await unsupportedContractResponse.json()).toEqual({
            message: `Evidence sync contractVersion must be ${model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION}.`,
        });
        const invalidEvidencePayloads = [
            {
                evidenceId: 'photo:20260423150000:bad-type',
                overrides: {
                    fileName: 'field-photo.pdf',
                    mimeType: 'application/pdf',
                    fileSizeBytes: 2048,
                },
                expectedMessage: 'Evidence file type must be one of:',
            },
            {
                evidenceId: 'photo:20260423150000:too-large',
                overrides: {
                    fileName: 'field-photo.jpg',
                    mimeType: 'image/jpeg',
                    fileSizeBytes: evidencePolicy_1.EVIDENCE_BINARY_POLICY.maxFileSizeBytes + 1,
                },
                expectedMessage: `Evidence fileSizeBytes must not exceed ${evidencePolicy_1.EVIDENCE_BINARY_POLICY.maxFileSizeBytes} bytes.`,
            },
            {
                evidenceId: 'photo:20260423150000:mismatch',
                overrides: {
                    fileName: 'field-photo.png',
                    mimeType: 'image/jpeg',
                    fileSizeBytes: 2048,
                },
                expectedMessage: 'Evidence fileName extension must match image/jpeg.',
            },
        ];
        for (const payload of invalidEvidencePayloads) {
            const invalidResponse = await fetch(`http://127.0.0.1:${port}/sync/evidence-metadata`, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${login.tokens.accessToken}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    contractVersion: model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION,
                    reportId: 'tag-report:wp-seed-1001:tag-001',
                    workPackageId: 'wp-seed-1001',
                    tagId: 'tag-001',
                    templateId: 'tpl-pressure-as-found',
                    templateVersion: '2026-04-v1',
                    evidenceId: payload.evidenceId,
                    executionStepId: 'guidance',
                    source: 'camera',
                    localCapturedAt: '2026-04-23T14:55:00.000Z',
                    metadataIdempotencyKey: `upload-evidence-metadata:${payload.evidenceId}:2026-04-23T14:55:00.000Z`,
                    ...payload.overrides,
                }),
            });
            const invalidBody = (await invalidResponse.json());
            (0, vitest_1.expect)(invalidResponse.status).toBe(400);
            (0, vitest_1.expect)(invalidBody.message).toContain(payload.expectedMessage);
        }
        const invalidRows = (await pool.query(`
        SELECT COUNT(*) AS count
        FROM evidence_sync_records
        WHERE evidence_id IN ($1, $2, $3);
      `, invalidEvidencePayloads.map((payload) => payload.evidenceId)));
        (0, vitest_1.expect)(Number(invalidRows.rows[0]?.count ?? 0)).toBe(0);
        const metadataResponse = await fetch(`http://127.0.0.1:${port}/sync/evidence-metadata`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                contractVersion: model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION,
                reportId: 'tag-report:wp-seed-1001:tag-001',
                workPackageId: 'wp-seed-1001',
                tagId: 'tag-001',
                templateId: 'tpl-pressure-as-found',
                templateVersion: '2026-04-v1',
                evidenceId: 'photo:20260423150000:missing-binary',
                fileName: 'field-photo.jpg',
                mimeType: 'image/jpeg',
                fileSizeBytes: 2048,
                executionStepId: 'guidance',
                source: 'camera',
                localCapturedAt: '2026-04-23T14:55:00.000Z',
                metadataIdempotencyKey: 'upload-evidence-metadata:photo:20260423150000:missing-binary:2026-04-23T14:55:00.000Z',
            }),
        });
        const metadataBody = (await metadataResponse.json());
        (0, vitest_1.expect)(metadataResponse.status).toBe(200);
        const unfinalizedAccessResponse = await fetch(`http://127.0.0.1:${port}/sync/evidence-access-authorizations`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                contractVersion: model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION,
                serverEvidenceId: metadataBody.serverEvidenceId,
            }),
        });
        (0, vitest_1.expect)(unfinalizedAccessResponse.status).toBe(409);
        (0, vitest_1.expect)(await unfinalizedAccessResponse.json()).toEqual({
            message: 'Evidence binary is not finalized for access yet.',
        });
        const authorizationResponse = await fetch(`http://127.0.0.1:${port}/sync/evidence-upload-authorizations`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                contractVersion: model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION,
                reportId: 'tag-report:wp-seed-1001:tag-001',
                evidenceId: 'photo:20260423150000:missing-binary',
            }),
        });
        const authorizationBody = (await authorizationResponse.json());
        (0, vitest_1.expect)(authorizationResponse.status).toBe(200);
        const finalizeEvidence = () => fetch(`http://127.0.0.1:${port}/sync/evidence-binary-finalizations`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                contractVersion: model_2.EVIDENCE_SYNC_API_CONTRACT_VERSION,
                serverEvidenceId: metadataBody.serverEvidenceId,
            }),
        });
        const finalizationResponse = await finalizeEvidence();
        (0, vitest_1.expect)(finalizationResponse.status).toBe(409);
        (0, vitest_1.expect)(await finalizationResponse.json()).toEqual({
            message: 'Evidence binary is not present in object storage yet.',
        });
        uploadedObjects.set(authorizationBody.objectKey, {
            contentLengthBytes: evidencePolicy_1.EVIDENCE_BINARY_POLICY.maxFileSizeBytes + 1,
            contentType: 'image/jpeg',
        });
        const oversizedFinalization = await finalizeEvidence();
        (0, vitest_1.expect)(oversizedFinalization.status).toBe(400);
        (0, vitest_1.expect)(await oversizedFinalization.json()).toEqual({
            message: `Evidence binary object must not exceed ${evidencePolicy_1.EVIDENCE_BINARY_POLICY.maxFileSizeBytes} bytes.`,
        });
        uploadedObjects.set(authorizationBody.objectKey, {
            contentLengthBytes: 2048,
            contentType: 'image/png',
        });
        const wrongTypeFinalization = await finalizeEvidence();
        (0, vitest_1.expect)(wrongTypeFinalization.status).toBe(400);
        (0, vitest_1.expect)(await wrongTypeFinalization.json()).toEqual({
            message: 'Evidence binary content type must match declared metadata image/jpeg.',
        });
        uploadedObjects.set(authorizationBody.objectKey, {
            contentLengthBytes: null,
            contentType: 'image/jpeg',
        });
        const missingSizeFinalization = await finalizeEvidence();
        (0, vitest_1.expect)(missingSizeFinalization.status).toBe(409);
        (0, vitest_1.expect)(await missingSizeFinalization.json()).toEqual({
            message: 'Evidence binary size metadata is unavailable from object storage.',
        });
        uploadedObjects.set(authorizationBody.objectKey, {
            contentLengthBytes: 2048,
            contentType: null,
        });
        const missingContentTypeFinalization = await finalizeEvidence();
        (0, vitest_1.expect)(missingContentTypeFinalization.status).toBe(409);
        (0, vitest_1.expect)(await missingContentTypeFinalization.json()).toEqual({
            message: 'Evidence binary content type metadata is unavailable from object storage.',
        });
        const unfinalizedRows = (await pool.query(`
        SELECT presence_status, presence_finalized_at, retention_expires_at
        FROM evidence_sync_records
        WHERE server_evidence_id = $1;
      `, [metadataBody.serverEvidenceId]));
        (0, vitest_1.expect)(unfinalizedRows.rows[0]).toEqual({
            presence_status: 'metadata-recorded',
            presence_finalized_at: null,
            retention_expires_at: null,
        });
        uploadedObjects.set(authorizationBody.objectKey, {
            contentLengthBytes: 2048,
            contentType: 'IMAGE/JPEG; charset=binary',
        });
        const validFinalization = await finalizeEvidence();
        (0, vitest_1.expect)(validFinalization.status).toBe(200);
        (0, vitest_1.expect)(await validFinalization.json()).toMatchObject({
            serverEvidenceId: metadataBody.serverEvidenceId,
            presenceStatus: 'binary-finalized',
            presenceFinalizedAt: '2026-04-23T15:00:00.000Z',
        });
        await pool.end();
    });
    (0, vitest_1.it)('accepts valid report submissions into the supervisor-review lifecycle state', async () => {
        const { authService, pool, port } = await startReportSubmissionRuntime();
        const login = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-report-submit-login',
        });
        const response = await fetch(`http://127.0.0.1:${port}/sync/report-submissions`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(buildValidReportSubmissionPayload()),
        });
        const body = (await response.json());
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(body).toMatchObject({
            contractVersion: model_3.REPORT_SUBMISSION_API_CONTRACT_VERSION,
            reportId: 'tag-report:wp-seed-1001:tag-pt-101',
            reportState: 'submitted-pending-review',
            lifecycleState: 'Submitted - Pending Supervisor Review',
            syncState: 'synced',
        });
        (0, vitest_1.expect)(body.serverReportVersion).toContain('tag-report:wp-seed-1001:tag-pt-101');
        await pool.end();
    });
    (0, vitest_1.it)('rejects invalid report submissions with structured sync issue reasons', async () => {
        const { authService, pool, port } = await startReportSubmissionRuntime();
        const login = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-report-invalid-login',
        });
        const response = await fetch(`http://127.0.0.1:${port}/sync/report-submissions`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(buildValidReportSubmissionPayload({
                evidenceReferences: [
                    {
                        label: 'as-found readings',
                        requirementLevel: 'minimum',
                        evidenceKind: 'structured-readings',
                        satisfied: false,
                        detail: 'Structured readings have not been saved yet.',
                    },
                ],
            })),
        });
        (0, vitest_1.expect)(response.status).toBe(422);
        (0, vitest_1.expect)(await response.json()).toEqual({
            message: 'Minimum evidence is missing: as-found readings.',
            syncIssue: {
                reasonCode: 'minimum-evidence-missing',
                message: 'Minimum evidence is missing: as-found readings.',
            },
        });
        await pool.end();
    });
    (0, vitest_1.it)('rejects conflicting report updates without silently merging', async () => {
        const { authService, pool, port } = await startReportSubmissionRuntime();
        const login = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-report-conflict-login',
        });
        const submit = (payload) => fetch(`http://127.0.0.1:${port}/sync/report-submissions`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${login.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const accepted = await submit(buildValidReportSubmissionPayload());
        (0, vitest_1.expect)(accepted.status).toBe(200);
        const conflict = await submit(buildValidReportSubmissionPayload({
            objectVersion: '2026-04-23T14:20:00.000Z',
            idempotencyKey: 'submit-report:tag-report:wp-seed-1001:tag-pt-101:2026-04-23T14:20:00.000Z',
        }));
        const body = (await conflict.json());
        (0, vitest_1.expect)(conflict.status).toBe(409);
        (0, vitest_1.expect)(body.message).toBe('Report was already accepted at a different submitted version.');
        (0, vitest_1.expect)(body.syncIssue.reasonCode).toBe('conflicting-report-version');
        (0, vitest_1.expect)(body.syncIssue.serverReportVersion).toContain('tag-report:wp-seed-1001:tag-pt-101');
        await pool.end();
    });
    (0, vitest_1.it)('serves the supervisor review queue and report detail from server-accepted submissions only', async () => {
        const { authService, pool, port } = await startReportSubmissionRuntime();
        const technicianLogin = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-review-tech-login',
        });
        const supervisorLogin = await authService.loginConnected({
            email: authConfig.seedUsers.supervisor.email,
            password: authConfig.seedUsers.supervisor.password,
        }, {
            correlationId: 'corr-review-supervisor-login',
        });
        const emptyQueue = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports`, {
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
            },
        });
        (0, vitest_1.expect)(emptyQueue.status).toBe(200);
        (0, vitest_1.expect)(await emptyQueue.json()).toEqual({
            contractVersion: model_4.SUPERVISOR_REVIEW_API_CONTRACT_VERSION,
            items: [],
        });
        const accepted = await fetch(`http://127.0.0.1:${port}/sync/report-submissions`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${technicianLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(buildValidReportSubmissionPayload()),
        });
        (0, vitest_1.expect)(accepted.status).toBe(200);
        const technicianQueue = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports`, {
            headers: {
                authorization: `Bearer ${technicianLogin.tokens.accessToken}`,
            },
        });
        (0, vitest_1.expect)(technicianQueue.status).toBe(403);
        const queue = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports`, {
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
            },
        });
        const queueBody = (await queue.json());
        (0, vitest_1.expect)(queue.status).toBe(200);
        (0, vitest_1.expect)(queueBody.contractVersion).toBe(model_4.SUPERVISOR_REVIEW_API_CONTRACT_VERSION);
        (0, vitest_1.expect)(queueBody.items).toHaveLength(1);
        (0, vitest_1.expect)(queueBody.items[0]).toMatchObject({
            reportId: 'tag-report:wp-seed-1001:tag-pt-101',
            lifecycleState: 'Submitted - Pending Supervisor Review',
            executionSummary: 'Structured pressure readings are captured.',
            riskFlagCount: 1,
            pendingEvidenceCount: 0,
        });
        const detail = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent('tag-report:wp-seed-1001:tag-pt-101')}`, {
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
            },
        });
        const detailBody = (await detail.json());
        (0, vitest_1.expect)(detail.status).toBe(200);
        (0, vitest_1.expect)(detailBody.contractVersion).toBe(model_4.SUPERVISOR_REVIEW_API_CONTRACT_VERSION);
        (0, vitest_1.expect)(detailBody.report).toMatchObject({
            reportId: 'tag-report:wp-seed-1001:tag-pt-101',
            historySummary: 'History available.',
            draftDiagnosisSummary: 'No local diagnosis.',
            evidenceStatus: {
                state: 'no-photo-evidence',
                pendingPhotoAttachments: 0,
            },
            approvalHistory: {
                items: [],
                placeholder: 'No approval decisions have been recorded for this report yet.',
            },
        });
        (0, vitest_1.expect)(detailBody.report.evidenceReferences).toHaveLength(2);
        (0, vitest_1.expect)(detailBody.report.riskFlags).toHaveLength(1);
        await pool.end();
    });
    (0, vitest_1.it)('approves a standard supervisor report with an auditable decision and removes it from the queue', async () => {
        const { authService, auditRepository, pool, port } = await startReportSubmissionRuntime();
        const technicianLogin = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-review-approve-tech-login',
        });
        const supervisorLogin = await authService.loginConnected({
            email: authConfig.seedUsers.supervisor.email,
            password: authConfig.seedUsers.supervisor.password,
        }, {
            correlationId: 'corr-review-approve-supervisor-login',
        });
        const accepted = await fetch(`http://127.0.0.1:${port}/sync/report-submissions`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${technicianLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(buildValidReportSubmissionPayload()),
        });
        (0, vitest_1.expect)(accepted.status).toBe(200);
        const forbiddenTechnicianDecision = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent('tag-report:wp-seed-1001:tag-pt-101')}/approve`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${technicianLogin.tokens.accessToken}`,
            },
        });
        (0, vitest_1.expect)(forbiddenTechnicianDecision.status).toBe(403);
        const approval = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent('tag-report:wp-seed-1001:tag-pt-101')}/approve`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
                'x-correlation-id': 'corr-review-approve-command',
            },
        });
        const approvalBody = (await approval.json());
        (0, vitest_1.expect)(approval.status).toBe(200);
        (0, vitest_1.expect)(approvalBody).toMatchObject({
            contractVersion: model_4.SUPERVISOR_REVIEW_API_CONTRACT_VERSION,
            reportId: 'tag-report:wp-seed-1001:tag-pt-101',
            decisionType: 'approved',
            reportState: 'approved',
            lifecycleState: 'Approved',
            syncState: 'synced',
            decidedAt: '2026-04-23T15:00:00.000Z',
            comment: null,
        });
        (0, vitest_1.expect)(approvalBody.auditEventId).toBeTruthy();
        const queue = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports`, {
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
            },
        });
        (0, vitest_1.expect)(queue.status).toBe(200);
        // Story 10.1: after a decision (approve / return / escalate) the report
        // stays visible to the supervisor in the decided state so the mobile
        // grouping can render the "Aprovados / Devolvidos / Escalados" tabs.
        const queueJson = (await queue.json());
        (0, vitest_1.expect)(queueJson.contractVersion).toBe(model_4.SUPERVISOR_REVIEW_API_CONTRACT_VERSION);
        (0, vitest_1.expect)(queueJson.items).toHaveLength(1);
        (0, vitest_1.expect)(queueJson.items[0]).toMatchObject({
            reportId: 'tag-report:wp-seed-1001:tag-pt-101',
            lifecycleState: 'Approved',
        });
        const auditEvents = await auditRepository.listEventsByTarget('report', 'tag-report:wp-seed-1001:tag-pt-101');
        (0, vitest_1.expect)(auditEvents).toHaveLength(1);
        (0, vitest_1.expect)(auditEvents[0]).toMatchObject({
            id: approvalBody.auditEventId,
            actorRole: 'supervisor',
            actionType: 'report.supervisor.approved',
            targetObjectType: 'report',
            targetObjectId: 'tag-report:wp-seed-1001:tag-pt-101',
            occurredAt: '2026-04-23T15:00:00.000Z',
            correlationId: 'corr-review-approve-command',
            priorState: 'Submitted - Pending Supervisor Review',
            nextState: 'Approved',
            comment: null,
        });
        const staleApproval = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent('tag-report:wp-seed-1001:tag-pt-101')}/approve`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
            },
        });
        (0, vitest_1.expect)(staleApproval.status).toBe(409);
        (0, vitest_1.expect)(await staleApproval.json()).toEqual({
            message: 'Report is no longer pending supervisor review.',
        });
        await pool.end();
    });
    (0, vitest_1.it)('returns a standard supervisor report only with a mandatory comment and persists returned state', async () => {
        const { authService, auditRepository, pool, port } = await startReportSubmissionRuntime();
        const technicianLogin = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-review-return-tech-login',
        });
        const supervisorLogin = await authService.loginConnected({
            email: authConfig.seedUsers.supervisor.email,
            password: authConfig.seedUsers.supervisor.password,
        }, {
            correlationId: 'corr-review-return-supervisor-login',
        });
        const accepted = await fetch(`http://127.0.0.1:${port}/sync/report-submissions`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${technicianLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(buildValidReportSubmissionPayload()),
        });
        (0, vitest_1.expect)(accepted.status).toBe(200);
        const blankReturn = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent('tag-report:wp-seed-1001:tag-pt-101')}/return`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ comment: '   ' }),
        });
        (0, vitest_1.expect)(blankReturn.status).toBe(400);
        (0, vitest_1.expect)(await blankReturn.json()).toEqual({
            message: 'Return comment is required before returning a report.',
        });
        const returned = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent('tag-report:wp-seed-1001:tag-pt-101')}/return`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
                'content-type': 'application/json',
                'x-correlation-id': 'corr-review-return-command',
            },
            body: JSON.stringify({ comment: 'Clarify instrument note before approval.' }),
        });
        const returnedBody = (await returned.json());
        (0, vitest_1.expect)(returned.status).toBe(200);
        (0, vitest_1.expect)(returnedBody).toMatchObject({
            decisionType: 'returned',
            reportState: 'returned-by-supervisor',
            lifecycleState: 'Returned by Supervisor',
            comment: 'Clarify instrument note before approval.',
        });
        const reportRows = (await pool.query(`
        SELECT report_state, lifecycle_state, sync_state
        FROM report_submission_records
        WHERE report_id = $1;
      `, ['tag-report:wp-seed-1001:tag-pt-101']));
        (0, vitest_1.expect)(reportRows.rows[0]).toEqual({
            report_state: 'returned-by-supervisor',
            lifecycle_state: 'Returned by Supervisor',
            sync_state: 'synced',
        });
        const auditEvents = await auditRepository.listEventsByTarget('report', 'tag-report:wp-seed-1001:tag-pt-101');
        (0, vitest_1.expect)(auditEvents).toHaveLength(1);
        (0, vitest_1.expect)(auditEvents[0]).toMatchObject({
            id: returnedBody.auditEventId,
            actorRole: 'supervisor',
            actionType: 'report.supervisor.returned',
            correlationId: 'corr-review-return-command',
            priorState: 'Submitted - Pending Supervisor Review',
            nextState: 'Returned by Supervisor',
            comment: 'Clarify instrument note before approval.',
        });
        await pool.end();
    });
    (0, vitest_1.it)('reopens returned reports for technician resubmission while preserving approval history', async () => {
        const { authService, pool, port } = await startReportSubmissionRuntime();
        const technicianLogin = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-report-reentry-tech-login',
        });
        const supervisorLogin = await authService.loginConnected({
            email: authConfig.seedUsers.supervisor.email,
            password: authConfig.seedUsers.supervisor.password,
        }, {
            correlationId: 'corr-report-reentry-supervisor-login',
        });
        const reportId = 'tag-report:wp-seed-1001:tag-pt-101';
        const submit = (payload) => fetch(`http://127.0.0.1:${port}/sync/report-submissions`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${technicianLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        (0, vitest_1.expect)((await submit(buildValidReportSubmissionPayload())).status).toBe(200);
        const returned = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent(reportId)}/return`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
                'content-type': 'application/json',
                'x-correlation-id': 'corr-report-reentry-return',
            },
            body: JSON.stringify({ comment: 'Rework the observations before approval.' }),
        });
        (0, vitest_1.expect)(returned.status).toBe(200);
        const returnedStatus = await fetch(`http://127.0.0.1:${port}/sync/report-submissions/${encodeURIComponent(reportId)}/status`, {
            headers: {
                authorization: `Bearer ${technicianLogin.tokens.accessToken}`,
            },
        });
        const returnedStatusBody = (await returnedStatus.json());
        (0, vitest_1.expect)(returnedStatus.status).toBe(200);
        (0, vitest_1.expect)(returnedStatusBody.lifecycleState).toBe('Returned by Supervisor');
        (0, vitest_1.expect)(returnedStatusBody.approvalHistory.items).toMatchObject([
            {
                actionType: 'report.supervisor.returned',
                comment: 'Rework the observations before approval.',
            },
        ]);
        const resubmitted = await submit(buildValidReportSubmissionPayload({
            objectVersion: '2026-04-23T16:05:00.000Z',
            idempotencyKey: 'submit-report:tag-report:wp-seed-1001:tag-pt-101:2026-04-23T16:05:00.000Z',
            submittedAt: '2026-04-23T16:04:00.000Z',
        }));
        const resubmittedBody = (await resubmitted.json());
        (0, vitest_1.expect)(resubmitted.status).toBe(200);
        (0, vitest_1.expect)(resubmittedBody.lifecycleState).toBe('Submitted - Pending Supervisor Review');
        (0, vitest_1.expect)(resubmittedBody.serverReportVersion).toContain('2026-04-23T16:05:00.000Z');
        const detail = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent(reportId)}`, {
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
            },
        });
        const detailBody = (await detail.json());
        (0, vitest_1.expect)(detail.status).toBe(200);
        (0, vitest_1.expect)(detailBody.report.lifecycleState).toBe('Submitted - Pending Supervisor Review');
        (0, vitest_1.expect)(detailBody.report.approvalHistory.items).toMatchObject([
            {
                actionType: 'report.supervisor.returned',
                comment: 'Rework the observations before approval.',
            },
        ]);
        await pool.end();
    });
    (0, vitest_1.it)('derives work-package roll-up status from child report outcomes', async () => {
        const { authService, pool, port } = await startReportSubmissionRuntime();
        const technicianLogin = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-rollup-tech-login',
        });
        const supervisorLogin = await authService.loginConnected({
            email: authConfig.seedUsers.supervisor.email,
            password: authConfig.seedUsers.supervisor.password,
        }, {
            correlationId: 'corr-rollup-supervisor-login',
        });
        const authHeaders = {
            authorization: `Bearer ${technicianLogin.tokens.accessToken}`,
        };
        const submit = (payload) => fetch(`http://127.0.0.1:${port}/sync/report-submissions`, {
            method: 'POST',
            headers: {
                ...authHeaders,
                'content-type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const listStatus = async () => {
            const response = await fetch(`http://127.0.0.1:${port}/work-packages`, {
                headers: authHeaders,
            });
            const body = (await response.json());
            (0, vitest_1.expect)(response.status).toBe(200);
            return body.items.find((item) => item.id === 'wp-seed-1001')?.status;
        };
        const supervisorDecision = (reportId, action) => fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent(reportId)}/${action}`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: action === 'return' ? JSON.stringify({ comment: 'Needs rework.' }) : undefined,
        });
        (0, vitest_1.expect)(await listStatus()).toBe('assigned');
        (0, vitest_1.expect)((await submit(buildValidReportSubmissionPayload())).status).toBe(200);
        (0, vitest_1.expect)(await listStatus()).toBe('in_progress');
        (0, vitest_1.expect)((await supervisorDecision('tag-report:wp-seed-1001:tag-pt-101', 'return')).status).toBe(200);
        (0, vitest_1.expect)(await listStatus()).toBe('attention_needed');
        (0, vitest_1.expect)((await submit(buildValidReportSubmissionPayload({
            objectVersion: '2026-04-23T16:10:00.000Z',
            idempotencyKey: 'submit-report:tag-report:wp-seed-1001:tag-pt-101:2026-04-23T16:10:00.000Z',
            submittedAt: '2026-04-23T16:09:00.000Z',
        }))).status).toBe(200);
        (0, vitest_1.expect)((await submit(buildTagReportPayload({
            reportId: 'tag-report:wp-seed-1001:tag-tt-205',
            tagId: 'tag-tt-205',
            templateId: 'tpl-temperature-input-simulation',
            objectVersion: '2026-04-23T16:11:00.000Z',
            minimumEvidenceLabels: ['simulated inputs', 'reported outputs'],
        }))).status).toBe(200);
        (0, vitest_1.expect)((await submit(buildTagReportPayload({
            reportId: 'tag-report:wp-seed-1001:tag-ai-330',
            tagId: 'tag-ai-330',
            templateId: 'tpl-loop-integrity-check',
            objectVersion: '2026-04-23T16:12:00.000Z',
            minimumEvidenceLabels: ['loop checkpoints', 'measured current values'],
        }))).status).toBe(200);
        (0, vitest_1.expect)(await listStatus()).toBe('pending_review');
        await (0, vitest_1.expect)(supervisorDecision('tag-report:wp-seed-1001:tag-pt-101', 'approve')).resolves.toMatchObject({ status: 200 });
        await (0, vitest_1.expect)(supervisorDecision('tag-report:wp-seed-1001:tag-tt-205', 'approve')).resolves.toMatchObject({ status: 200 });
        await (0, vitest_1.expect)(supervisorDecision('tag-report:wp-seed-1001:tag-ai-330', 'approve')).resolves.toMatchObject({ status: 200 });
        (0, vitest_1.expect)(await listStatus()).toBe('completed');
        const download = await fetch(`http://127.0.0.1:${port}/work-packages/wp-seed-1001/download`, {
            headers: authHeaders,
        });
        const downloadBody = (await download.json());
        (0, vitest_1.expect)(download.status).toBe(200);
        (0, vitest_1.expect)(downloadBody.summary.status).toBe('completed');
        await pool.end();
    });
    (0, vitest_1.it)('escalates a higher-risk supervisor report with rationale and routes it to manager review', async () => {
        const { authService, auditRepository, manager, pool, port } = await startReportSubmissionRuntime();
        const technicianLogin = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-review-escalate-tech-login',
        });
        const supervisorLogin = await authService.loginConnected({
            email: authConfig.seedUsers.supervisor.email,
            password: authConfig.seedUsers.supervisor.password,
        }, {
            correlationId: 'corr-review-escalate-supervisor-login',
        });
        const managerLogin = await authService.loginConnected({
            email: authConfig.seedUsers.manager.email,
            password: authConfig.seedUsers.manager.password,
        }, {
            correlationId: 'corr-review-escalate-manager-login',
        });
        const accepted = await fetch(`http://127.0.0.1:${port}/sync/report-submissions`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${technicianLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(buildValidReportSubmissionPayload()),
        });
        (0, vitest_1.expect)(accepted.status).toBe(200);
        const blankEscalation = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent('tag-report:wp-seed-1001:tag-pt-101')}/escalate`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ rationale: '   ' }),
        });
        (0, vitest_1.expect)(blankEscalation.status).toBe(400);
        (0, vitest_1.expect)(await blankEscalation.json()).toEqual({
            message: 'Escalation rationale is required before escalating a report.',
        });
        const forbiddenTechnicianEscalation = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent('tag-report:wp-seed-1001:tag-pt-101')}/escalate`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${technicianLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ rationale: 'Manager should review this risk.' }),
        });
        (0, vitest_1.expect)(forbiddenTechnicianEscalation.status).toBe(403);
        const forbiddenManagerEscalation = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent('tag-report:wp-seed-1001:tag-pt-101')}/escalate`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${managerLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ rationale: 'Manager should review this risk.' }),
        });
        (0, vitest_1.expect)(forbiddenManagerEscalation.status).toBe(403);
        const escalation = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent('tag-report:wp-seed-1001:tag-pt-101')}/escalate`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
                'content-type': 'application/json',
                'x-correlation-id': 'corr-review-escalate-command',
            },
            body: JSON.stringify({ rationale: 'Higher-risk review needed before approval.' }),
        });
        const escalationBody = (await escalation.json());
        (0, vitest_1.expect)(escalation.status).toBe(200);
        (0, vitest_1.expect)(escalationBody).toMatchObject({
            decisionType: 'escalated',
            reportState: 'escalated-pending-manager-review',
            lifecycleState: 'Escalated - Pending Manager Review',
            syncState: 'synced',
            comment: 'Higher-risk review needed before approval.',
            managerReviewerUserId: manager.id,
        });
        (0, vitest_1.expect)(escalationBody.auditEventId).toBeTruthy();
        const queue = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports`, {
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
            },
        });
        (0, vitest_1.expect)(queue.status).toBe(200);
        // Story 10.1: escalated reports stay visible in the supervisor queue
        // (just in 'Escalated - Pending Manager Review' state) so the mobile
        // "Escalados" group is non-empty after escalation.
        const queueJson = (await queue.json());
        (0, vitest_1.expect)(queueJson.contractVersion).toBe(model_4.SUPERVISOR_REVIEW_API_CONTRACT_VERSION);
        (0, vitest_1.expect)(queueJson.items).toHaveLength(1);
        (0, vitest_1.expect)(queueJson.items[0]).toMatchObject({
            lifecycleState: 'Escalated - Pending Manager Review',
        });
        const reportRows = (await pool.query(`
        SELECT report_state, lifecycle_state, sync_state
        FROM report_submission_records
        WHERE report_id = $1;
      `, ['tag-report:wp-seed-1001:tag-pt-101']));
        (0, vitest_1.expect)(reportRows.rows[0]).toEqual({
            report_state: 'escalated-pending-manager-review',
            lifecycle_state: 'Escalated - Pending Manager Review',
            sync_state: 'synced',
        });
        const managerRouteRows = (await pool.query(`
        SELECT manager_user_id, owner_user_id, report_id, route_state, escalation_audit_event_id
        FROM manager_review_routes
        WHERE report_id = $1;
      `, ['tag-report:wp-seed-1001:tag-pt-101']));
        (0, vitest_1.expect)(managerRouteRows.rows[0]).toEqual({
            manager_user_id: manager.id,
            owner_user_id: technicianLogin.user.id,
            report_id: 'tag-report:wp-seed-1001:tag-pt-101',
            route_state: 'active',
            escalation_audit_event_id: escalationBody.auditEventId,
        });
        const auditEvents = await auditRepository.listEventsByTarget('report', 'tag-report:wp-seed-1001:tag-pt-101');
        (0, vitest_1.expect)(auditEvents).toHaveLength(1);
        (0, vitest_1.expect)(auditEvents[0]).toMatchObject({
            id: escalationBody.auditEventId,
            actorRole: 'supervisor',
            actionType: 'report.supervisor.escalated',
            targetObjectType: 'report',
            targetObjectId: 'tag-report:wp-seed-1001:tag-pt-101',
            occurredAt: '2026-04-23T15:00:00.000Z',
            correlationId: 'corr-review-escalate-command',
            priorState: 'Submitted - Pending Supervisor Review',
            nextState: 'Escalated - Pending Manager Review',
            comment: 'Higher-risk review needed before approval.',
        });
        const auditMetadata = typeof auditEvents[0]?.metadataJson === 'string'
            ? JSON.parse(auditEvents[0].metadataJson)
            : {};
        (0, vitest_1.expect)(auditMetadata).toMatchObject({
            decisionType: 'escalated',
            escalationFlag: true,
            reviewLevel: 'supervisor',
            managerReviewerUserId: manager.id,
            productSignals: {
                riskFlagCount: 1,
                pendingEvidenceCount: 0,
            },
        });
        const detail = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent('tag-report:wp-seed-1001:tag-pt-101')}`, {
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
            },
        });
        const detailBody = (await detail.json());
        (0, vitest_1.expect)(detail.status).toBe(200);
        (0, vitest_1.expect)(detailBody.report.lifecycleState).toBe('Escalated - Pending Manager Review');
        (0, vitest_1.expect)(detailBody.report.approvalHistory.placeholder).toBe('');
        (0, vitest_1.expect)(detailBody.report.approvalHistory.items).toEqual([
            vitest_1.expect.objectContaining({
                auditEventId: escalationBody.auditEventId,
                actionType: 'report.supervisor.escalated',
                comment: 'Higher-risk review needed before approval.',
                nextState: 'Escalated - Pending Manager Review',
            }),
        ]);
        const staleEscalation = await fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent('tag-report:wp-seed-1001:tag-pt-101')}/escalate`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ rationale: 'Try to escalate twice.' }),
        });
        (0, vitest_1.expect)(staleEscalation.status).toBe(409);
        (0, vitest_1.expect)(await staleEscalation.json()).toEqual({
            message: 'Report is no longer pending supervisor review.',
        });
        await pool.end();
    });
    (0, vitest_1.it)('serves manager review for escalated reports and records manager approve or return decisions', async () => {
        const { authService, auditRepository, pool, port } = await startReportSubmissionRuntime();
        const technicianLogin = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-manager-review-tech-login',
        });
        const supervisorLogin = await authService.loginConnected({
            email: authConfig.seedUsers.supervisor.email,
            password: authConfig.seedUsers.supervisor.password,
        }, {
            correlationId: 'corr-manager-review-supervisor-login',
        });
        const managerLogin = await authService.loginConnected({
            email: authConfig.seedUsers.manager.email,
            password: authConfig.seedUsers.manager.password,
        }, {
            correlationId: 'corr-manager-review-manager-login',
        });
        const firstReportId = 'tag-report:wp-seed-1001:tag-manager-return';
        const secondReportId = 'tag-report:wp-seed-1001:tag-manager-approve';
        const submitReport = (reportId, objectVersion) => fetch(`http://127.0.0.1:${port}/sync/report-submissions`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${technicianLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(buildValidReportSubmissionPayload({
                reportId,
                objectVersion,
                idempotencyKey: `submit-report:${reportId}:${objectVersion}`,
            })),
        });
        const escalateReport = (reportId, rationale) => fetch(`http://127.0.0.1:${port}/review/supervisor/reports/${encodeURIComponent(reportId)}/escalate`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ rationale }),
        });
        (0, vitest_1.expect)((await submitReport(firstReportId, '2026-04-23T14:40:00.000Z')).status).toBe(200);
        (0, vitest_1.expect)((await escalateReport(firstReportId, 'Supervisor flagged higher-risk history.')).status).toBe(200);
        const technicianQueue = await fetch(`http://127.0.0.1:${port}/review/manager/reports`, {
            headers: {
                authorization: `Bearer ${technicianLogin.tokens.accessToken}`,
            },
        });
        (0, vitest_1.expect)(technicianQueue.status).toBe(403);
        const supervisorManagerReturn = await fetch(`http://127.0.0.1:${port}/review/manager/reports/${encodeURIComponent(firstReportId)}/return`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${supervisorLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ comment: 'Supervisors cannot return manager escalations.' }),
        });
        (0, vitest_1.expect)(supervisorManagerReturn.status).toBe(403);
        const queue = await fetch(`http://127.0.0.1:${port}/review/manager/reports`, {
            headers: {
                authorization: `Bearer ${managerLogin.tokens.accessToken}`,
            },
        });
        const queueBody = (await queue.json());
        (0, vitest_1.expect)(queue.status).toBe(200);
        (0, vitest_1.expect)(queueBody.contractVersion).toBe(model_4.SUPERVISOR_REVIEW_API_CONTRACT_VERSION);
        (0, vitest_1.expect)(queueBody.items).toEqual([
            vitest_1.expect.objectContaining({
                reportId: firstReportId,
                lifecycleState: 'Escalated - Pending Manager Review',
                riskFlagCount: 1,
            }),
        ]);
        const detail = await fetch(`http://127.0.0.1:${port}/review/manager/reports/${encodeURIComponent(firstReportId)}`, {
            headers: {
                authorization: `Bearer ${managerLogin.tokens.accessToken}`,
            },
        });
        const detailBody = (await detail.json());
        (0, vitest_1.expect)(detail.status).toBe(200);
        (0, vitest_1.expect)(detailBody.report).toMatchObject({
            reportId: firstReportId,
            lifecycleState: 'Escalated - Pending Manager Review',
        });
        (0, vitest_1.expect)(detailBody.report.approvalHistory.items).toEqual([
            vitest_1.expect.objectContaining({
                actionType: 'report.supervisor.escalated',
                comment: 'Supervisor flagged higher-risk history.',
                nextState: 'Escalated - Pending Manager Review',
            }),
        ]);
        const blankReturn = await fetch(`http://127.0.0.1:${port}/review/manager/reports/${encodeURIComponent(firstReportId)}/return`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${managerLogin.tokens.accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({ comment: '   ' }),
        });
        (0, vitest_1.expect)(blankReturn.status).toBe(400);
        (0, vitest_1.expect)(await blankReturn.json()).toEqual({
            message: 'Manager return comment is required before returning a report.',
        });
        const returned = await fetch(`http://127.0.0.1:${port}/review/manager/reports/${encodeURIComponent(firstReportId)}/return`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${managerLogin.tokens.accessToken}`,
                'content-type': 'application/json',
                'x-correlation-id': 'corr-manager-return-command',
            },
            body: JSON.stringify({ comment: 'Manager needs additional field confirmation.' }),
        });
        const returnedBody = (await returned.json());
        (0, vitest_1.expect)(returned.status).toBe(200);
        (0, vitest_1.expect)(returnedBody).toMatchObject({
            decisionType: 'returned',
            reportState: 'returned-by-manager',
            lifecycleState: 'Returned by Manager',
            comment: 'Manager needs additional field confirmation.',
        });
        const staleApprove = await fetch(`http://127.0.0.1:${port}/review/manager/reports/${encodeURIComponent(firstReportId)}/approve`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${managerLogin.tokens.accessToken}`,
            },
        });
        (0, vitest_1.expect)(staleApprove.status).toBe(409);
        (0, vitest_1.expect)(await staleApprove.json()).toEqual({
            message: 'Report is no longer pending manager review.',
        });
        const reportRows = (await pool.query(`
        SELECT report_state, lifecycle_state, sync_state
        FROM report_submission_records
        WHERE report_id = $1;
      `, [firstReportId]));
        (0, vitest_1.expect)(reportRows.rows[0]).toEqual({
            report_state: 'returned-by-manager',
            lifecycle_state: 'Returned by Manager',
            sync_state: 'synced',
        });
        const auditEvents = await auditRepository.listEventsByTarget('report', firstReportId);
        (0, vitest_1.expect)(auditEvents).toHaveLength(2);
        (0, vitest_1.expect)(auditEvents[1]).toMatchObject({
            id: returnedBody.auditEventId,
            actorRole: 'manager',
            actionType: 'report.manager.returned',
            correlationId: 'corr-manager-return-command',
            priorState: 'Escalated - Pending Manager Review',
            nextState: 'Returned by Manager',
            comment: 'Manager needs additional field confirmation.',
        });
        (0, vitest_1.expect)((await submitReport(secondReportId, '2026-04-23T14:50:00.000Z')).status).toBe(200);
        (0, vitest_1.expect)((await escalateReport(secondReportId, 'Supervisor requests manager approval.')).status).toBe(200);
        const approval = await fetch(`http://127.0.0.1:${port}/review/manager/reports/${encodeURIComponent(secondReportId)}/approve`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${managerLogin.tokens.accessToken}`,
                'x-correlation-id': 'corr-manager-approve-command',
            },
        });
        const approvalBody = (await approval.json());
        (0, vitest_1.expect)(approval.status).toBe(200);
        (0, vitest_1.expect)(approvalBody).toMatchObject({
            decisionType: 'approved',
            reportState: 'approved',
            lifecycleState: 'Approved',
            comment: null,
        });
        const approvalAuditEvents = await auditRepository.listEventsByTarget('report', secondReportId);
        (0, vitest_1.expect)(approvalAuditEvents).toHaveLength(2);
        (0, vitest_1.expect)(approvalAuditEvents[1]).toMatchObject({
            id: approvalBody.auditEventId,
            actorRole: 'manager',
            actionType: 'report.manager.approved',
            correlationId: 'corr-manager-approve-command',
            priorState: 'Escalated - Pending Manager Review',
            nextState: 'Approved',
            comment: null,
        });
        const emptyQueue = await fetch(`http://127.0.0.1:${port}/review/manager/reports`, {
            headers: {
                authorization: `Bearer ${managerLogin.tokens.accessToken}`,
            },
        });
        (0, vitest_1.expect)(emptyQueue.status).toBe(200);
        (0, vitest_1.expect)((await emptyQueue.json())).toEqual({
            contractVersion: model_4.SUPERVISOR_REVIEW_API_CONTRACT_VERSION,
            items: [],
        });
        await pool.end();
    });
    (0, vitest_1.it)('accepts authenticated mobile runtime error telemetry for release crash trends', async () => {
        const { authService, pool, port } = await startReportSubmissionRuntime();
        const technicianLogin = await authService.loginConnected({
            email: authConfig.seedUsers.technician.email,
            password: authConfig.seedUsers.technician.password,
        }, {
            correlationId: 'corr-mobile-diagnostics-login',
        });
        const response = await fetch(`http://127.0.0.1:${port}/diagnostics/mobile-errors`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${technicianLogin.tokens.accessToken}`,
                'content-type': 'application/json',
                'x-correlation-id': 'corr-mobile-diagnostics',
            },
            body: JSON.stringify({
                ...buildMobileDiagnosticsPayload(),
                id: 'mobile-error-release-001',
                sessionUserId: technicianLogin.user.id,
                apiBaseUrl: 'https://api.tagwise.example/path?token=secret',
                contextJson: JSON.stringify({
                    source: 'story-7.2-test',
                    authToken: 'should-not-persist',
                }),
            }),
        });
        const body = (await response.json());
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(body).toMatchObject({
            contractVersion: model_1.MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
            id: 'mobile-error-release-001',
            reportingUserId: technicianLogin.user.id,
            reportedAt: vitest_1.expect.any(String),
        });
        const rows = (await pool.query('SELECT COUNT(*) AS count FROM mobile_runtime_error_events;'));
        (0, vitest_1.expect)(Number(rows.rows[0]?.count ?? 0)).toBe(1);
        const stored = (await pool.query(`
        SELECT api_base_url, context_json
        FROM mobile_runtime_error_events
        WHERE id = $1;
      `, ['mobile-error-release-001']));
        const contextJson = typeof stored.rows[0]?.context_json === 'string'
            ? JSON.parse(stored.rows[0].context_json)
            : stored.rows[0]?.context_json;
        (0, vitest_1.expect)(stored.rows[0]).toMatchObject({
            api_base_url: 'https://api.tagwise.example',
        });
        (0, vitest_1.expect)(contextJson).toMatchObject({
            source: 'story-7.2-test',
            authToken: '[redacted]',
        });
        await pool.end();
    });
    (0, vitest_1.it)('rejects unauthenticated mobile diagnostics requests', async () => {
        const { pool, port } = await startReportSubmissionRuntime();
        const response = await fetch(`http://127.0.0.1:${port}/diagnostics/mobile-errors`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify(buildMobileDiagnosticsPayload({ id: 'mobile-error-unauth' })),
        });
        const body = (await response.json());
        (0, vitest_1.expect)(response.status).toBe(401);
        (0, vitest_1.expect)(body.message).toBe('Authorization header is required.');
        await pool.end();
    });
    (0, vitest_1.it)('rejects invalid mobile diagnostics contract versions', async () => {
        const { accessToken, pool, port } = await startMobileDiagnosticsRuntime();
        const response = await postMobileDiagnostics(port, accessToken, {
            ...buildMobileDiagnosticsPayload({ id: 'mobile-error-invalid-contract' }),
            contractVersion: '2026-03-v1',
        });
        const body = (await response.json());
        (0, vitest_1.expect)(response.status).toBe(400);
        (0, vitest_1.expect)(body.message).toContain(model_1.MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION);
        await pool.end();
    });
    (0, vitest_1.it)('rejects malformed mobile diagnostics JSON cleanly', async () => {
        const { accessToken, pool, port } = await startMobileDiagnosticsRuntime();
        const response = await fetch(`http://127.0.0.1:${port}/diagnostics/mobile-errors`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${accessToken}`,
                'content-type': 'application/json',
            },
            body: '{"contractVersion":',
        });
        const body = (await response.json());
        (0, vitest_1.expect)(response.status).toBe(400);
        (0, vitest_1.expect)(body.message).toBe('Mobile diagnostics body must be valid JSON.');
        await pool.end();
    });
    vitest_1.it.each([
        [
            'severity',
            { severity: 'warning' },
            'Mobile diagnostics severity must be error.',
        ],
        [
            'sessionRole',
            { sessionRole: 'auditor' },
            'Mobile diagnostics sessionRole is unsupported.',
        ],
        [
            'sessionConnectionMode',
            { sessionConnectionMode: 'background' },
            'Mobile diagnostics sessionConnectionMode is unsupported.',
        ],
    ])('rejects invalid mobile diagnostics enum value %s', async (_field, overrides, message) => {
        const { accessToken, pool, port } = await startMobileDiagnosticsRuntime();
        const response = await postMobileDiagnostics(port, accessToken, buildMobileDiagnosticsPayload({
            id: 'mobile-error-invalid-enum',
            ...overrides,
        }));
        const body = (await response.json());
        (0, vitest_1.expect)(response.status).toBe(400);
        (0, vitest_1.expect)(body.message).toBe(message);
        await pool.end();
    });
    (0, vitest_1.it)('rejects oversized mobile diagnostics request bodies before persistence', async () => {
        const { accessToken, pool, port } = await startMobileDiagnosticsRuntime();
        const response = await fetch(`http://127.0.0.1:${port}/diagnostics/mobile-errors`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${accessToken}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                padding: 'x'.repeat(model_1.MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.requestBodyBytes + 1),
            }),
        });
        const body = (await response.json());
        const rows = (await pool.query('SELECT COUNT(*) AS count FROM mobile_runtime_error_events;'));
        (0, vitest_1.expect)(response.status).toBe(413);
        (0, vitest_1.expect)(body.message).toContain('request body must not exceed');
        (0, vitest_1.expect)(Number(rows.rows[0]?.count ?? 0)).toBe(0);
        await pool.end();
    });
    vitest_1.it.each([
        [
            'message',
            {
                message: 'x'.repeat(model_1.MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.message + 1),
            },
        ],
        [
            'stack',
            {
                stack: 'x'.repeat(model_1.MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.stack + 1),
            },
        ],
        [
            'contextJson',
            {
                contextJson: JSON.stringify({
                    note: 'x'.repeat(model_1.MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.contextJson + 1),
                }),
            },
        ],
        [
            'apiBaseUrl',
            {
                apiBaseUrl: `https://${'a'.repeat(model_1.MOBILE_DIAGNOSTICS_PAYLOAD_LIMITS.apiBaseUrl)}.example`,
            },
        ],
        [
            'apiBaseUrl',
            {
                apiBaseUrl: 'not-a-url',
            },
        ],
    ])('rejects bounded mobile diagnostics field %s when unsafe', async (_field, overrides) => {
        const { accessToken, pool, port } = await startMobileDiagnosticsRuntime();
        const response = await postMobileDiagnostics(port, accessToken, buildMobileDiagnosticsPayload({
            id: `mobile-error-unsafe-${String(_field).toLowerCase()}`,
            ...overrides,
        }));
        const body = (await response.json());
        (0, vitest_1.expect)(response.status).toBe(400);
        (0, vitest_1.expect)(body.message).toContain(`Mobile diagnostics ${_field}`);
        await pool.end();
    });
});
function createTestEvidenceObjectStorageClient(uploadedObjects = new Map()) {
    return {
        async createBinaryUploadAuthorization(input) {
            return {
                uploadUrl: `https://storage.tagwise.test/${encodeURIComponent(input.objectKey)}`,
                uploadMethod: 'PUT',
                requiredHeaders: {
                    'content-type': input.contentType,
                },
                expiresAt: '2026-04-23T14:45:00.000Z',
            };
        },
        async createBinaryAccessAuthorization(input) {
            return {
                downloadUrl: `https://storage.tagwise.test/${encodeURIComponent(input.objectKey)}?download=1`,
                downloadMethod: 'GET',
                requiredHeaders: {},
                expiresAt: '2026-04-23T14:35:00.000Z',
            };
        },
        async getObjectMetadata(objectKey) {
            return uploadedObjects.get(objectKey) ?? null;
        },
    };
}
async function startReportSubmissionRuntime() {
    const database = (0, pg_mem_1.newDb)();
    const adapter = database.adapters.createPg();
    const pool = new adapter.Pool();
    await (0, migrations_1.runPostgresMigrations)(pool);
    const authRepository = new authRepository_1.AuthRepository(pool);
    const auditRepository = new auditEventRepository_1.AuditEventRepository(pool);
    const authService = new authService_1.AuthService(authRepository, authConfig, new auditEventService_1.AuditEventService(auditRepository));
    await authService.ensureSeedUsers();
    const technician = await authRepository.findByEmail(authConfig.seedUsers.technician.email);
    if (!technician) {
        throw new Error('Missing seeded technician for report submission test.');
    }
    const supervisor = await authRepository.findByEmail(authConfig.seedUsers.supervisor.email);
    if (!supervisor) {
        throw new Error('Missing seeded supervisor for report submission test.');
    }
    const manager = await authRepository.findByEmail(authConfig.seedUsers.manager.email);
    if (!manager) {
        throw new Error('Missing seeded manager for report submission test.');
    }
    const assignedWorkPackageService = new assignedWorkPackageService_1.AssignedWorkPackageService(new assignedWorkPackageRepository_1.AssignedWorkPackageRepository(pool));
    await assignedWorkPackageService.ensureSeedPackages(technician.id);
    const seededWorkPackages = await assignedWorkPackageService.listAssignedPackages(technician);
    const evidenceSyncService = new evidenceSyncService_1.EvidenceSyncService(new evidenceSyncRepository_1.EvidenceSyncRepository(pool), createTestEvidenceObjectStorageClient());
    const reportSubmissionService = new reportSubmissionService_1.ReportSubmissionService(new reportSubmissionRepository_1.ReportSubmissionRepository(pool), assignedWorkPackageService, () => new Date('2026-04-23T14:30:00.000Z'));
    const supervisorReviewService = new supervisorReviewService_1.SupervisorReviewService(new supervisorReviewRepository_1.SupervisorReviewRepository(pool), () => new Date('2026-04-23T15:00:00.000Z'), manager.id);
    const managerReviewService = new supervisorReviewService_1.ManagerReviewService(new supervisorReviewRepository_1.SupervisorReviewRepository(pool), () => new Date('2026-04-23T15:30:00.000Z'));
    await supervisorReviewService.ensureSeedRoutes(supervisor.id, seededWorkPackages.map((workPackage) => workPackage.id));
    const runtime = (0, serviceRuntime_1.createServiceRuntime)({
        serviceName: 'api-service',
        serviceRole: 'api',
        host: '127.0.0.1',
        port: 0,
        verifyDatabaseReadiness: async () => undefined,
        handleRequest: (0, createApiRequestHandler_1.createApiRequestHandler)({
            authService,
            assignedWorkPackageService,
            evidenceSyncService,
            mobileDiagnosticsService: new mobileDiagnosticsService_1.MobileDiagnosticsService(new mobileDiagnosticsRepository_1.MobileDiagnosticsRepository(pool)),
            managerReviewService,
            reportSubmissionService,
            supervisorReviewService,
        }),
    });
    runtimes.push(runtime);
    const { port } = await runtime.start();
    return { authService, auditRepository, manager, pool, port };
}
async function startMobileDiagnosticsRuntime() {
    const { authService, pool, port } = await startReportSubmissionRuntime();
    const technicianLogin = await authService.loginConnected({
        email: authConfig.seedUsers.technician.email,
        password: authConfig.seedUsers.technician.password,
    }, {
        correlationId: 'corr-mobile-diagnostics-login',
    });
    return {
        accessToken: technicianLogin.tokens.accessToken,
        pool,
        port,
        userId: technicianLogin.user.id,
    };
}
async function postMobileDiagnostics(port, accessToken, payload) {
    return fetch(`http://127.0.0.1:${port}/diagnostics/mobile-errors`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
}
function buildMobileDiagnosticsPayload(overrides = {}) {
    return {
        contractVersion: model_1.MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
        id: 'mobile-error-release-001',
        severity: 'error',
        errorName: 'Error',
        message: 'Forced release diagnostics capture',
        stack: 'Error: Forced release diagnostics capture',
        capturedAt: '2026-04-23T16:00:00.000Z',
        sessionUserId: 'user-tech',
        sessionRole: 'technician',
        sessionConnectionMode: 'connected',
        shellRoute: 'packages',
        devicePlatform: 'android',
        devicePlatformVersion: '34',
        appEnvironment: 'production',
        apiBaseUrl: 'https://api.tagwise.example',
        contextJson: JSON.stringify({ source: 'story-7.2-test' }),
        ...overrides,
    };
}
function buildValidReportSubmissionPayload(overrides = {}) {
    return {
        contractVersion: model_3.REPORT_SUBMISSION_API_CONTRACT_VERSION,
        reportId: 'tag-report:wp-seed-1001:tag-pt-101',
        workPackageId: 'wp-seed-1001',
        tagId: 'tag-pt-101',
        templateId: 'tpl-pressure-as-found',
        templateVersion: '2026-04-v1',
        reportState: 'submitted-pending-sync',
        lifecycleState: 'Submitted - Pending Sync',
        syncState: 'pending-validation',
        objectVersion: '2026-04-23T14:10:00.000Z',
        idempotencyKey: 'submit-report:tag-report:wp-seed-1001:tag-pt-101:2026-04-23T14:10:00.000Z',
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
            {
                label: 'instrument note',
                requirementLevel: 'minimum',
                evidenceKind: 'observation-notes',
                satisfied: true,
                detail: 'Observation notes are captured locally.',
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
function buildTagReportPayload(input) {
    return buildValidReportSubmissionPayload({
        reportId: input.reportId,
        tagId: input.tagId,
        templateId: input.templateId,
        objectVersion: input.objectVersion,
        idempotencyKey: `submit-report:${input.reportId}:${input.objectVersion}`,
        submittedAt: input.objectVersion,
        executionSummary: `Structured readings are captured for ${input.tagId}.`,
        evidenceReferences: input.minimumEvidenceLabels.map((label) => ({
            label,
            requirementLevel: 'minimum',
            evidenceKind: label.includes('note') ? 'observation-notes' : 'structured-readings',
            satisfied: true,
            detail: `${label} saved locally.`,
        })),
    });
}
