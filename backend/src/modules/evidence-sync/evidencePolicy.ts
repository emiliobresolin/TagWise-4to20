export const EVIDENCE_BINARY_POLICY = {
  id: 'v1-evidence-finalized-365-days',
  maxFileSizeBytes: 20 * 1024 * 1024,
  fileNameMaxBytes: 160,
  retentionDaysAfterFinalization: 365,
  uploadAuthorizationTtlSeconds: 15 * 60,
  accessAuthorizationTtlSeconds: 5 * 60,
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'image/webp',
  ],
} as const;

export type EvidenceBinaryMimeType =
  (typeof EVIDENCE_BINARY_POLICY.allowedMimeTypes)[number];

export function calculateEvidenceRetentionExpiresAt(finalizedAt: string): string {
  const parsed = new Date(finalizedAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Evidence retention requires a valid finalization timestamp.');
  }

  const expiresAt = new Date(parsed.getTime());
  expiresAt.setUTCDate(
    expiresAt.getUTCDate() + EVIDENCE_BINARY_POLICY.retentionDaysAfterFinalization,
  );
  return expiresAt.toISOString();
}

export function isAllowedEvidenceMimeType(value: string): value is EvidenceBinaryMimeType {
  return (EVIDENCE_BINARY_POLICY.allowedMimeTypes as readonly string[]).includes(value);
}
