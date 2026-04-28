import {
  DEFAULT_SHELL_ROUTE,
  SHELL_ROUTE_PREFERENCE_KEY,
  type ShellRoute,
} from '../../../features/app-shell/model';
import type { LocalDatabase } from '../sqlite/types';

interface AppPreferenceRow {
  value: string;
}

export class AppPreferencesRepository {
  constructor(private readonly database: LocalDatabase) {}

  async getShellRoute(): Promise<ShellRoute> {
    const row = await this.database.getFirstAsync<AppPreferenceRow>(
      'SELECT value FROM app_preferences WHERE key = ?;',
      [SHELL_ROUTE_PREFERENCE_KEY],
    );

    if (!row) {
      return DEFAULT_SHELL_ROUTE;
    }

    return isShellRoute(row.value) ? row.value : DEFAULT_SHELL_ROUTE;
  }

  async setShellRoute(route: ShellRoute): Promise<void> {
    const now = new Date().toISOString();

    await this.database.runAsync(
      `
        INSERT INTO app_preferences (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at;
      `,
      [SHELL_ROUTE_PREFERENCE_KEY, route, now],
    );
  }
}

function isShellRoute(value: string): value is ShellRoute {
  return (
    value === 'foundation' ||
    value === 'storage' ||
    value === 'packages' ||
    value === 'review'
  );
}
