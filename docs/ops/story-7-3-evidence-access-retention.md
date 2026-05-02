# Story 7.3 Evidence Access Control and Retention Baseline

## Storage Posture

- Evidence object storage buckets must remain private for staging and production.
- Do not configure public-read ACLs or anonymous bucket policies for evidence objects.
- Release environments should keep `TAGWISE_STORAGE_AUTO_CREATE_BUCKET=false` and provision buckets through the environment owner so bucket privacy is reviewed before promotion.

## Upload And Access Flow

- Mobile clients sync metadata through the authenticated `/sync/evidence-metadata` API before any binary upload is authorized.
- Binary upload uses a short-lived signed `PUT` URL from `/sync/evidence-upload-authorizations`.
- Evidence download/access uses `/sync/evidence-access-authorizations`, which requires an authenticated TagWise session and returns a short-lived signed `GET` URL only for finalized evidence in the caller's scope.
- The API does not return public evidence object URLs.

## Upload Guardrails

The first-release evidence binary policy is `v1-evidence-finalized-365-days`.

- Maximum binary size: 20 MiB.
- Maximum file name length: 160 UTF-8 bytes.
- Allowed MIME types: `image/jpeg`, `image/png`, `image/heic`, `image/heif`, `image/webp`.
- File extensions must match the declared MIME type.
- File names must not include path separators.

## Retention Baseline

- Finalized evidence records store the retention policy id and `retention_expires_at`.
- First-release retention is 365 days after binary finalization.
- Physical deletion is an operations task after backup/export/legal-hold checks; Story 7.3 only establishes the stored retention baseline and index needed for that job.

## Local Cleanup Behavior

- If server metadata validation permanently rejects an evidence upload policy, mobile keeps the local attachment metadata and file for user recovery.
- The dependent binary upload queue item is removed so the client does not repeatedly attempt an impossible binary upload.
- Successful finalization and already-finalized resubmission continue to clear stale evidence queue items without deleting preserved evidence/report history.

## Validation

- `cd backend && npm test -- createApiRequestHandler migrations backupRestoreVerification`
- `cd mobile && npm test -- evidenceUploadOrchestrator sharedExecutionShellService syncState`
- `cd backend && npm run typecheck`
- `cd mobile && npm run typecheck`
- `git diff --check`
