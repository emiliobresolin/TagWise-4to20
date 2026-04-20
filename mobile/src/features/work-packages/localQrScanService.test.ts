import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeAppSandboxBoundary } from '../../../tests/helpers/createNodeAppSandboxBoundary';
import { createNodeSqliteDatabase } from '../../../tests/helpers/createNodeSqliteDatabase';
import { bootstrapLocalDatabase } from '../../data/local/bootstrapLocalDatabase';
import type { ActiveUserSession } from '../auth/model';
import type { AssignedWorkPackageSnapshot } from './model';
import { LocalQrScanService, parseLocalTagQrPayload } from './localQrScanService';

const createdDirectories: string[] = [];

afterEach(() => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

const session: ActiveUserSession = {
  userId: 'user-technician',
  email: 'tech@tagwise.local',
  displayName: 'Field Technician',
  role: 'technician',
  lastAuthenticatedAt: '2026-04-19T09:00:00.000Z',
  accessTokenExpiresAt: '2026-04-19T10:00:00.000Z',
  refreshTokenExpiresAt: '2026-04-20T10:00:00.000Z',
  connectionMode: 'offline',
  reviewActionsAvailable: false,
};

const packageOneSnapshot: AssignedWorkPackageSnapshot = {
  contractVersion: '2026-04-v1',
  generatedAt: '2026-04-19T10:00:00.000Z',
  summary: {
    id: 'wp-local-001',
    sourceReference: 'seed-cmms-001',
    title: 'Assigned package one',
    assignedTeam: 'Instrumentation Alpha',
    priority: 'high',
    status: 'assigned',
    packageVersion: 1,
    snapshotContractVersion: '2026-04-v1',
    tagCount: 2,
    dueWindow: {
      startsAt: '2026-04-20T08:00:00.000Z',
      endsAt: '2026-04-20T17:00:00.000Z',
    },
    updatedAt: '2026-04-19T10:00:00.000Z',
  },
  tags: [
    {
      id: 'tag-001',
      tagCode: 'PT-101',
      shortDescription: 'North pressure transmitter',
      area: 'North Unit',
      parentAssetReference: 'asset-001',
      instrumentFamily: 'pressure transmitter',
      instrumentSubtype: 'smart transmitter',
      measuredVariable: 'pressure',
      signalType: '4-20mA',
      range: { min: 0, max: 10, unit: 'bar' },
      tolerance: '+/-0.25% span',
      criticality: 'high',
      templateIds: ['tpl-pressure'],
      guidanceReferenceIds: ['guide-pressure'],
      historySummaryId: 'history-001',
    },
    {
      id: 'tag-002',
      tagCode: 'LT-202',
      shortDescription: 'Level transmitter south tank',
      area: 'South Unit',
      parentAssetReference: 'asset-002',
      instrumentFamily: 'level transmitter',
      instrumentSubtype: 'guided wave radar',
      measuredVariable: 'level',
      signalType: '4-20mA',
      range: { min: 0, max: 100, unit: '%' },
      tolerance: '+/-0.5% span',
      criticality: 'medium',
      templateIds: ['tpl-level'],
      guidanceReferenceIds: ['guide-level'],
      historySummaryId: 'history-002',
    },
  ],
  templates: [],
  guidance: [],
  historySummaries: [],
};

describe('parseLocalTagQrPayload', () => {
  it('parses supported raw, uri, and json tag payloads', () => {
    expect(parseLocalTagQrPayload('PT-101')).toMatchObject({
      tagCode: 'PT-101',
      workPackageId: null,
      format: 'raw-tag-code',
    });
    expect(parseLocalTagQrPayload('tagwise://tag/PT-101?workPackageId=wp-local-001')).toMatchObject({
      tagCode: 'PT-101',
      workPackageId: 'wp-local-001',
      format: 'tagwise-uri',
    });
    expect(
      parseLocalTagQrPayload('{"tagCode":"LT-202","workPackageId":"wp-local-001"}'),
    ).toMatchObject({
      tagCode: 'LT-202',
      workPackageId: 'wp-local-001',
      format: 'tagwise-json',
    });
  });

  it('rejects malformed payloads gracefully', () => {
    expect(parseLocalTagQrPayload('')).toBeNull();
    expect(parseLocalTagQrPayload('{"tagId":"tag-001"}')).toBeNull();
    expect(parseLocalTagQrPayload('tagwise://asset/PT-101')).toBeNull();
    expect(parseLocalTagQrPayload('tagwise://tag/%E0%A4%A')).toBeNull();
    expect(parseLocalTagQrPayload('PT 101 invalid')).toBeNull();
  });
});

describe('LocalQrScanService', () => {
  it('opens a cached tag from local snapshots after reopen-like offline access', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-qr-hit-'));
    createdDirectories.push(tempDirectory);

    const databasePath = join(tempDirectory, 'tagwise.db');
    const sandboxPath = join(tempDirectory, 'sandbox');

    const firstRuntime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(databasePath)),
      () => Promise.resolve(createNodeAppSandboxBoundary(sandboxPath)),
    );
    await firstRuntime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(packageOneSnapshot, '2026-04-19T10:15:00.000Z');
    await firstRuntime.database.closeAsync?.();

    const secondRuntime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(databasePath)),
      () => Promise.resolve(createNodeAppSandboxBoundary(sandboxPath)),
    );
    const service = new LocalQrScanService({
      userPartitions: secondRuntime.repositories.userPartitions,
    });

    await expect(
      service.resolveScan(
        session,
        'tagwise://tag/PT-101?workPackageId=wp-local-001',
      ),
    ).resolves.toMatchObject({
      state: 'hit',
      tag: {
        workPackageId: 'wp-local-001',
        tagCode: 'PT-101',
        shortDescription: 'North pressure transmitter',
      },
    });

    await secondRuntime.database.closeAsync?.();
  });

  it('shows a clear not-cached result when the scanned tag is outside the offline package scope', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-qr-miss-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );
    await runtime.repositories.userPartitions
      .forUser(session.userId)
      .workPackages.saveDownloadedSnapshot(packageOneSnapshot, '2026-04-19T10:15:00.000Z');

    const service = new LocalQrScanService({
      userPartitions: runtime.repositories.userPartitions,
    });

    await expect(service.resolveScan(session, 'TT-303')).resolves.toMatchObject({
      state: 'miss',
      message: 'Tag TT-303 is not cached on this device.',
      guidance:
        'Refresh assigned packages or download the containing package while connected, then scan again.',
    });

    await runtime.database.closeAsync?.();
  });

  it('fails malformed scan payloads without attempting live lookup behavior', async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'tagwise-qr-invalid-'));
    createdDirectories.push(tempDirectory);

    const runtime = await bootstrapLocalDatabase(
      () => Promise.resolve(createNodeSqliteDatabase(join(tempDirectory, 'tagwise.db'))),
      () => Promise.resolve(createNodeAppSandboxBoundary(join(tempDirectory, 'sandbox'))),
    );
    const service = new LocalQrScanService({
      userPartitions: runtime.repositories.userPartitions,
    });

    await expect(service.resolveScan(session, 'tagwise://asset/PT-101')).resolves.toMatchObject({
      state: 'invalid',
      message: 'Scanned QR code is not a supported TagWise tag payload.',
      guidance:
        'Use a TagWise tag QR code or open the tag from your downloaded package list.',
    });

    await runtime.database.closeAsync?.();
  });
});
