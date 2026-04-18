import type { BootstrapDemoRecord } from '../../../features/app-shell/model';
import { localDatabaseSeeds } from '../sqlite/migrations';
import type { LocalDatabase } from '../sqlite/types';

interface BootstrapDemoRow {
  id: string;
  title: string;
  subtitle: string;
  launch_count: number;
  manual_write_count: number;
  last_opened_at: string;
  updated_at: string;
}

export class BootstrapDemoRepository {
  constructor(private readonly database: LocalDatabase) {}

  async getRecord(): Promise<BootstrapDemoRecord> {
    const row = await this.database.getFirstAsync<BootstrapDemoRow>(
      `
        SELECT
          id,
          title,
          subtitle,
          launch_count,
          manual_write_count,
          last_opened_at,
          updated_at
        FROM shell_demo_records
        WHERE id = ?;
      `,
      [localDatabaseSeeds.foundationRecordId],
    );

    if (!row) {
      throw new Error('Missing shell demo record after database bootstrap.');
    }

    return mapBootstrapDemoRow(row);
  }

  async recordLaunch(): Promise<BootstrapDemoRecord> {
    const now = new Date().toISOString();

    await this.database.runAsync(
      `
        UPDATE shell_demo_records
        SET
          launch_count = launch_count + 1,
          last_opened_at = ?,
          updated_at = ?
        WHERE id = ?;
      `,
      [now, now, localDatabaseSeeds.foundationRecordId],
    );

    return this.getRecord();
  }

  async recordManualWrite(): Promise<BootstrapDemoRecord> {
    const now = new Date().toISOString();

    await this.database.runAsync(
      `
        UPDATE shell_demo_records
        SET
          manual_write_count = manual_write_count + 1,
          updated_at = ?
        WHERE id = ?;
      `,
      [now, localDatabaseSeeds.foundationRecordId],
    );

    return this.getRecord();
  }
}

function mapBootstrapDemoRow(row: BootstrapDemoRow): BootstrapDemoRecord {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    launchCount: row.launch_count,
    manualWriteCount: row.manual_write_count,
    lastOpenedAt: row.last_opened_at,
    updatedAt: row.updated_at,
  };
}
