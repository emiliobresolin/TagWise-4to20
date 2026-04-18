"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("../../config/env");
const postgres_1 = require("./postgres");
const migrations_1 = require("./migrations");
async function main() {
    const environment = (0, env_1.loadServiceEnvironment)('api');
    const pool = (0, postgres_1.createPostgresPool)(environment);
    try {
        const summary = await (0, migrations_1.runPostgresMigrations)(pool);
        console.log(JSON.stringify({
            level: 'info',
            event: 'db.migrations.completed',
            appliedMigrationIds: summary.appliedMigrationIds,
            currentSchemaVersion: summary.currentSchemaVersion,
        }, null, 2));
    }
    finally {
        await pool.end();
    }
}
void main().catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown migration error';
    console.error(JSON.stringify({ level: 'error', event: 'db.migrations.failed', message }, null, 2));
    process.exitCode = 1;
});
