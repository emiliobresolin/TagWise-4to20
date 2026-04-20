import type { ActiveUserSession } from '../auth/model';
import type { UserPartitionedLocalStoreFactory } from '../../data/local/repositories/userPartitionedLocalStoreFactory';
import type { LocalAssignedTagEntry } from './model';

export type ParsedQrPayloadFormat = 'raw-tag-code' | 'tagwise-uri' | 'tagwise-json';

export interface ParsedLocalTagQrPayload {
  tagCode: string;
  workPackageId: string | null;
  rawPayload: string;
  format: ParsedQrPayloadFormat;
}

export type LocalQrScanResult =
  | {
      state: 'hit';
      parsed: ParsedLocalTagQrPayload;
      tag: LocalAssignedTagEntry;
      message: string;
    }
  | {
      state: 'miss';
      parsed: ParsedLocalTagQrPayload;
      message: string;
      guidance: string;
    }
  | {
      state: 'invalid';
      rawPayload: string;
      message: string;
      guidance: string;
    };

interface LocalQrScanServiceDependencies {
  userPartitions: UserPartitionedLocalStoreFactory;
}

export class LocalQrScanService {
  constructor(private readonly dependencies: LocalQrScanServiceDependencies) {}

  async resolveScan(
    session: ActiveUserSession,
    rawPayload: string,
  ): Promise<LocalQrScanResult> {
    const parsed = parseLocalTagQrPayload(rawPayload);

    if (!parsed) {
      return {
        state: 'invalid',
        rawPayload,
        message: 'Scanned QR code is not a supported TagWise tag payload.',
        guidance:
          'Use a TagWise tag QR code or open the tag from your downloaded package list.',
      };
    }

    const matchedTag = await this.findCachedTag(session, parsed);

    if (matchedTag) {
      return {
        state: 'hit',
        parsed,
        tag: matchedTag,
        message: `Cached tag ${matchedTag.tagCode} is available offline and ready to open.`,
      };
    }

    return {
      state: 'miss',
      parsed,
      message: `Tag ${parsed.tagCode} is not cached on this device.`,
      guidance:
        'Refresh assigned packages or download the containing package while connected, then scan again.',
    };
  }

  private async findCachedTag(
    session: ActiveUserSession,
    parsed: ParsedLocalTagQrPayload,
  ): Promise<LocalAssignedTagEntry | null> {
    const workPackages = await this.dependencies.userPartitions
      .forUser(session.userId)
      .workPackages.listSummaries();

    const candidatePackageIds = parsed.workPackageId
      ? [parsed.workPackageId]
      : workPackages.filter((item) => item.hasSnapshot).map((item) => item.id);

    for (const workPackageId of candidatePackageIds) {
      const snapshot = await this.dependencies.userPartitions
        .forUser(session.userId)
        .workPackages.getSnapshot(workPackageId);

      if (!snapshot) {
        continue;
      }

      const tag = snapshot.tags.find(
        (item) => normalizeTagCode(item.tagCode) === normalizeTagCode(parsed.tagCode),
      );

      if (!tag) {
        continue;
      }

      return {
        workPackageId: snapshot.summary.id,
        workPackageTitle: snapshot.summary.title,
        tagId: tag.id,
        tagCode: tag.tagCode,
        shortDescription: tag.shortDescription,
        area: tag.area,
        instrumentFamily: tag.instrumentFamily,
        instrumentSubtype: tag.instrumentSubtype,
        parentAssetReference: tag.parentAssetReference,
      };
    }

    return null;
  }
}

export function parseLocalTagQrPayload(rawPayload: string): ParsedLocalTagQrPayload | null {
  const trimmedPayload = rawPayload.trim();

  if (!trimmedPayload) {
    return null;
  }

  if (trimmedPayload.startsWith('{')) {
    return parseJsonPayload(trimmedPayload);
  }

  const uriPayload = parseUriPayload(trimmedPayload);
  if (uriPayload) {
    return uriPayload;
  }

  if (isValidTagCode(trimmedPayload)) {
    return {
      tagCode: trimmedPayload,
      workPackageId: null,
      rawPayload,
      format: 'raw-tag-code',
    };
  }

  return null;
}

function parseJsonPayload(rawPayload: string): ParsedLocalTagQrPayload | null {
  try {
    const parsed = JSON.parse(rawPayload) as { tagCode?: unknown; workPackageId?: unknown };

    if (!isValidTagCode(parsed.tagCode) || !isNullableString(parsed.workPackageId)) {
      return null;
    }

    return {
      tagCode: parsed.tagCode,
      workPackageId: parsed.workPackageId ?? null,
      rawPayload,
      format: 'tagwise-json',
    };
  } catch {
    return null;
  }
}

function parseUriPayload(rawPayload: string): ParsedLocalTagQrPayload | null {
  const prefixedMatch = rawPayload.match(/^tagwise:\/\/tag\/([^/?#]+)(?:\?workPackageId=([^#]+))?$/i);
  if (prefixedMatch) {
    const tagCode = tryDecodeUriComponent(prefixedMatch[1] ?? '');
    const workPackageId = prefixedMatch[2] ? tryDecodeUriComponent(prefixedMatch[2]) : null;

    if (!isValidTagCode(tagCode) || !isNullableString(workPackageId)) {
      return null;
    }

    return {
      tagCode,
      workPackageId,
      rawPayload,
      format: 'tagwise-uri',
    };
  }

  const compactMatch = rawPayload.match(/^tagwise:tag:([^/?#]+)$/i);
  if (!compactMatch) {
    return null;
  }

  const tagCode = tryDecodeUriComponent(compactMatch[1] ?? '');
  if (!isValidTagCode(tagCode)) {
    return null;
  }

  return {
    tagCode,
    workPackageId: null,
    rawPayload,
    format: 'tagwise-uri',
  };
}

function isValidTagCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{1,63}$/.test(value.trim());
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === 'string';
}

function normalizeTagCode(value: string): string {
  return value.trim().toUpperCase();
}

function tryDecodeUriComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
