import type { ActiveUserSession } from '../auth/model';
import type { UserPartitionedLocalStoreFactory } from '../../data/local/repositories/userPartitionedLocalStoreFactory';
import type {
  AssignedWorkPackageGuidanceSnapshot,
  AssignedWorkPackageHistorySummarySnapshot,
  AssignedWorkPackageSnapshot,
  AssignedWorkPackageTagSnapshot,
  AssignedWorkPackageTemplateSnapshot,
  LocalTagContext,
  LocalTagContextField,
  LocalTagHistoryPreview,
  LocalTagReferencePointers,
} from './model';

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
    const snapshot = await this.dependencies.userPartitions
      .forUser(session.userId)
      .workPackages.getSnapshot(workPackageId);

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
      historyPreview: mapHistoryPreview(snapshot, tag),
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
): LocalTagHistoryPreview {
  const historySummaryId = normalizeDisplayValue(tag.historySummaryId);
  if (!historySummaryId) {
    return {
      state: 'unavailable',
      title: 'History preview',
      summary: 'No local history summary was attached to this tag.',
      detail: 'Proceed with visible risk if history is needed later.',
      lastObservedAt: null,
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
    };
  }

  return {
    state: 'available',
    title: 'History preview',
    summary: summary.summaryText,
    detail: buildHistoryDetail(summary),
    lastObservedAt: summary.lastObservedAt,
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
      guidance: [],
      detail: 'No local procedure or guidance references were attached.',
      executionTemplateLabel: null,
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
      templates: matchedTemplates,
      guidance: matchedGuidance,
      detail: buildMissingReferenceDetail(missingTemplateIds, missingGuidanceIds),
      executionTemplateLabel: matchedTemplates[0] ?? null,
    };
  }

  return {
    state: 'available',
    templates: matchedTemplates,
    guidance: matchedGuidance,
    detail: 'Local procedure and guidance references are ready for execution handoff.',
    executionTemplateLabel: matchedTemplates[0] ?? null,
  };
}

function matchTemplates(
  templates: AssignedWorkPackageTemplateSnapshot[],
  templateIds: string[],
): string[] {
  return templates
    .filter((template) => templateIds.includes(template.id))
    .map((template) => `${template.title} (${template.testPattern})`);
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

function buildHistoryDetail(summary: AssignedWorkPackageHistorySummarySnapshot): string {
  const parts = [normalizeDisplayValue(summary.lastResult), normalizeDisplayValue(summary.trendHint)].filter(
    (value): value is string => Boolean(value),
  );

  return parts.length > 0 ? parts.join(' • ') : 'History summary is available locally.';
}

function normalizeDisplayValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
