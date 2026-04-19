import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeAppSandboxBoundary } from '../../../../tests/helpers/createNodeAppSandboxBoundary';
import { createNodeSqliteDatabase } from '../../../../tests/helpers/createNodeSqliteDatabase';
import { runMigrations } from '../sqlite/migrations';
import { UserPartitionedLocalStoreFactory } from './userPartitionedLocalStoreFactory';

const createdDirectories: string[] = [];

afterEach(() => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe('UserPartitionedLocalStoreFactory', () => {
  it('isolates local draft, evidence, and queue records by authenticated user', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-owned-local-'));
    createdDirectories.push(tempDirectory);

    const database = createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'));
    await runMigrations(database);

    const factory = new UserPartitionedLocalStoreFactory(
      database,
      createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox')),
    );

    const technicianStore = factory.forUser('user-technician');
    const supervisorStore = factory.forUser('user-supervisor');

    await technicianStore.drafts.saveDraft({
      businessObjectType: 'tag',
      businessObjectId: 'tag-101',
      summaryText: 'Technician owned draft',
      payloadJson: '{"draft":true}',
    });

    const sandboxFile = await technicianStore.mediaSandbox.writeTextFile({
      businessObjectType: 'tag',
      businessObjectId: 'tag-101',
      fileName: 'proof.txt',
      contents: 'owned by technician',
    });

    await technicianStore.evidenceMetadata.saveEvidenceMetadata({
      evidenceId: 'evidence-101',
      businessObjectType: 'tag',
      businessObjectId: 'tag-101',
      fileName: sandboxFile.fileName,
      mediaRelativePath: sandboxFile.relativePath,
      mimeType: 'text/plain',
      payloadJson: '{"evidence":true}',
    });

    await technicianStore.queueItems.enqueue({
      queueItemId: 'queue-101',
      businessObjectType: 'tag',
      businessObjectId: 'tag-101',
      itemKind: 'pending-sync-placeholder',
      payloadJson: '{"queued":true}',
    });

    expect(await supervisorStore.drafts.getDraft({ businessObjectType: 'tag', businessObjectId: 'tag-101' })).toBeNull();
    expect(
      await supervisorStore.evidenceMetadata.listEvidenceByBusinessObject({
        businessObjectType: 'tag',
        businessObjectId: 'tag-101',
      }),
    ).toEqual([]);
    expect(
      await supervisorStore.queueItems.listQueueItemsByBusinessObject({
        businessObjectType: 'tag',
        businessObjectId: 'tag-101',
      }),
    ).toEqual([]);

    expect(
      await technicianStore.drafts.getDraft({ businessObjectType: 'tag', businessObjectId: 'tag-101' }),
    ).not.toBeNull();
    expect(
      await technicianStore.evidenceMetadata.listEvidenceByBusinessObject({
        businessObjectType: 'tag',
        businessObjectId: 'tag-101',
      }),
    ).toHaveLength(1);
    expect(
      await technicianStore.queueItems.listQueueItemsByBusinessObject({
        businessObjectType: 'tag',
        businessObjectId: 'tag-101',
      }),
    ).toHaveLength(1);

    expect(sandboxFile.relativePath).toContain('evidence/users/user-technician/tag/tag-101');
    expect(readFileSync(sandboxFile.uri, 'utf-8')).toBe('owned by technician');

    await database.closeAsync?.();
  });

  it('keeps unsynced local ownership with the original user across logout/login style transitions', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-owned-switch-'));
    createdDirectories.push(tempDirectory);

    const database = createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'));
    await runMigrations(database);

    const factory = new UserPartitionedLocalStoreFactory(
      database,
      createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox')),
    );

    const originalUser = factory.forUser('user-technician');
    await originalUser.queueItems.enqueue({
      queueItemId: 'queue-owned',
      businessObjectType: 'tag',
      businessObjectId: 'tag-201',
      itemKind: 'pending-sync-placeholder',
      payloadJson: '{"owner":"user-technician"}',
    });

    const switchedUser = factory.forUser('user-manager');

    expect(
      await switchedUser.queueItems.listQueueItemsByBusinessObject({
        businessObjectType: 'tag',
        businessObjectId: 'tag-201',
      }),
    ).toEqual([]);
    expect(
      await originalUser.queueItems.listQueueItemsByBusinessObject({
        businessObjectType: 'tag',
        businessObjectId: 'tag-201',
      }),
    ).toHaveLength(1);

    await database.closeAsync?.();
  });
});
