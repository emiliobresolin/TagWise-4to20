import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeSqliteDatabase } from '../../../../tests/helpers/createNodeSqliteDatabase';
import { runMigrations } from './migrations';

const createdDirectories: string[] = [];

afterEach(() => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();

    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe('runMigrations', () => {
  it('creates the shell tables and seed data', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-migrations-'));
    createdDirectories.push(tempDirectory);

    const database = createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'));

    const summary = await runMigrations(database);
    const record = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM shell_demo_records;',
    );
    const route = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM app_preferences;',
    );
    const partitionTables = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM sqlite_master
       WHERE type = 'table'
         AND name IN (
           'auth_session_cache',
          'local_work_state',
          'user_partitioned_drafts',
          'user_partitioned_evidence_metadata',
           'user_partitioned_queue_items',
           'user_partitioned_execution_progress',
           'user_partitioned_execution_calculations',
           'user_partitioned_execution_evidence',
           'mobile_runtime_error_events',
           'assigned_work_package_summaries',
           'assigned_work_package_snapshots'
         );`,
    );
    const reportedColumn = await database.getFirstAsync<{ count: number }>(
      `
        SELECT COUNT(*) AS count
        FROM pragma_table_info('mobile_runtime_error_events')
        WHERE name = 'reported_at';
      `,
    );

    expect(summary.currentSchemaVersion).toBe(13);
    expect(summary.appliedMigrationIds).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
      '13',
    ]);
    expect(record?.count).toBe(1);
    expect(route?.count).toBe(0);
    expect(partitionTables?.count).toBe(11);
    expect(reportedColumn?.count).toBe(1);

    await database.closeAsync?.();
  });

  it('is idempotent when the migration runner is invoked again', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-migrations-repeat-'));
    createdDirectories.push(tempDirectory);

    const database = createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'));

    await runMigrations(database);
    const summary = await runMigrations(database);

    const applied = await database.getAllAsync<{ id: number }>(
      'SELECT id FROM schema_migrations ORDER BY id ASC;',
    );
    const record = await database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM shell_demo_records;',
    );

    expect(summary.appliedMigrationIds).toEqual([]);
    expect(applied).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3 },
      { id: 4 },
      { id: 5 },
      { id: 6 },
      { id: 7 },
      { id: 8 },
      { id: 9 },
      { id: 10 },
      { id: 11 },
      { id: 12 },
      { id: 13 },
    ]);
    expect(record?.count).toBe(1);

    await database.closeAsync?.();
  });

  it('migrates populated pre-v9 execution calculation rows without loss or corruption', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-migrations-legacy-v8-'));
    createdDirectories.push(tempDirectory);

    const database = createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'));

    await database.execAsync(`
      CREATE TABLE schema_migrations (
        id INTEGER PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      );

      INSERT INTO schema_migrations (id, applied_at) VALUES
        (1, '2026-04-01T00:00:00.000Z'),
        (2, '2026-04-01T00:00:00.000Z'),
        (3, '2026-04-01T00:00:00.000Z'),
        (4, '2026-04-01T00:00:00.000Z'),
        (5, '2026-04-01T00:00:00.000Z'),
        (6, '2026-04-01T00:00:00.000Z'),
        (7, '2026-04-01T00:00:00.000Z'),
        (8, '2026-04-01T00:00:00.000Z');

      CREATE TABLE user_partitioned_execution_calculations (
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

      CREATE INDEX idx_user_partitioned_execution_calculations_owner
      ON user_partitioned_execution_calculations (
        owner_user_id,
        work_package_id,
        tag_id,
        updated_at DESC
      );
    `);

    await database.runAsync(
      `
        INSERT INTO user_partitioned_execution_calculations (
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [
        'user-technician',
        'wp-legacy-001',
        'tag-legacy-001',
        'tpl-pressure',
        '2026-04-v1',
        'point deviation by span',
        'within tolerance by point and overall span',
        '{"expectedValue":"5","observedValue":"5.02"}',
        '{"signedDeviation":0.02,"absoluteDeviation":0.02,"percentOfSpan":0.2,"acceptance":"pass","acceptanceReason":"Tolerance is 0.25% of span."}',
        '2026-04-19T11:05:00.000Z',
      ],
    );

    const summary = await runMigrations(database);
    const migratedRows = await database.getAllAsync<{
      template_version: string;
      raw_inputs_json: string;
      result_json: string;
      updated_at: string;
    }>(
      `
        SELECT template_version, raw_inputs_json, result_json, updated_at
        FROM user_partitioned_execution_calculations
        WHERE owner_user_id = ?
          AND work_package_id = ?
          AND tag_id = ?
          AND template_id = ?
        ORDER BY template_version ASC;
      `,
      ['user-technician', 'wp-legacy-001', 'tag-legacy-001', 'tpl-pressure'],
    );

    expect(summary.currentSchemaVersion).toBe(13);
    expect(summary.appliedMigrationIds).toEqual(['9', '10', '11', '12', '13']);
    expect(migratedRows).toEqual([
      {
        template_version: '2026-04-v1',
        raw_inputs_json: '{"expectedValue":"5","observedValue":"5.02"}',
        result_json:
          '{"signedDeviation":0.02,"absoluteDeviation":0.02,"percentOfSpan":0.2,"acceptance":"pass","acceptanceReason":"Tolerance is 0.25% of span."}',
        updated_at: '2026-04-19T11:05:00.000Z',
      },
    ]);

    const insertSecondVersion = await database.runAsync(
      `
        INSERT INTO user_partitioned_execution_calculations (
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [
        'user-technician',
        'wp-legacy-001',
        'tag-legacy-001',
        'tpl-pressure',
        '2026-05-v2',
        'point deviation by span',
        'within tolerance by point and overall span',
        '{"expectedValue":"5","observedValue":"5.05"}',
        '{"signedDeviation":0.05,"absoluteDeviation":0.05,"percentOfSpan":0.5,"acceptance":"fail","acceptanceReason":"Tolerance is 0.25% of span."}',
        '2026-04-20T09:00:00.000Z',
      ],
    );
    const rowCount = await database.getFirstAsync<{ count: number }>(
      `
        SELECT COUNT(*) as count
        FROM user_partitioned_execution_calculations
        WHERE owner_user_id = ?
          AND work_package_id = ?
          AND tag_id = ?
          AND template_id = ?;
      `,
      ['user-technician', 'wp-legacy-001', 'tag-legacy-001', 'tpl-pressure'],
    );

    expect(insertSecondVersion.changes).toBe(1);
    expect(rowCount?.count).toBe(2);

    await database.closeAsync?.();
  });

  it('migrates populated pre-v10 execution calculation rows and defaults execution context safely', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-migrations-legacy-v9-'));
    createdDirectories.push(tempDirectory);

    const database = createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'));

    await database.execAsync(`
      CREATE TABLE schema_migrations (
        id INTEGER PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      );

      INSERT INTO schema_migrations (id, applied_at) VALUES
        (1, '2026-04-01T00:00:00.000Z'),
        (2, '2026-04-01T00:00:00.000Z'),
        (3, '2026-04-01T00:00:00.000Z'),
        (4, '2026-04-01T00:00:00.000Z'),
        (5, '2026-04-01T00:00:00.000Z'),
        (6, '2026-04-01T00:00:00.000Z'),
        (7, '2026-04-01T00:00:00.000Z'),
        (8, '2026-04-01T00:00:00.000Z'),
        (9, '2026-04-01T00:00:00.000Z');

      CREATE TABLE user_partitioned_execution_calculations (
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
    `);

    await database.runAsync(
      `
        INSERT INTO user_partitioned_execution_calculations (
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [
        'user-technician',
        'wp-loop-001',
        'tag-loop-001',
        'tpl-loop-integrity',
        '2026-04-v1',
        'expected current vs measured current',
        'within tolerance at each test point',
        '{"expectedValue":"12","observedValue":"12.1"}',
        '{"signedDeviation":0.1,"absoluteDeviation":0.1,"percentOfSpan":0.625,"acceptance":"pass","acceptanceReason":"Tolerance is 1% of span."}',
        '2026-04-21T09:00:00.000Z',
      ],
    );

    const summary = await runMigrations(database);
    const migratedRow = await database.getFirstAsync<{
      execution_context_json: string;
      raw_inputs_json: string;
      result_json: string;
    }>(
      `
        SELECT execution_context_json, raw_inputs_json, result_json
        FROM user_partitioned_execution_calculations
        WHERE owner_user_id = ?
          AND work_package_id = ?
          AND tag_id = ?
          AND template_id = ?
          AND template_version = ?;
      `,
      ['user-technician', 'wp-loop-001', 'tag-loop-001', 'tpl-loop-integrity', '2026-04-v1'],
    );

    expect(summary.currentSchemaVersion).toBe(13);
    expect(summary.appliedMigrationIds).toEqual(['10', '11', '12', '13']);
    expect(migratedRow).toEqual({
      execution_context_json: '{}',
      raw_inputs_json: '{"expectedValue":"12","observedValue":"12.1"}',
      result_json:
        '{"signedDeviation":0.1,"absoluteDeviation":0.1,"percentOfSpan":0.625,"acceptance":"pass","acceptanceReason":"Tolerance is 1% of span."}',
    });

    await database.closeAsync?.();
  });

  it('migrates populated pre-v12 execution evidence rows and defaults risk justifications safely', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-migrations-legacy-v11-'));
    createdDirectories.push(tempDirectory);

    const database = createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'));

    await database.execAsync(`
      CREATE TABLE schema_migrations (
        id INTEGER PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      );

      INSERT INTO schema_migrations (id, applied_at) VALUES
        (1, '2026-04-01T00:00:00.000Z'),
        (2, '2026-04-01T00:00:00.000Z'),
        (3, '2026-04-01T00:00:00.000Z'),
        (4, '2026-04-01T00:00:00.000Z'),
        (5, '2026-04-01T00:00:00.000Z'),
        (6, '2026-04-01T00:00:00.000Z'),
        (7, '2026-04-01T00:00:00.000Z'),
        (8, '2026-04-01T00:00:00.000Z'),
        (9, '2026-04-01T00:00:00.000Z'),
        (10, '2026-04-01T00:00:00.000Z'),
        (11, '2026-04-01T00:00:00.000Z');

      CREATE TABLE user_partitioned_execution_evidence (
        owner_user_id TEXT NOT NULL,
        work_package_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        template_version TEXT NOT NULL,
        draft_report_id TEXT NOT NULL,
        execution_step_id TEXT NOT NULL,
        structured_readings_json TEXT NOT NULL DEFAULT 'null',
        observation_notes_text TEXT NOT NULL DEFAULT '',
        checklist_outcomes_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (
          owner_user_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          execution_step_id
        )
      );
    `);

    await database.runAsync(
      `
        INSERT INTO user_partitioned_execution_evidence (
          owner_user_id,
          work_package_id,
          tag_id,
          template_id,
          template_version,
          draft_report_id,
          execution_step_id,
          structured_readings_json,
          observation_notes_text,
          checklist_outcomes_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [
        'user-technician',
        'wp-risk-001',
        'tag-risk-001',
        'tpl-pressure',
        '2026-04-v1',
        'tag-report:wp-risk-001:tag-risk-001',
        'guidance',
        'null',
        'Impulse path checked locally.',
        '[{"checklistItemId":"pressure-path-check","outcome":"completed"}]',
        '2026-04-21T09:00:00.000Z',
        '2026-04-21T09:00:00.000Z',
      ],
    );

    const summary = await runMigrations(database);
    const migratedRow = await database.getFirstAsync<{
      observation_notes_text: string;
      checklist_outcomes_json: string;
      risk_justifications_json: string;
    }>(
      `
        SELECT observation_notes_text, checklist_outcomes_json, risk_justifications_json
        FROM user_partitioned_execution_evidence
        WHERE owner_user_id = ?
          AND work_package_id = ?
          AND tag_id = ?
          AND template_id = ?
          AND template_version = ?
          AND execution_step_id = ?;
      `,
      [
        'user-technician',
        'wp-risk-001',
        'tag-risk-001',
        'tpl-pressure',
        '2026-04-v1',
        'guidance',
      ],
    );

    expect(summary.currentSchemaVersion).toBe(13);
    expect(summary.appliedMigrationIds).toEqual(['12', '13']);
    expect(migratedRow).toEqual({
      observation_notes_text: 'Impulse path checked locally.',
      checklist_outcomes_json:
        '[{"checklistItemId":"pressure-path-check","outcome":"completed"}]',
      risk_justifications_json: '[]',
    });

    await database.closeAsync?.();
  });
});
