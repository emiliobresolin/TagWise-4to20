import type { AssignedWorkPackageSnapshot, LocalAssignedWorkPackageSummary } from './model';

export const MANUAL_INSTRUMENT_SOURCE_PREFIX = 'local-manual:';
export const MANUAL_INSTRUMENT_WORK_PACKAGE_PREFIX = 'manual-intake:';
export const MANUAL_INSTRUMENT_TAG_PREFIX = 'manual-tag:';
export const MANUAL_INSTRUMENT_TEMPLATE_ID = 'manual-template-basic';
export const MANUAL_INSTRUMENT_GUIDANCE_ID = 'manual-guidance-basic';
export const MANUAL_INSTRUMENT_HISTORY_ID = 'manual-history-placeholder';
export const MANUAL_INSTRUMENT_CONTRACT_VERSION = 'local-manual-v1';

export interface ManualInstrumentInput {
  tagCode?: string;
  description: string;
  area: string;
  instrumentFamily: string;
  instrumentSubtype?: string;
  measuredVariable?: string;
  signalType?: string;
  rangeMin?: string;
  rangeMax?: string;
  unit?: string;
  tolerance?: string;
  reason: string;
  notes?: string;
}

export interface ManualInstrumentCreationResult {
  workPackageId: string;
  tagId: string;
  templateId: string;
  snapshot: AssignedWorkPackageSnapshot;
}

export function isManualInstrumentWorkPackageId(workPackageId: string): boolean {
  return workPackageId.startsWith(MANUAL_INSTRUMENT_WORK_PACKAGE_PREFIX);
}

export function isManualInstrumentSourceReference(sourceReference: string): boolean {
  return sourceReference.startsWith(MANUAL_INSTRUMENT_SOURCE_PREFIX);
}

export function isManualInstrumentWorkPackageSummary(
  summary: LocalAssignedWorkPackageSummary,
): boolean {
  return (
    isManualInstrumentWorkPackageId(summary.id) ||
    isManualInstrumentSourceReference(summary.sourceReference)
  );
}

