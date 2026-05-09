import { describe, expect, it } from 'vitest';

import {
  preserveVisualCatalogAfterQrFailure,
  resolveServiceBackedVisualTagIdentity,
  shouldOpenVisualDetailForQrResult,
} from './serviceBackedNavigation';
import type { VisualTagSummary } from './model';
import type { LocalAssignedTagEntry } from '../work-packages/model';
import type { LocalQrScanResult } from '../work-packages/localQrScanService';

describe('service-backed visual navigation', () => {
  it('extracts identity only from local visual tags', () => {
    expect(resolveServiceBackedVisualTagIdentity(visualTag('local'))).toEqual({
      workPackageId: 'wp-001',
      tagId: 'tag-001',
    });

    expect(resolveServiceBackedVisualTagIdentity(visualTag('demo'))).toBeNull();
  });

  it('opens detail only when a QR hit matches the selected local tag', () => {
    const selectedTag = localTag('wp-001', 'tag-001');

    expect(shouldOpenVisualDetailForQrResult(qrHit('wp-001', 'tag-001'), selectedTag)).toBe(true);
    expect(shouldOpenVisualDetailForQrResult(qrHit('wp-001', 'tag-002'), selectedTag)).toBe(false);
    expect(shouldOpenVisualDetailForQrResult(qrMiss(), selectedTag)).toBe(false);
    expect(shouldOpenVisualDetailForQrResult(qrInvalid(), selectedTag)).toBe(false);
    expect(shouldOpenVisualDetailForQrResult(qrHit('wp-001', 'tag-001'), null)).toBe(false);
  });

  it('preserves the authenticated catalog after a QR miss or invalid payload', () => {
    const visibleTags = [localTag('wp-001', 'tag-001'), localTag('wp-001', 'tag-002')];

    const nextState = preserveVisualCatalogAfterQrFailure({
      activeTagPackageId: 'wp-001',
      visibleTags,
      selectedExecutionTemplateId: 'template-001',
      selectedTag: visibleTags[0],
      selectedTagContext: { tagId: 'tag-001' },
      executionShell: { tagId: 'tag-001', templateId: 'template-001' },
    });

    expect(nextState.activeTagPackageId).toBe('wp-001');
    expect(nextState.visibleTags).toBe(visibleTags);
    expect(nextState.visibleTags.map((tag) => tag.tagCode)).toEqual(['PT-101', 'TT-205']);
    expect(nextState.visibleTags.map((tag) => tag.tagCode)).not.toContain('PT-204');
    expect(nextState.selectedExecutionTemplateId).toBeNull();
    expect(nextState.selectedTag).toBeNull();
    expect(nextState.selectedTagContext).toBeNull();
    expect(nextState.executionShell).toBeNull();
  });
});

function visualTag(source: 'local' | 'demo'): VisualTagSummary {
  return {
    id: source === 'local' ? 'tag-001' : 'pt-204',
    workPackageId: source === 'local' ? 'wp-001' : 'demo',
    tagId: source === 'local' ? 'tag-001' : 'pt-204',
    source,
    code: source === 'local' ? 'PT-101' : 'PT-204',
    prefix: 'PT',
    title: 'Pressao',
    description: 'Transmissor',
    area: 'Area local',
    category: 'pending',
    severity: 'medium',
    badgeLabel: 'MEDIA',
    badgeDetail: 'Area local',
    ringColor: '#5b9dff',
  };
}

function localTag(workPackageId: string, tagId: string): LocalAssignedTagEntry {
  return {
    workPackageId,
    workPackageTitle: 'Package',
    tagId,
    tagCode: tagId === 'tag-001' ? 'PT-101' : 'TT-205',
    shortDescription: 'Instrumento local',
    area: 'Area local',
    instrumentFamily: 'Pressao',
    instrumentSubtype: 'Transmissor',
    parentAssetReference: 'Asset local',
  };
}

function qrHit(workPackageId: string, tagId: string): LocalQrScanResult {
  return {
    state: 'hit',
    parsed: {
      tagCode: tagId === 'tag-001' ? 'PT-101' : 'TT-205',
      workPackageId,
      rawPayload: tagId,
      format: 'raw-tag-code',
    },
    tag: localTag(workPackageId, tagId),
    message: 'Cached tag is available.',
  };
}

function qrMiss(): LocalQrScanResult {
  return {
    state: 'miss',
    parsed: {
      tagCode: 'PT-999',
      workPackageId: null,
      rawPayload: 'PT-999',
      format: 'raw-tag-code',
    },
    message: 'Tag is not cached.',
    guidance: 'Download the package first.',
  };
}

function qrInvalid(): LocalQrScanResult {
  return {
    state: 'invalid',
    rawPayload: 'unsupported payload',
    message: 'Unsupported QR payload.',
    guidance: 'Open the tag from the cached list.',
  };
}
