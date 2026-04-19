import type { LocalDatabase } from '../sqlite/types';

const ACTIVE_STATE_KEY = 'active';

interface LocalWorkStateRow {
  unsynced_work_count: number;
}

export class LocalWorkStateRepository {
  constructor(private readonly database: LocalDatabase) {}

  async getUnsyncedWorkCount(): Promise<number> {
    const row = await this.database.getFirstAsync<LocalWorkStateRow>(
      'SELECT unsynced_work_count FROM local_work_state WHERE state_key = ?;',
      [ACTIVE_STATE_KEY],
    );

    return row?.unsynced_work_count ?? 0;
  }

  async hasUnsyncedWork(): Promise<boolean> {
    return (await this.getUnsyncedWorkCount()) > 0;
  }

  async setUnsyncedWorkCount(count: number): Promise<void> {
    const now = new Date().toISOString();

    await this.database.runAsync(
      `
        INSERT INTO local_work_state (state_key, unsynced_work_count, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(state_key) DO UPDATE SET
          unsynced_work_count = excluded.unsynced_work_count,
          updated_at = excluded.updated_at;
      `,
      [ACTIVE_STATE_KEY, Math.max(0, count), now],
    );
  }
}
