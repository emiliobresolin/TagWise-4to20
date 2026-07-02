import {
  DEFAULT_SHELL_ROUTE,
  SHELL_ROUTE_PREFERENCE_KEY,
  type ShellRoute,
} from '../../../features/app-shell/model';
import type { AppLanguage } from '../../../i18n';
import type { LocalDatabase } from '../sqlite/types';

const LANGUAGE_PREFERENCE_KEY = 'app_language';
const DEFAULT_LANGUAGE: AppLanguage = 'pt-BR';
// Runtime-configurable server URL (api-base-url ledger items): persisted so a
// URL entered on the login screen survives app restarts without an APK
// rebuild. Resolution/validation lives in platform/http/apiBaseUrl.ts.
const API_BASE_URL_PREFERENCE_KEY = 'api_base_url';

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

  async getLanguage(): Promise<AppLanguage> {
    const row = await this.database.getFirstAsync<AppPreferenceRow>(
      'SELECT value FROM app_preferences WHERE key = ?;',
      [LANGUAGE_PREFERENCE_KEY],
    );

    if (!row) {
      return DEFAULT_LANGUAGE;
    }

    return isAppLanguage(row.value) ? row.value : DEFAULT_LANGUAGE;
  }

  async setLanguage(language: AppLanguage): Promise<void> {
    const now = new Date().toISOString();

    await this.database.runAsync(
      `
        INSERT INTO app_preferences (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at;
      `,
      [LANGUAGE_PREFERENCE_KEY, language, now],
    );
  }

  async getApiBaseUrl(): Promise<string | null> {
    const row = await this.database.getFirstAsync<AppPreferenceRow>(
      'SELECT value FROM app_preferences WHERE key = ?;',
      [API_BASE_URL_PREFERENCE_KEY],
    );

    if (!row) {
      return null;
    }

    const value = row.value.trim();
    return value.length > 0 ? value : null;
  }

  async setApiBaseUrl(url: string | null): Promise<void> {
    if (url === null) {
      await this.database.runAsync('DELETE FROM app_preferences WHERE key = ?;', [
        API_BASE_URL_PREFERENCE_KEY,
      ]);
      return;
    }

    const now = new Date().toISOString();

    await this.database.runAsync(
      `
        INSERT INTO app_preferences (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at;
      `,
      [API_BASE_URL_PREFERENCE_KEY, url, now],
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

function isAppLanguage(value: string): value is AppLanguage {
  return value === 'en' || value === 'pt-BR';
}
