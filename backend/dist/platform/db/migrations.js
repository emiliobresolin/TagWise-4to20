"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postgresMigrationDefinitions = void 0;
exports.runPostgresMigrations = runPostgresMigrations;
const postgresMigrations = [
    {
        id: '0001_service_foundation',
        sql: `
      CREATE TABLE IF NOT EXISTS service_bootstrap_checks (
        check_name TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        details JSONB NOT NULL DEFAULT '{}'::jsonb
      );
    `,
    },
    {
        id: '0002_auth_users',
        sql: `
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('technician', 'supervisor', 'manager')),
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        session_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
    },
];
async function runPostgresMigrations(database) {
    const migrationTableExists = await database.query(`SELECT COUNT(*) AS count
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'schema_migrations';`);
    if (Number(migrationTableExists.rows[0]?.count ?? 0) === 0) {
        await database.query(`
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    }
    const appliedRows = await database.query('SELECT id FROM schema_migrations ORDER BY id ASC;');
    const appliedIds = new Set(appliedRows.rows.map((row) => row.id));
    const newlyApplied = [];
    for (const migration of postgresMigrations) {
        if (appliedIds.has(migration.id)) {
            continue;
        }
        await database.query('BEGIN;');
        try {
            await database.query(migration.sql);
            await database.query('INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2);', [
                migration.id,
                new Date().toISOString(),
            ]);
            await database.query('COMMIT;');
            newlyApplied.push(migration.id);
        }
        catch (error) {
            await database.query('ROLLBACK;');
            throw error;
        }
    }
    return {
        appliedMigrationIds: newlyApplied,
        currentSchemaVersion: postgresMigrations.length,
    };
}
exports.postgresMigrationDefinitions = postgresMigrations;
