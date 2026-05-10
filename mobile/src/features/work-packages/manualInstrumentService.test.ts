import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeAppSandboxBoundary } from '../../../tests/helpers/createNodeAppSandboxBoundary';
import { createNodeSqliteDatabase } from '../../../tests/helpers/createNodeSqliteDatabase';
import { bootstrapLocalDatabase } from '../../data/local/bootstrapLocalDatabase';
import type { ActiveUserSession } from '../auth/model';
import { SharedExecutionShellService } from '../execution/sharedExecutionShellService';
import { LocalTagContextService } from './localTagContextService';
import { LocalTagEntryService } from './localTagEntryService';
import {
  MANUAL_INSTRUMENT_TEMPLATE_ID,
  isManualInstrumentWorkPackageSummary,
} from './manualInstrumentModel';
import { ManualInstrumentService } from './manualInstrumentService';

const createdDirectories: string[] = [];

afterEach(() => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

describe('ManualInstrumentService', () => {
  it('creates a local-only manual instrument snapshot that can open through existing tag and execution services', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-manual-instrument-'));
    createdDirectories.push(tempDirectory);
    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );
    const tagContextService = new LocalTagContextService({
      userPartitions: runtime.repositories.userPartitions,
      now: () => new Date('2026-05-10T12:00:00.000Z'),
    });
    const tagEntryService = new LocalTagEntryService({
      userPartitions: runtime.repositories.userPartitions,
    });
    const executionShellService = new SharedExecutionShellService({
      userPartitions: runtime.repositories.userPartitions,
      tagContextService,
    });
    const service = new ManualInstrumentService({
      userPartitions: runtime.repositories.userPartitions,
      now: () => new Date('2026-05-10T12:00:00.000Z'),
      idFactory: () => '20260510120000',
    });

    const result = await service.createManualInstrument(session(), {
      tagCode: 'FIELD-NEW-01',
      description: 'Unregistered pressure transmitter',
      area: 'Boiler deck',
      instrumentFamily: 'pressure transmitter',
      instrumentSubtype: 'smart transmitter',
      measuredVariable: 'pressure',
      signalType: '4-20 mA',
      rangeMin: '0',
      rangeMax: '10',
      unit: 'bar',
      tolerance: '+/- 0.25 bar',
      reason: 'Found in field but not present in downloaded package',
      notes: 'Nameplate photo required later',
    });
    const catalog = await runtime.repositories.userPartitions
      .forUser(session().userId)
      .workPackages.listSummaries();
    const tags = await tagEntryService.listPackageTags(session(), result.workPackageId);
    const context = await tagContextService.getTagContext(
      session(),
      result.workPackageId,
      result.tagId,
    );
    const shell = await executionShellService.loadShell(
      session(),
      result.workPackageId,
      result.tagId,
      MANUAL_INSTRUMENT_TEMPLATE_ID,
    );

    expect(catalog).toHaveLength(1);
    expect(isManualInstrumentWorkPackageSummary(catalog[0]!)).toBe(true);
    expect(catalog[0]).toMatchObject({
      id: 'manual-intake:20260510120000',
      sourceReference: 'local-manual:20260510120000',
      hasSnapshot: true,
    });
    expect(tags).toMatchObject([
      {
        tagCode: 'FIELD-NEW-01',
        shortDescription:
          'Unregistered pressure transmitter (manual/local, pendente de reconciliacao)',
      },
    ]);
    expect(context).toMatchObject({
      tagCode: 'FIELD-NEW-01',
      parentAssetReference: {
        value: 'Cadastro manual local - pendente de reconciliacao',
      },
      referencePointers: {
        state: 'available',
      },
    });
    expect(shell).toMatchObject({
      workPackageId: result.workPackageId,
      tagCode: 'FIELD-NEW-01',
      template: {
        id: MANUAL_INSTRUMENT_TEMPLATE_ID,
        title: 'Relatorio de instrumento manual',
      },
      report: {
        syncState: 'local-only',
      },
    });

    await runtime.database.closeAsync?.();
  });
});

function session(): ActiveUserSession {
  return {
    userId: 'user-technician',
    email: 'tech@tagwise.local',
    displayName: 'Field Technician',
    role: 'technician',
    lastAuthenticatedAt: '2026-05-10T11:55:00.000Z',
    accessTokenExpiresAt: '2026-05-10T12:55:00.000Z',
    refreshTokenExpiresAt: '2026-05-11T12:55:00.000Z',
    connectionMode: 'offline',
    reviewActionsAvailable: false,
  };
}
