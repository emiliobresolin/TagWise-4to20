import type { ActiveUserSession } from '../auth/model';
import type { UserPartitionedLocalStoreFactory } from '../../data/local/repositories/userPartitionedLocalStoreFactory';
import type {
  AssignedWorkPackageGuidanceSnapshot,
  AssignedWorkPackageSnapshot,
  AssignedWorkPackageTagSnapshot,
  AssignedWorkPackageTemplateSnapshot,
  LocalAssignedWorkPackageSummary,
  LocalExecutionTemplateOption,
  LocalTagContext,
  LocalTagContextField,
  LocalTagHistoryPreview,
  LocalTagReferencePointers,
} from './model';
import { ASSIGNED_WORK_PACKAGE_STALE_AFTER_HOURS } from './assignedWorkPackageReadiness';

interface LocalTagContextServiceDependencies {
  userPartitions: UserPartitionedLocalStoreFactory;
  now?: () => Date;
}

export class LocalTagContextService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: LocalTagContextServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async getTagContext(
    session: ActiveUserSession,
    workPackageId: string,
    tagId: string,
  ): Promise<LocalTagContext | null> {
    const workPackages = this.dependencies.userPartitions.forUser(session.userId).workPackages;
    const [snapshot, packageSummary] = await Promise.all([
      workPackages.getSnapshot(workPackageId),
      workPackages.getSummary(workPackageId),
    ]);

    if (!snapshot) {
      return null;
    }

    const tag = snapshot.tags.find((item) => item.id === tagId);
    if (!tag) {
      return null;
    }

    return {
      workPackageId: snapshot.summary.id,
      workPackageTitle: snapshot.summary.title,
      tagId: tag.id,
      tagCode: tag.tagCode,
      shortDescription: tag.shortDescription,
      area: mapField('Area', tag.area),
      parentAssetReference: mapField('Asset reference', tag.parentAssetReference),
      instrumentFamily: mapField('Instrument family', tag.instrumentFamily),
      instrumentSubtype: mapField('Instrument subtype', tag.instrumentSubtype),
      measuredVariable: mapField('Measured variable', tag.measuredVariable),
      signalType: mapField('Signal type', tag.signalType),
      range: mapRangeField(tag),
      tolerance: mapField('Tolerance', tag.tolerance),
      criticality: mapCriticalityField(tag.criticality),
      dueIndicator: mapDueIndicator(snapshot, this.now()),
      historyPreview: mapHistoryPreview(snapshot, tag, packageSummary, this.now()),
      referencePointers: mapReferencePointers(snapshot, tag),
    };
  }
}

function mapField(label: string, value: string | null | undefined): LocalTagContextField {
  const normalized = normalizeDisplayValue(value);
  return normalized
    ? { label, value: normalized, state: 'available' }
    : { label, value: 'Missing', state: 'missing' };
}

function mapRangeField(tag: AssignedWorkPackageTagSnapshot): LocalTagContextField {
  const unit = normalizeDisplayValue(tag.range?.unit);
  const min = tag.range?.min;
  const max = tag.range?.max;

  if (typeof min !== 'number' || typeof max !== 'number' || !unit) {
    return {
      label: 'Range',
      value: 'Missing',
      state: 'missing',
    };
  }

  return {
    label: 'Range',
    value: `${min} to ${max} ${unit}`,
    state: 'available',
  };
}

function mapCriticalityField(value: 'medium' | 'high' | null | undefined): LocalTagContextField {
  if (!value) {
    return {
      label: 'Criticality',
      value: 'Missing',
      state: 'missing',
    };
  }

  return {
    label: 'Criticality',
    value: value === 'high' ? 'High' : 'Medium',
    state: 'available',
  };
}

function mapDueIndicator(snapshot: AssignedWorkPackageSnapshot, now: Date) {
  const dueAt = snapshot.summary.dueWindow.endsAt;

  if (!dueAt) {
    return {
      label: 'Due status',
      value: 'Missing',
      state: 'missing' as const,
      overdue: false,
    };
  }

  const dueDate = new Date(dueAt);
  const overdue = !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < now.getTime();

  return {
    label: 'Due status',
    value: `${overdue ? 'Overdue' : 'Due'} ${dueDate.toLocaleString()}`,
    state: 'available' as const,
    overdue,
  };
}

function mapHistoryPreview(
  snapshot: AssignedWorkPackageSnapshot,
  tag: AssignedWorkPackageTagSnapshot,
  packageSummary: LocalAssignedWorkPackageSummary | null,
  now: Date,
): LocalTagHistoryPreview {
  const historySummaryId = normalizeDisplayValue(tag.historySummaryId);
  if (!historySummaryId) {
    return {
      state: 'unavailable',
      title: 'History preview',
      summary: 'No local history summary was attached to this tag.',
      detail: 'Proceed with visible risk if history is needed later.',
      lastObservedAt: null,
      lastResult: null,
      recurrenceCue: null,
    };
  }

  const summary = snapshot.historySummaries.find((item) => item.id === historySummaryId);
  if (!summary) {
    return {
      state: 'missing',
      title: 'History preview',
      summary: 'History reference is missing from the downloaded package.',
      detail: `Expected local history summary ${historySummaryId}.`,
      lastObservedAt: null,
      lastResult: null,
      recurrenceCue: null,
    };
  }

  const freshness = resolveHistoryFreshness(packageSummary, now);

  return {
    state: freshness.state,
    title: 'History preview',
    summary: summary.summaryText,
    detail: buildHistoryDetail(summary, freshness.detail),
    lastObservedAt: summary.lastObservedAt,
    lastResult: normalizeDisplayValue(summary.lastResult),
    recurrenceCue: normalizeDisplayValue(summary.trendHint),
  };
}

function mapReferencePointers(
  snapshot: AssignedWorkPackageSnapshot,
  tag: AssignedWorkPackageTagSnapshot,
): LocalTagReferencePointers {
  const matchedTemplates = matchTemplates(snapshot.templates, tag.templateIds);
  const matchedGuidance = matchGuidance(snapshot.guidance, tag.guidanceReferenceIds);
  const expectedReferenceCount = tag.templateIds.length + tag.guidanceReferenceIds.length;

  if (expectedReferenceCount === 0) {
    return {
      state: 'unavailable',
      templates: [],
      executionTemplates: [],
      guidance: [],
      detail: 'No local procedure or guidance references were attached.',
    };
  }

  const missingTemplateIds = tag.templateIds.filter(
    (templateId) => !snapshot.templates.some((template) => template.id === templateId),
  );
  const missingGuidanceIds = tag.guidanceReferenceIds.filter(
    (guidanceId) => !snapshot.guidance.some((guidance) => guidance.id === guidanceId),
  );

  if (missingTemplateIds.length > 0 || missingGuidanceIds.length > 0) {
    return {
      state: 'missing',
      templates: matchedTemplates.map(formatTemplateOptionLabel),
      executionTemplates: matchedTemplates,
      guidance: matchedGuidance,
      detail: buildMissingReferenceDetail(missingTemplateIds, missingGuidanceIds),
    };
  }

  return {
    state: 'available',
    templates: matchedTemplates.map(formatTemplateOptionLabel),
    executionTemplates: matchedTemplates,
    guidance: matchedGuidance,
    detail: 'Local procedure and guidance references are ready for execution handoff.',
  };
}

function matchTemplates(
  templates: AssignedWorkPackageTemplateSnapshot[],
  templateIds: string[],
): LocalExecutionTemplateOption[] {
  return templateIds
    .map((templateId) => templates.find((template) => template.id === templateId))
    .filter((template): template is AssignedWorkPackageTemplateSnapshot => Boolean(template))
    .map((template) => ({
      id: template.id,
      title: template.title,
      instrumentFamily: template.instrumentFamily,
      testPattern: template.testPattern,
      captureSummary: normalizeCaptureSummary(template.captureSummary, template.testPattern),
      minimumSubmissionEvidence: template.minimumSubmissionEvidence,
      expectedEvidence: Array.isArray(template.expectedEvidence) ? template.expectedEvidence : [],
    }));
}

function matchGuidance(
  guidance: AssignedWorkPackageGuidanceSnapshot[],
  guidanceIds: string[],
): string[] {
  return guidance
    .filter((item) => guidanceIds.includes(item.id))
    .map((item) => `${item.title} (${item.sourceReference})`);
}

function buildMissingReferenceDetail(
  missingTemplateIds: string[],
  missingGuidanceIds: string[],
): string {
  const parts: string[] = [];

  if (missingTemplateIds.length > 0) {
    parts.push(`Missing template pointer(s): ${missingTemplateIds.join(', ')}`);
  }

  if (missingGuidanceIds.length > 0) {
    parts.push(`Missing guidance pointer(s): ${missingGuidanceIds.join(', ')}`);
  }

  return parts.join('. ');
}

function formatTemplateOptionLabel(template: LocalExecutionTemplateOption): string {
  return `${template.title} (${template.testPattern})`;
}

function buildHistoryDetail(
  summary: AssignedWorkPackageSnapshot['historySummaries'][number],
  freshnessDetail: string,
): string {
  const parts = [
    normalizeDisplayValue(summary.lastResult)
      ? `Last result: ${normalizeDisplayValue(summary.lastResult)}`
      : null,
    normalizeDisplayValue(summary.trendHint)
      ? `Recurrence cue: ${normalizeDisplayValue(summary.trendHint)}`
      : null,
    freshnessDetail,
  ].filter((value): value is string => Boolean(value));

  return parts.join('; ');
}

function normalizeCaptureSummary(
  captureSummary: string | undefined,
  testPattern: string,
): string {
  return typeof captureSummary === 'string' && captureSummary.trim().length > 0
    ? captureSummary
    : `Capture the local execution values for ${testPattern}.`;
}

function normalizeDisplayValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveHistoryFreshness(
  packageSummary: LocalAssignedWorkPackageSummary | null,
  now: Date,
): Pick<LocalTagHistoryPreview, 'state' | 'detail'> {
  const downloadedAt = parseTimestamp(packageSummary?.downloadedAt ?? null);
  const snapshotGeneratedAt = parseTimestamp(packageSummary?.snapshotGeneratedAt ?? null);

  if (!downloadedAt || !snapshotGeneratedAt) {
    return {
      state: 'age-unknown',
      detail:
        'History freshness metadata is missing. Refresh this package while connected before trusting the comparison.',
    };
  }

  if (isStale(snapshotGeneratedAt, now)) {
    return {
      state: 'stale',
      detail: `The cached history came from an upstream snapshot older than ${ASSIGNED_WORK_PACKAGE_STALE_AFTER_HOURS} hours. Compare carefully and refresh when connected.`,
    };
  }

  if (isStale(downloadedAt, now)) {
    return {
      state: 'stale',
      detail: `This package has not been refreshed locally for more than ${ASSIGNED_WORK_PACKAGE_STALE_AFTER_HOURS} hours. Refresh it before relying on the cached history.`,
    };
  }

  return {
    state: 'available',
    detail: 'Cached history is recent enough for local comparison.',
  };
}

function parseTimestamp(timestamp: string | null): Date | null {
  if (!timestamp) {
    return null;
  }

  const value = new Date(timestamp);
  return Number.isNaN(value.getTime()) ? null : value;
}

function isStale(timestamp: Date, now: Date): boolean {
  const staleAfterMs = ASSIGNED_WORK_PACKAGE_STALE_AFTER_HOURS * 60 * 60 * 1000;
  return now.getTime() - timestamp.getTime() > staleAfterMs;
}
