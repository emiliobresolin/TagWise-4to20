import type { LocalAssignedTagEntry } from '../work-packages/model';
import type { LocalQrScanResult } from '../work-packages/localQrScanService';
import type { VisualTagIdentity, VisualTagSummary } from './model';

export function resolveServiceBackedVisualTagIdentity(
  tag: VisualTagSummary,
): VisualTagIdentity | null {
  return tag.source === 'local'
    ? {
        workPackageId: tag.workPackageId,
        tagId: tag.tagId,
      }
    : null;
}

export function shouldOpenVisualDetailForQrResult(
  qrScanResult: LocalQrScanResult | null,
  selectedTag: LocalAssignedTagEntry | null,
): boolean {
  return (
    qrScanResult?.state === 'hit' &&
    selectedTag?.workPackageId === qrScanResult.tag.workPackageId &&
    selectedTag.tagId === qrScanResult.tag.tagId
  );
}

export function preserveVisualCatalogAfterQrFailure<TTag, TTagContext, TExecutionShell>(current: {
  activeTagPackageId: string | null;
  visibleTags: TTag[];
  selectedExecutionTemplateId: string | null;
  selectedTag: TTag | null;
  selectedTagContext: TTagContext | null;
  executionShell: TExecutionShell | null;
}): {
  activeTagPackageId: string | null;
  visibleTags: TTag[];
  selectedExecutionTemplateId: null;
  selectedTag: null;
  selectedTagContext: null;
  executionShell: null;
} {
  return {
    activeTagPackageId: current.activeTagPackageId,
    visibleTags: current.visibleTags,
    selectedExecutionTemplateId: null,
    selectedTag: null,
    selectedTagContext: null,
    executionShell: null,
  };
}
