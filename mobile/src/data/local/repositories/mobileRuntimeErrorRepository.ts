import type { ShellRoute } from '../../../features/app-shell/model';
import type { UserRole } from '../../../features/auth/model';
import type {
  MobileRuntimeErrorEvent,
  WriteMobileRuntimeErrorInput,
} from '../../../features/diagnostics/model';
import type { LocalDatabase } from '../sqlite/types';

interface MobileRuntimeErrorRow {
  id: string;
  severity: string;
  error_name: string;
  message: string;
  stack: string | null;
  captured_at: string;
  session_user_id: string | null;
  session_role: string | null;
  session_connection_mode: string | null;
  shell_route: string | null;
  device_platform: string;
  device_platform_version: string;
  app_environment: string;
  api_base_url: string | null;
  context_json: string;
}

export class MobileRuntimeErrorRepository {
  constructor(private readonly database: LocalDatabase) {}

  async saveError(input: WriteMobileRuntimeErrorInput): Promise<MobileRuntimeErrorEvent> {
    await this.database.runAsync(
      `
        INSERT INTO mobile_runtime_error_events (
          id,
          severity,
          error_name,
          message,
          stack,
          captured_at,
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [
        input.id,
        input.severity,
        input.errorName,
        input.message,
        input.stack,
        input.capturedAt,
        input.sessionUserId,
        input.sessionRole,
        input.sessionConnectionMode,
        input.shellRoute,
        input.devicePlatform,
        input.devicePlatformVersion,
        input.appEnvironment,
        input.apiBaseUrl,
        input.contextJson,
      ],
    );

    const event = await this.getLatestError();
    if (!event || event.id !== input.id) {
      throw new Error('Failed to reload captured mobile runtime error.');
    }

    return event;
  }

  async getLatestError(): Promise<MobileRuntimeErrorEvent | null> {
    const row = await this.database.getFirstAsync<MobileRuntimeErrorRow>(
      `
        SELECT
          id,
          severity,
          error_name,
          message,
          stack,
          captured_at,
          session_user_id,
          session_role,
          session_connection_mode,
          shell_route,
          device_platform,
          device_platform_version,
          app_environment,
          api_base_url,
          context_json
        FROM mobile_runtime_error_events
        ORDER BY captured_at DESC
        LIMIT 1;
      `,
    );

    return row ? mapMobileRuntimeErrorRow(row) : null;
  }

  async countErrors(): Promise<number> {
    const row = await this.database.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM mobile_runtime_error_events;',
    );

    return row?.count ?? 0;
  }
}

function mapMobileRuntimeErrorRow(row: MobileRuntimeErrorRow): MobileRuntimeErrorEvent {
  return {
    id: row.id,
    severity: row.severity,
    errorName: row.error_name,
    message: row.message,
    stack: row.stack,
    capturedAt: row.captured_at,
    sessionUserId: row.session_user_id,
    sessionRole: parseUserRole(row.session_role),
    sessionConnectionMode: parseSessionConnectionMode(row.session_connection_mode),
    shellRoute: parseShellRoute(row.shell_route),
    devicePlatform: row.device_platform,
    devicePlatformVersion: row.device_platform_version,
    appEnvironment: row.app_environment,
    apiBaseUrl: row.api_base_url,
    contextJson: row.context_json,
  };
}

function parseUserRole(value: string | null): UserRole | null {
  if (value === 'technician' || value === 'supervisor' || value === 'manager') {
    return value;
  }

  return null;
}

function parseSessionConnectionMode(
  value: string | null,
): MobileRuntimeErrorEvent['sessionConnectionMode'] {
  if (value === 'connected' || value === 'offline') {
    return value;
  }

  return null;
}

function parseShellRoute(value: string | null): ShellRoute | null {
  if (
    value === 'foundation' ||
    value === 'storage' ||
    value === 'packages' ||
    value === 'review'
  ) {
    return value;
  }

  return null;
}
