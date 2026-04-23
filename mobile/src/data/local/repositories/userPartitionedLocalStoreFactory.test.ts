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

    await technicianStore.executionProgress.saveProgress({
      workPackageId: 'wp-101',
      tagId: 'tag-101',
      templateId: 'tpl-pressure',
      templateVersion: '2026-04-v1',
      instrumentFamily: 'pressure transmitter',
      testPattern: 'as-found calibration check',
      currentStepId: 'history',
      visitedStepIds: ['context', 'history'],
      updatedAt: '2026-04-20T10:15:00.000Z',
    });

    await technicianStore.executionCalculations.saveCalculation({
      workPackageId: 'wp-101',
      tagId: 'tag-101',
      templateId: 'tpl-pressure',
      templateVersion: '2026-04-v1',
      calculationMode: 'point deviation by span',
      acceptanceStyle: 'within tolerance by point and overall span',
      executionContext: {
        conversionBasisSummary: null,
        expectedRangeSummary: '0 to 10 bar maps to 4-20 mA.',
      },
      rawInputs: {
        expectedValue: '5',
        observedValue: '5.1',
      },
      result: {
        signedDeviation: 0.1,
        absoluteDeviation: 0.1,
        percentOfSpan: 1,
        acceptance: 'fail',
        acceptanceReason: 'Tolerance is 0.25% of span.',
      },
      updatedAt: '2026-04-20T10:16:00.000Z',
    });

    await technicianStore.executionEvidence.saveEvidence({
      workPackageId: 'wp-101',
      tagId: 'tag-101',
      templateId: 'tpl-pressure',
      templateVersion: '2026-04-v1',
      draftReportId: 'tag-report:wp-101:tag-101',
      executionStepId: 'guidance',
      structuredReadings: null,
      observationNotes: 'Impulse path checked locally.',
      checklistOutcomes: [
        {
          checklistItemId: 'pressure-path-check',
          outcome: 'completed',
        },
      ],
      createdAt: '2026-04-20T10:17:00.000Z',
      updatedAt: '2026-04-20T10:17:00.000Z',
    });

    await technicianStore.workPackages.upsertCatalog([
      {
        id: 'wp-101',
        sourceReference: 'seed-cmms-101',
        title: 'Technician owned package',
        assignedTeam: 'Instrumentation Alpha',
        priority: 'high',
        status: 'assigned',
        packageVersion: 1,
        snapshotContractVersion: '2026-04-v1',
        tagCount: 1,
        dueWindow: {
          startsAt: '2026-04-20T08:00:00.000Z',
          endsAt: '2026-04-20T17:00:00.000Z',
        },
        updatedAt: '2026-04-19T10:00:00.000Z',
      },
    ]);

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
      await supervisorStore.executionProgress.getProgress('wp-101', 'tag-101', 'tpl-pressure'),
    ).toBeNull();
    expect(
      await supervisorStore.executionCalculations.getCalculation(
        'wp-101',
        'tag-101',
        'tpl-pressure',
        '2026-04-v1',
      ),
    ).toBeNull();
    expect(
      await supervisorStore.executionEvidence.listEvidence(
        'wp-101',
        'tag-101',
        'tpl-pressure',
        '2026-04-v1',
      ),
    ).toEqual([]);
    expect(await supervisorStore.workPackages.listSummaries()).toEqual([]);

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
    expect(
      await technicianStore.executionProgress.getProgress('wp-101', 'tag-101', 'tpl-pressure'),
    ).toMatchObject({
      currentStepId: 'history',
      visitedStepIds: ['context', 'history'],
    });
    expect(
      await technicianStore.executionCalculations.getCalculation(
        'wp-101',
        'tag-101',
        'tpl-pressure',
        '2026-04-v1',
      ),
    ).toMatchObject({
      executionContext: {
        conversionBasisSummary: null,
        expectedRangeSummary: '0 to 10 bar maps to 4-20 mA.',
      },
      rawInputs: {
        expectedValue: '5',
        observedValue: '5.1',
      },
      result: {
        acceptance: 'fail',
      },
    });
    expect(
      await technicianStore.executionEvidence.listEvidence(
        'wp-101',
        'tag-101',
        'tpl-pressure',
        '2026-04-v1',
      ),
    ).toEqual([
      expect.objectContaining({
        draftReportId: 'tag-report:wp-101:tag-101',
        executionStepId: 'guidance',
        observationNotes: 'Impulse path checked locally.',
        checklistOutcomes: [
          {
            checklistItemId: 'pressure-path-check',
            outcome: 'completed',
          },
        ],
      }),
    ]);
    expect(await technicianStore.workPackages.listSummaries()).toHaveLength(1);

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
