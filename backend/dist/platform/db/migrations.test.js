"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pg_mem_1 = require("pg-mem");
const migrations_1 = require("./migrations");
(0, vitest_1.describe)('runPostgresMigrations', () => {
    (0, vitest_1.it)('applies the baseline PostgreSQL schema cleanly', async () => {
        const database = (0, pg_mem_1.newDb)();
        const adapter = database.adapters.createPg();
        const pool = new adapter.Pool();
        const summary = await (0, migrations_1.runPostgresMigrations)(pool);
        const rows = (await pool.query(`SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_bootstrap_checks';`));
        const managerRouteRows = (await pool.query(`SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'manager_review_routes';`));
        const mobileRuntimeErrorRows = (await pool.query(`SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mobile_runtime_error_events';`));
        const workerJobRows = (await pool.query(`SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'worker_jobs';`));
        const workerJobDrillRows = (await pool.query(`SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'worker_job_drill_events';`));
        const aiDiagnosisRows = (await pool.query(`SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ai_diagnoses';`));
        const instrumentsRows = (await pool.query(`SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'instruments';`));
        (0, vitest_1.expect)(summary.appliedMigrationIds).toEqual([
            '0001_service_foundation',
            '0002_auth_users',
            '0003_audit_events',
            '0004_assigned_work_packages',
            '0005_evidence_sync_records',
            '0006_report_submission_records',
            '0007_supervisor_review_routes',
            '0008_supervisor_standard_decision_states',
            '0009_supervisor_escalation_manager_routes',
            '0010_manager_decision_states',
            '0011_release_observability_mobile_errors',
            '0012_evidence_access_retention_guardrails',
            '0013_worker_job_resilience',
            '0014_ai_diagnoses',
            '0015_instruments_catalog',
        ]);
        (0, vitest_1.expect)(summary.currentSchemaVersion).toBe(15);
        (0, vitest_1.expect)(Number(rows.rows[0]?.count ?? 0)).toBe(1);
        (0, vitest_1.expect)(Number(managerRouteRows.rows[0]?.count ?? 0)).toBe(1);
        (0, vitest_1.expect)(Number(mobileRuntimeErrorRows.rows[0]?.count ?? 0)).toBe(1);
        (0, vitest_1.expect)(Number(workerJobRows.rows[0]?.count ?? 0)).toBe(1);
        (0, vitest_1.expect)(Number(workerJobDrillRows.rows[0]?.count ?? 0)).toBe(1);
        (0, vitest_1.expect)(Number(aiDiagnosisRows.rows[0]?.count ?? 0)).toBe(1);
        (0, vitest_1.expect)(Number(instrumentsRows.rows[0]?.count ?? 0)).toBe(1);
        await pool.end();
    });
    (0, vitest_1.it)('is idempotent when rerun against the same database', async () => {
        const database = (0, pg_mem_1.newDb)();
        const adapter = database.adapters.createPg();
        const pool = new adapter.Pool();
        await (0, migrations_1.runPostgresMigrations)(pool);
        const summary = await (0, migrations_1.runPostgresMigrations)(pool);
        const rows = (await pool.query('SELECT COUNT(*) AS count FROM schema_migrations;'));
        (0, vitest_1.expect)(summary.appliedMigrationIds).toEqual([]);
        (0, vitest_1.expect)(Number(rows.rows[0]?.count ?? 0)).toBe(15);
        await pool.end();
    });
});
