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
    {
        id: '0003_audit_events',
        sql: `
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_object_type TEXT NOT NULL,
        target_object_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        prior_state TEXT,
        next_state TEXT,
        comment TEXT,
        metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE INDEX IF NOT EXISTS idx_audit_events_target
      ON audit_events (target_object_type, target_object_id, occurred_at ASC);

      CREATE INDEX IF NOT EXISTS idx_audit_events_correlation
      ON audit_events (correlation_id);
    `,
    },
    {
        id: '0004_assigned_work_packages',
        sql: `
      CREATE TABLE IF NOT EXISTS assigned_work_packages (
        id TEXT PRIMARY KEY,
        source_reference TEXT NOT NULL,
        assigned_user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        assigned_team TEXT NOT NULL,
        priority TEXT NOT NULL CHECK (priority IN ('routine', 'high')),
        status TEXT NOT NULL CHECK (status IN ('assigned', 'in_progress', 'pending_review', 'completed')),
        package_version INTEGER NOT NULL,
        snapshot_contract_version TEXT NOT NULL,
        tag_count INTEGER NOT NULL,
        due_starts_at TEXT,
        due_ends_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_assigned_work_packages_assigned_user
      ON assigned_work_packages (assigned_user_id, due_ends_at ASC, id ASC);

      CREATE TABLE IF NOT EXISTS assigned_work_package_snapshots (
        work_package_id TEXT PRIMARY KEY REFERENCES assigned_work_packages(id) ON DELETE CASCADE,
        snapshot_contract_version TEXT NOT NULL,
        snapshot_json JSONB NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
    },
    {
        id: '0005_evidence_sync_records',
        sql: `
      CREATE TABLE IF NOT EXISTS evidence_sync_records (
        server_evidence_id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        report_id TEXT NOT NULL,
        work_package_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        template_version TEXT NOT NULL,
        evidence_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT,
        execution_step_id TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('camera', 'library')),
        local_captured_at TEXT NOT NULL,
        metadata_idempotency_key TEXT NOT NULL,
        storage_object_key TEXT,
        metadata_received_at TEXT NOT NULL,
        binary_uploaded_at TEXT,
        presence_finalized_at TEXT,
        presence_status TEXT NOT NULL CHECK (presence_status IN ('metadata-recorded', 'binary-finalized')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (owner_user_id, report_id, evidence_id)
      );

      CREATE INDEX IF NOT EXISTS idx_evidence_sync_owner_report
      ON evidence_sync_records (owner_user_id, report_id, evidence_id);

      CREATE INDEX IF NOT EXISTS idx_evidence_sync_status
      ON evidence_sync_records (presence_status, updated_at ASC);
    `,
    },
    {
        id: '0006_report_submission_records',
        sql: `
      CREATE TABLE IF NOT EXISTS report_submission_records (
        owner_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        report_id TEXT NOT NULL,
        work_package_id TEXT NOT NULL,
        tag_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        template_version TEXT NOT NULL,
        local_object_version TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        server_report_version TEXT NOT NULL,
        report_state TEXT NOT NULL CHECK (report_state IN (
          'submitted-pending-review',
          'escalated-pending-manager-review',
          'returned-by-supervisor',
          'returned-by-manager',
          'approved'
        )),
        lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN (
          'Submitted - Pending Supervisor Review',
          'Escalated - Pending Manager Review',
          'Returned by Supervisor',
          'Returned by Manager',
          'Approved'
        )),
        sync_state TEXT NOT NULL CHECK (sync_state IN ('synced')),
        submitted_at TEXT NOT NULL,
        accepted_at TEXT NOT NULL,
        payload_json JSONB NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_user_id, report_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_report_submission_server_version
      ON report_submission_records (server_report_version);

      CREATE INDEX IF NOT EXISTS idx_report_submission_review_queue
      ON report_submission_records (work_package_id, lifecycle_state, accepted_at ASC);
    `,
    },
    {
        id: '0007_supervisor_review_routes',
        sql: `
      CREATE TABLE IF NOT EXISTS supervisor_review_routes (
        supervisor_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        work_package_id TEXT NOT NULL REFERENCES assigned_work_packages(id) ON DELETE CASCADE,
        route_state TEXT NOT NULL CHECK (route_state IN ('active')),
        routed_at TEXT NOT NULL,
        PRIMARY KEY (supervisor_user_id, work_package_id)
      );

      CREATE INDEX IF NOT EXISTS idx_supervisor_review_routes_supervisor
      ON supervisor_review_routes (supervisor_user_id, route_state, work_package_id);
    `,
    },
    {
        id: '0008_supervisor_standard_decision_states',
        sql: `
      ALTER TABLE report_submission_records
        DROP CONSTRAINT IF EXISTS report_submission_records_report_state_check;

      ALTER TABLE report_submission_records
        ADD CONSTRAINT report_submission_records_report_state_check
        CHECK (report_state IN (
          'submitted-pending-review',
          'returned-by-supervisor',
          'approved'
        ));

      ALTER TABLE report_submission_records
        DROP CONSTRAINT IF EXISTS report_submission_records_lifecycle_state_check;

      ALTER TABLE report_submission_records
        ADD CONSTRAINT report_submission_records_lifecycle_state_check
        CHECK (lifecycle_state IN (
          'Submitted - Pending Supervisor Review',
          'Returned by Supervisor',
          'Approved'
        ));
    `,
    },
    {
        id: '0009_supervisor_escalation_manager_routes',
        sql: `
      ALTER TABLE report_submission_records
        DROP CONSTRAINT IF EXISTS report_submission_records_report_state_check;

      ALTER TABLE report_submission_records
        ADD CONSTRAINT report_submission_records_report_state_check
        CHECK (report_state IN (
          'submitted-pending-review',
          'escalated-pending-manager-review',
          'returned-by-supervisor',
          'approved'
        ));

      ALTER TABLE report_submission_records
        DROP CONSTRAINT IF EXISTS report_submission_records_lifecycle_state_check;

      ALTER TABLE report_submission_records
        ADD CONSTRAINT report_submission_records_lifecycle_state_check
        CHECK (lifecycle_state IN (
          'Submitted - Pending Supervisor Review',
          'Escalated - Pending Manager Review',
          'Returned by Supervisor',
          'Approved'
        ));

      CREATE TABLE IF NOT EXISTS manager_review_routes (
        manager_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        owner_user_id TEXT NOT NULL,
        report_id TEXT NOT NULL,
        route_state TEXT NOT NULL CHECK (route_state IN ('active')),
        routed_at TEXT NOT NULL,
        escalation_audit_event_id TEXT NOT NULL REFERENCES audit_events(id) ON DELETE RESTRICT,
        PRIMARY KEY (manager_user_id, owner_user_id, report_id),
        FOREIGN KEY (owner_user_id, report_id)
          REFERENCES report_submission_records(owner_user_id, report_id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_manager_review_routes_manager
      ON manager_review_routes (manager_user_id, route_state, routed_at ASC, report_id);
    `,
    },
    {
        id: '0010_manager_decision_states',
        sql: `
      ALTER TABLE report_submission_records
        DROP CONSTRAINT IF EXISTS report_submission_records_report_state_check;

      ALTER TABLE report_submission_records
        ADD CONSTRAINT report_submission_records_report_state_check
        CHECK (report_state IN (
          'submitted-pending-review',
          'escalated-pending-manager-review',
          'returned-by-supervisor',
          'returned-by-manager',
          'approved'
        ));

      ALTER TABLE report_submission_records
        DROP CONSTRAINT IF EXISTS report_submission_records_lifecycle_state_check;

      ALTER TABLE report_submission_records
        ADD CONSTRAINT report_submission_records_lifecycle_state_check
        CHECK (lifecycle_state IN (
          'Submitted - Pending Supervisor Review',
          'Escalated - Pending Manager Review',
          'Returned by Supervisor',
          'Returned by Manager',
          'Approved'
        ));
    `,
    },
    {
        id: '0011_release_observability_mobile_errors',
        sql: `
      CREATE TABLE IF NOT EXISTS mobile_runtime_error_events (
        id TEXT PRIMARY KEY,
        reporting_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        severity TEXT NOT NULL CHECK (severity IN ('error')),
        error_name TEXT NOT NULL,
        message TEXT NOT NULL,
        stack TEXT,
        captured_at TEXT NOT NULL,
        reported_at TEXT NOT NULL,
        session_user_id TEXT,
        session_role TEXT CHECK (session_role IN ('technician', 'supervisor', 'manager') OR session_role IS NULL),
        session_connection_mode TEXT CHECK (
          session_connection_mode IN ('connected', 'offline') OR session_connection_mode IS NULL
        ),
        shell_route TEXT,
        device_platform TEXT NOT NULL,
        device_platform_version TEXT NOT NULL,
        app_environment TEXT NOT NULL,
        api_base_url TEXT,
        context_json JSONB NOT NULL DEFAULT '{}'::jsonb
      );

      CREATE INDEX IF NOT EXISTS idx_mobile_runtime_error_events_reported_at
      ON mobile_runtime_error_events (reported_at DESC);

      CREATE INDEX IF NOT EXISTS idx_mobile_runtime_error_events_platform
      ON mobile_runtime_error_events (device_platform, reported_at DESC);
    `,
    },
    {
        id: '0012_evidence_access_retention_guardrails',
        sql: `
      ALTER TABLE evidence_sync_records
        ADD COLUMN IF NOT EXISTS file_size_bytes INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE evidence_sync_records
        ADD COLUMN IF NOT EXISTS retention_policy TEXT NOT NULL DEFAULT 'v1-evidence-finalized-365-days';

      ALTER TABLE evidence_sync_records
        ADD COLUMN IF NOT EXISTS retention_expires_at TEXT;

      ALTER TABLE evidence_sync_records
        DROP CONSTRAINT IF EXISTS evidence_sync_records_file_size_bytes_check;

      ALTER TABLE evidence_sync_records
        ADD CONSTRAINT evidence_sync_records_file_size_bytes_check
        CHECK (file_size_bytes >= 0);

      CREATE INDEX IF NOT EXISTS idx_evidence_sync_retention
      ON evidence_sync_records (retention_expires_at ASC);
    `,
    },
    {
        id: '0013_worker_job_resilience',
        sql: `
      CREATE TABLE IF NOT EXISTS worker_jobs (
        id TEXT PRIMARY KEY,
        job_type TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL CHECK (
          status IN ('queued', 'running', 'retryable', 'succeeded', 'failed')
        ),
        payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        available_at TEXT NOT NULL,
        locked_by TEXT,
        locked_at TEXT,
        last_error TEXT,
        last_started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (attempt_count >= 0),
        CHECK (max_attempts > 0)
      );

      CREATE INDEX IF NOT EXISTS idx_worker_jobs_ready
      ON worker_jobs (status, available_at ASC, created_at ASC);

      CREATE INDEX IF NOT EXISTS idx_worker_jobs_failed
      ON worker_jobs (status, updated_at DESC)
      WHERE status = 'failed';

      CREATE TABLE IF NOT EXISTS worker_job_drill_events (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES worker_jobs(id) ON DELETE CASCADE,
        idempotency_key TEXT NOT NULL UNIQUE,
        processed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_worker_job_drill_events_job
      ON worker_job_drill_events (job_id, processed_at ASC);
    `,
    },
    {
        // Story 8.9 D-01: per-report AI diagnosis persistence. Keyed by the
        // canonical (owner_user_id, report_id) tuple so the supervisor / technician
        // / manager projections can all read the same row. The state mirrors the
        // mobile VisualAiDiagnosisProjectionInput union; the structured result
        // payload is persisted as JSON when available. Failures are nonblocking by
        // design — a 'failed-nonblocking' row is the canonical signal that the
        // provider rejected the request without halting the report itself.
        id: '0014_ai_diagnoses',
        sql: `
      CREATE TABLE IF NOT EXISTS ai_diagnoses (
        owner_user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        report_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK (
          state IN ('pending', 'available', 'unavailable', 'failed-nonblocking')
        ),
        result_json JSONB,
        provider_label TEXT,
        summary TEXT,
        detail TEXT,
        failure_reason TEXT,
        last_requested_at TEXT NOT NULL,
        last_request_source TEXT NOT NULL CHECK (
          last_request_source IN ('auto-on-submit', 'manual')
        ),
        generated_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_user_id, report_id),
        FOREIGN KEY (owner_user_id, report_id)
          REFERENCES report_submission_records(owner_user_id, report_id)
          ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ai_diagnoses_state
      ON ai_diagnoses (state, last_requested_at ASC);
    `,
    },
    {
        // Story 9.1: canonical instruments catalog. Supervisors compose work
        // packages by selecting from this pool; each row references a default
        // template + guidance that already exist in the work-packages template
        // registry, so authored snapshots use the same execution shape as seed
        // packages.
        id: '0015_instruments_catalog',
        sql: `
      CREATE TABLE IF NOT EXISTS instruments (
        id TEXT PRIMARY KEY,
        tag_code TEXT NOT NULL UNIQUE,
        short_description TEXT NOT NULL,
        area TEXT NOT NULL,
        parent_asset_reference TEXT NOT NULL,
        instrument_family TEXT NOT NULL CHECK (instrument_family IN (
          'pressure transmitter',
          'temperature transmitter / RTD input',
          'level transmitter',
          'control valve with positioner',
          'analog 4-20 mA loop'
        )),
        instrument_subtype TEXT NOT NULL,
        measured_variable TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        range_min DOUBLE PRECISION NOT NULL,
        range_max DOUBLE PRECISION NOT NULL,
        range_unit TEXT NOT NULL,
        tolerance TEXT NOT NULL,
        criticality TEXT NOT NULL CHECK (criticality IN ('medium', 'high')),
        default_template_id TEXT NOT NULL,
        default_guidance_reference_id TEXT NOT NULL,
        default_history_summary_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_instruments_family
      ON instruments (instrument_family, tag_code ASC);
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
