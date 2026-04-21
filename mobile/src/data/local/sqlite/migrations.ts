import type { DatabaseMigrationSummary } from '../../../features/app-shell/model';
import type { LocalDatabase } from './types';

interface DatabaseMigration {
  id: number;
  apply: (database: LocalDatabase, now: string) => Promise<void>;
}

const FOUNDATION_RECORD_ID = 'shell-demo-record';

const migrations: DatabaseMigration[] = [
  {
    id: 1,
    apply: async (database, now) => {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS app_preferences (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS shell_demo_records (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          subtitle TEXT NOT NULL,
          launch_count INTEGER NOT NULL DEFAULT 0,
          manual_write_count INTEGER NOT NULL DEFAULT 0,
          last_opened_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      await database.runAsync(
        `
          INSERT OR IGNORE INTO shell_demo_records (
            id,
            title,
            subtitle,
            launch_count,
            manual_write_count,
            last_opened_at,
            updated_at
          )
          VALUES (?, ?, ?, 0, 0, ?, ?);
        `,
        [
          FOUNDATION_RECORD_ID,
          'Local-first foundation ready',
          'SQLite bootstrapped without a live API dependency.',
          now,
          now,
        ],
      );
    },
  },
  {
    id: 2,
    apply: async (database, now) => {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS auth_session_cache (
          session_key TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          email TEXT NOT NULL,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL,
          last_authenticated_at TEXT NOT NULL,
          access_token_expires_at TEXT NOT NULL,
          refresh_token_expires_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS local_work_state (
          state_key TEXT PRIMARY KEY NOT NULL,
          unsynced_work_count INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL
        );
      `);

      await database.runAsync(
        `
          INSERT OR IGNORE INTO local_work_state (
            state_key,
            unsynced_work_count,
            updated_at
          )
          VALUES (?, 0, ?);
        `,
        ['active', now],
      );
    },
  },
  {
    id: 3,
    apply: async (database, _now) => {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS user_partitioned_drafts (
          owner_user_id TEXT NOT NULL,
          business_object_type TEXT NOT NULL,
          business_object_id TEXT NOT NULL,
          summary_text TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (owner_user_id, business_object_type, business_object_id)
        );
      `);

      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS user_partitioned_evidence_metadata (
          owner_user_id TEXT NOT NULL,
          evidence_id TEXT NOT NULL,
          business_object_type TEXT NOT NULL,
          business_object_id TEXT NOT NULL,
          file_name TEXT NOT NULL,
          media_relative_path TEXT NOT NULL,
          mime_type TEXT,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (owner_user_id, evidence_id)
        );
      `);

      await database.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_user_partitioned_evidence_by_business_object
        ON user_partitioned_evidence_metadata (
          owner_user_id,
          business_object_type,
          business_object_id
        );
      `);

      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS user_partitioned_queue_items (
          owner_user_id TEXT NOT NULL,
          queue_item_id TEXT NOT NULL,
          business_object_type TEXT NOT NULL,
          business_object_id TEXT NOT NULL,
          item_kind TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (owner_user_id, queue_item_id)
        );
      `);

      await database.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_user_partitioned_queue_by_business_object
        ON user_partitioned_queue_items (
          owner_user_id,
          business_object_type,
          business_object_id
        );
      `);
    },
  },
  {
    id: 4,
    apply: async (database, _now) => {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS mobile_runtime_error_events (
          id TEXT PRIMARY KEY NOT NULL,
          severity TEXT NOT NULL,
          error_name TEXT NOT NULL,
          message TEXT NOT NULL,
          stack TEXT,
          captured_at TEXT NOT NULL,
          session_user_id TEXT,
          session_role TEXT,
          session_connection_mode TEXT,
          shell_route TEXT,
          device_platform TEXT NOT NULL,
          device_platform_version TEXT NOT NULL,
          app_environment TEXT NOT NULL,
          api_base_url TEXT,
          context_json TEXT NOT NULL
        );
      `);

      await database.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_mobile_runtime_error_events_captured_at
        ON mobile_runtime_error_events (captured_at DESC);
      `);
    },
  },
  {
    id: 5,
    apply: async (database, _now) => {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS assigned_work_package_summaries (
          owner_user_id TEXT NOT NULL,
          work_package_id TEXT NOT NULL,
          source_reference TEXT NOT NULL,
          title TEXT NOT NULL,
          assigned_team TEXT NOT NULL,
          priority TEXT NOT NULL,
          status TEXT NOT NULL,
          package_version INTEGER NOT NULL,
          snapshot_contract_version TEXT NOT NULL,
          tag_count INTEGER NOT NULL,
          due_starts_at TEXT,
          due_ends_at TEXT,
          updated_at TEXT NOT NULL,
          last_downloaded_at TEXT,
          local_updated_at TEXT NOT NULL,
          PRIMARY KEY (owner_user_id, work_package_id)
        );
      `);

      await database.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_assigned_work_package_summaries_owner
        ON assigned_work_package_summaries (owner_user_id, due_ends_at ASC, work_package_id ASC);
      `);

      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS assigned_work_package_snapshots (
          owner_user_id TEXT NOT NULL,
          work_package_id TEXT NOT NULL,
          package_version INTEGER NOT NULL,
          snapshot_contract_version TEXT NOT NULL,
          snapshot_json TEXT NOT NULL,
          downloaded_at TEXT NOT NULL,
          server_updated_at TEXT NOT NULL,
          PRIMARY KEY (owner_user_id, work_package_id)
        );
      `);
    },
  },
  {
    id: 6,
    apply: async (database, _now) => {
      await database.execAsync(`
        ALTER TABLE assigned_work_package_snapshots
        ADD COLUMN generated_at TEXT;
      `);
    },
  },
  {
    id: 7,
    apply: async (database, _now) => {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS user_partitioned_execution_progress (
          owner_user_id TEXT NOT NULL,
          work_package_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          template_id TEXT NOT NULL,
          template_version TEXT NOT NULL,
          instrument_family TEXT NOT NULL,
          test_pattern TEXT NOT NULL,
          current_step_id TEXT NOT NULL,
          visited_step_ids_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (owner_user_id, work_package_id, tag_id, template_id)
        );
      `);

      await database.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_user_partitioned_execution_progress_owner
        ON user_partitioned_execution_progress (
          owner_user_id,
          work_package_id,
          tag_id,
          updated_at DESC
        );
      `);
    },
  },
  {
    id: 8,
    apply: async (database, _now) => {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS user_partitioned_execution_calculations (
          owner_user_id TEXT NOT NULL,
          work_package_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          template_id TEXT NOT NULL,
          template_version TEXT NOT NULL,
          calculation_mode TEXT NOT NULL,
          acceptance_style TEXT NOT NULL,
          raw_inputs_json TEXT NOT NULL,
          result_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (owner_user_id, work_package_id, tag_id, template_id)
        );
      `);

      await database.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_user_partitioned_execution_calculations_owner
        ON user_partitioned_execution_calculations (
          owner_user_id,
          work_package_id,
          tag_id,
          updated_at DESC
        );
      `);
    },
  },
  {
    id: 9,
    apply: async (database, _now) => {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS user_partitioned_execution_calculations_v9 (
          owner_user_id TEXT NOT NULL,
          work_package_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          template_id TEXT NOT NULL,
          template_version TEXT NOT NULL,
          calculation_mode TEXT NOT NULL,
          acceptance_style TEXT NOT NULL,
          raw_inputs_json TEXT NOT NULL,
          result_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (
            owner_user_id,
            work_package_id,
            tag_id,
            template_id,
            template_version
          )
        );

        INSERT INTO user_partitioned_execution_calculations_v9 (
          owner_user_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          calculation_mode,
          acceptance_style,
          raw_inputs_json,
          result_json,
          updated_at
        )
        SELECT
          owner_user_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          calculation_mode,
          acceptance_style,
          raw_inputs_json,
          result_json,
          updated_at
        FROM user_partitioned_execution_calculations;

        DROP TABLE user_partitioned_execution_calculations;

        ALTER TABLE user_partitioned_execution_calculations_v9
        RENAME TO user_partitioned_execution_calculations;

        CREATE INDEX IF NOT EXISTS idx_user_partitioned_execution_calculations_owner
        ON user_partitioned_execution_calculations (
          owner_user_id,
          work_package_id,
          tag_id,
          updated_at DESC
        );
      `);
    },
  },
  {
    id: 10,
    apply: async (database, _now) => {
      await database.execAsync(`
        ALTER TABLE user_partitioned_execution_calculations
        ADD COLUMN execution_context_json TEXT NOT NULL DEFAULT '{}';
      `);
    },
  },
];

export async function runMigrations(
  database: LocalDatabase,
): Promise<DatabaseMigrationSummary> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = await database.getAllAsync<{ id: number }>(
    'SELECT id FROM schema_migrations ORDER BY id ASC;',
  );
  const appliedMigrationIds = new Set(appliedRows.map((row) => row.id));
  const newlyApplied: number[] = [];

  for (const migration of migrations) {
    if (appliedMigrationIds.has(migration.id)) {
      continue;
    }

    const now = new Date().toISOString();

    await database.execAsync('BEGIN IMMEDIATE;');

    try {
      await migration.apply(database, now);
      await database.runAsync(
        'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?);',
        [migration.id, now],
      );
      await database.execAsync('COMMIT;');
      newlyApplied.push(migration.id);
    } catch (error) {
      await database.execAsync('ROLLBACK;');
      throw error;
    }
  }

  return {
    appliedMigrationIds: newlyApplied.map(String),
    currentSchemaVersion: migrations.length,
  };
}

export const localDatabaseSeeds = {
  foundationRecordId: FOUNDATION_RECORD_ID,
};
