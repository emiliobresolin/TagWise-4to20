import type { QueryResultRow } from 'pg';

import type { QueryableDatabase } from '../../platform/db/postgres';
import {
  MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
  type MobileRuntimeErrorRecord,
} from './model';

interface MobileRuntimeErrorRow extends QueryResultRow {
  id: string;
  reporting_user_id: string;
  severity: 'error';
  error_name: string;
  message: string;
  stack: string | null;
  captured_at: string;
  reported_at: string;
  session_user_id: string | null;
  session_role: MobileRuntimeErrorRecord['sessionRole'];
  session_connection_mode: MobileRuntimeErrorRecord['sessionConnectionMode'];
  shell_route: string | null;
  device_platform: string;
  device_platform_version: string;
  app_environment: string;
  api_base_url: string | null;
  context_json: unknown;
}

export class MobileDiagnosticsRepository {
  constructor(private readonly database: QueryableDatabase) {}

  async upsertRuntimeError(record: MobileRuntimeErrorRecord): Promise<MobileRuntimeErrorRecord> {
    const result = await this.database.query<MobileRuntimeErrorRow>(
      `
        INSERT INTO mobile_runtime_error_events (
          id,
          reporting_user_id,
          severity,
          error_name,
          message,
          stack,
          captured_at,
          reported_at,
          session_user_id,
          session_role,
          session_connection_mode,
          shell_route,
          device_platform,
          device_platform_version,
          app_environment,
          api_base_url,
          context_json
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
          reported_at = EXCLUDED.reported_at
        RETURNING
          id,
          reporting_user_id,
          severity,
          error_name,
          message,
          stack,
          captured_at,
          reported_at,
          session_user_id,
          session_role,
          session_connection_mode,
          shell_route,
          device_platform,
          device_platform_version,
          app_environment,
          api_base_url,
          context_json;
      `,
      [
        record.id,
        record.reportingUserId,
        record.severity,
        record.errorName,
        record.message,
        record.stack,
        record.capturedAt,
        record.reportedAt,
        record.sessionUserId,
        record.sessionRole,
        record.sessionConnectionMode,
        record.shellRoute,
        record.devicePlatform,
        record.devicePlatformVersion,
        record.appEnvironment,
        record.apiBaseUrl,
        record.contextJson,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to persist mobile runtime error.');
    }

    return mapMobileRuntimeErrorRow(row);
  }
}

function mapMobileRuntimeErrorRow(row: MobileRuntimeErrorRow): MobileRuntimeErrorRecord {
  return {
    contractVersion: MOBILE_DIAGNOSTICS_API_CONTRACT_VERSION,
    id: row.id,
    reportingUserId: row.reporting_user_id,
    severity: row.severity,
    errorName: row.error_name,
    message: row.message,
    stack: row.stack,
    capturedAt: row.captured_at,
    reportedAt: row.reported_at,
    sessionUserId: row.session_user_id,
    sessionRole: parseUserRole(row.session_role),
    sessionConnectionMode: parseConnectionMode(row.session_connection_mode),
    shellRoute: row.shell_route,
    devicePlatform: row.device_platform,
    devicePlatformVersion: row.device_platform_version,
    appEnvironment: row.app_environment,
    apiBaseUrl: row.api_base_url,
    contextJson:
      typeof row.context_json === 'string'
        ? row.context_json
        : JSON.stringify(row.context_json ?? {}),
  };
}

function parseUserRole(value: unknown): MobileRuntimeErrorRecord['sessionRole'] {
  if (value === 'technician' || value === 'supervisor' || value === 'manager') {
    return value;
  }

  return null;
}

function parseConnectionMode(
  value: unknown,
): MobileRuntimeErrorRecord['sessionConnectionMode'] {
  if (value === 'connected' || value === 'offline') {
    return value;
  }

  return null;
}
