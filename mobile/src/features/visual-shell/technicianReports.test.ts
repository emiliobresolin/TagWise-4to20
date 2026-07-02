import { describe, expect, it } from 'vitest';

import {
  buildTagWorkStatus,
  buildTechnicianReportSummaries,
  classifyReportStatus,
} from './technicianReports';
import type { LocalAssignedTagEntry } from '../work-packages/model';

describe('technician report projections', () => {
  it('classifies visible report lifecycle states for the technician', () => {
    expect(classifyReportStatus(record({ reportState: 'technician-owned-draft' }))).toBe('draft');
    expect(classifyReportStatus(record({ reportState: 'submitted-pending-sync' }))).toBe(
      'pending-sync',
    );
    expect(classifyReportStatus(record({ reportState: 'submitted-pending-review' }))).toBe(
      'pending-review',
    );
    expect(
      classifyReportStatus(record({ lifecycleState: 'Returned by Supervisor' })),
    ).toBe('returned');
    expect(classifyReportStatus(record({ lifecycleState: 'Approved' }))).toBe('approved');
    expect(classifyReportStatus(record({ syncState: 'sync-issue' }))).toBe('sync-issue');
    expect(
      classifyReportStatus(record({ workPackageId: 'manual-intake:20260510150000' })),
    ).toBe('manual-local');
  });

  it('projects report list items and tag statuses without supervisor actions', () => {
    const reports = buildTechnicianReportSummaries({
      tags: [tag('tag-101', 'PT-101'), tag('tag-102', 'TT-102')],
      records: [
        record({
          reportId: 'report-101',
          tagId: 'tag-101',
          templateId: 'tpl-pressure',
          reportState: 'submitted-pending-sync',
          syncState: 'queued',
          packageVersion: 4,
        }),
      ],
    });

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      tagCode: 'PT-101',
      statusLabel: 'Pendente sync',
      canOpen: true,
      canEdit: true,
      // approved-tag-lock scoping: the summary must carry the package
      // version the report was worked under so the lock predicate can
      // compare it against the currently-downloaded snapshot version.
      packageVersion: 4,
    });
    expect(JSON.stringify(reports)).not.toContain('approve');

    expect(buildTagWorkStatus({ tag: tag('tag-101', 'PT-101'), reports })).toMatchObject({
      label: 'Pendente sync',
    });
    expect(buildTagWorkStatus({ tag: tag('tag-102', 'TT-102'), reports })).toMatchObject({
      label: 'Nao iniciado',
    });
  });
});

function record(
  overrides: Partial<Parameters<typeof classifyReportStatus>[0] & {
    reportId: string;
    tagId: string;
    templateId: string;
    templateVersion: string;
    packageVersion: number | null;
    reviewNotes: string;
    updatedAt: string;
    submittedAt: string | null;
    syncIssue: string | null;
  }> = {},
) {
  return {
    reportId: overrides.reportId ?? 'report-001',
    workPackageId: overrides.workPackageId ?? 'wp-local',
    tagId: overrides.tagId ?? 'tag-001',
    templateId: overrides.templateId ?? 'tpl-local',
    templateVersion: overrides.templateVersion ?? '1',
    packageVersion: overrides.packageVersion ?? null,
    reportState: overrides.reportState ?? 'technician-owned-draft',
    lifecycleState: overrides.lifecycleState ?? 'In Progress',
    syncState: overrides.syncState ?? 'local-only',
    reviewNotes: overrides.reviewNotes ?? '',
    updatedAt: overrides.updatedAt ?? '2026-05-10T15:00:00.000Z',
    submittedAt: overrides.submittedAt ?? null,
    syncIssue: overrides.syncIssue ?? null,
  } as const;
}

function tag(tagId: string, tagCode: string): LocalAssignedTagEntry {
  return {
    workPackageId: 'wp-local',
    workPackageTitle: 'Pacote local',
    tagId,
    tagCode,
    shortDescription: `${tagCode} descricao`,
    area: 'Area 1',
    instrumentFamily: 'pressure transmitter',
    instrumentSubtype: 'smart transmitter',
    parentAssetReference: 'asset-001',
  };
}
