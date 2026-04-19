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
        (0, vitest_1.expect)(summary.appliedMigrationIds).toEqual([
            '0001_service_foundation',
            '0002_auth_users',
            '0003_audit_events',
            '0004_assigned_work_packages',
        ]);
        (0, vitest_1.expect)(summary.currentSchemaVersion).toBe(4);
        (0, vitest_1.expect)(Number(rows.rows[0]?.count ?? 0)).toBe(1);
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
        (0, vitest_1.expect)(Number(rows.rows[0]?.count ?? 0)).toBe(4);
        await pool.end();
    });
});
