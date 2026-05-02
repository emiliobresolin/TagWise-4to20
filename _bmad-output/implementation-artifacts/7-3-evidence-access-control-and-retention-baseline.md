# Story 7.3: Evidence Access Control and Retention Baseline

Status: done

## Metadata
- Story key: 7-3-evidence-access-control-and-retention-baseline
- Story map ID: E7-S3
- Epic: Epic 7 - Release Readiness, Deployment, and Optional AI Assist
- Release phase: Release Hardening

## User Story
As an operations owner, I want evidence files protected and retained predictably so report media remains secure and supportable in early production.

## Scope
private object storage posture, signed/authenticated access strategy, file-type/size rules, retention baseline, cleanup rules for rejected local uploads.

## Key Functional Requirements Covered
Evidence/media architecture secure handling, Security baseline.

## Technical Notes / Implementation Approach
keep object storage private by default; expose only controlled download/access; document v1 retention rules.

## Dependencies
- `E5-S2`, `E7-S1`.

## Risks
- weak media access policy can create security and support issues quickly.

## Acceptance Criteria
1. Evidence binaries are not publicly accessible by default.
2. Download/access path requires authenticated or signed access.
3. File-type and size guardrails are enforced.
4. Retention and cleanup rules are documented and applied for first release.

## Validation / Test Notes
- access-control tests, upload rule tests, retention policy verification.

## Dev Agent Record

### Implementation Summary
- Added a first-release evidence binary policy for private object storage guardrails: allowed image MIME types, 20 MiB max binary size, 160-byte file name limit, extension/MIME matching, signed upload TTL, signed access TTL, and 365-day finalized evidence retention.
- Added authenticated signed evidence access authorization at `POST /sync/evidence-access-authorizations`, scoped to the technician owner or active supervisor/manager review routes and limited to finalized evidence records.
- Persisted evidence binary file size plus retention policy metadata and `retention_expires_at` on finalized evidence records, with a migration/index for future retention jobs.
- Carried file size through mobile evidence metadata sync and queue payloads so backend upload guardrails are enforced from local capture data.
- Added mobile cleanup for permanently rejected evidence metadata policy failures: the local file/metadata are preserved for recovery while the dependent binary upload queue item is removed to avoid repeated impossible uploads.
- Documented the private-bucket posture, signed upload/download access path, v1 upload rules, retention baseline, and local cleanup behavior in `docs/ops/story-7-3-evidence-access-retention.md`.

### QA Blocker Fix Follow-up (2026-05-02)
- Root cause: backend finalization validated declared evidence metadata size/type but only checked object-storage presence before marking evidence finalized.
- Fix: extended the object storage boundary with provider-neutral stored object metadata (`ContentLength` / `ContentType`) and made evidence finalization fail closed before persistence when the stored object is missing size/type metadata, exceeds the 20 MiB policy, uses an unsupported content type, or does not match declared metadata.
- Recovery behavior: failed finalization leaves evidence in `metadata-recorded` state with no retention timestamp so mobile retry/recovery remains deterministic and no report/approval history is corrupted.

### Files Changed
- `backend/src/api/createApiRequestHandler.ts`
- `backend/src/api/createApiRequestHandler.test.ts`
- `backend/src/modules/evidence-sync/evidencePolicy.ts`
- `backend/src/modules/evidence-sync/evidenceSyncRepository.ts`
- `backend/src/modules/evidence-sync/evidenceSyncService.ts`
- `backend/src/modules/evidence-sync/model.ts`
- `backend/src/platform/db/migrations.ts`
- `backend/src/platform/db/migrations.test.ts`
- `backend/src/platform/storage/objectStorage.ts`
- `docs/ops/story-7-3-evidence-access-retention.md`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `mobile/src/features/sync/evidenceUploadApiClient.ts`
- `mobile/src/features/sync/evidenceUploadOrchestrator.ts`
- `mobile/src/features/sync/evidenceUploadOrchestrator.test.ts`
- `mobile/src/features/sync/queueContracts.ts`

### Validation Summary
- `cd backend && npm test -- createApiRequestHandler migrations backupRestoreVerification` - passed, 3 files / 34 tests.
- `cd mobile && npm test -- evidenceUploadOrchestrator sharedExecutionShellService syncState` - passed, 5 files / 51 tests.
- `cd backend && npm run typecheck` - passed.
- `cd mobile && npm run typecheck` - passed.
- `cd backend && npm test` - passed, 13 files / 71 tests.
- `cd mobile && npm test` - passed, 22 files / 125 tests.
- `cd backend && npm run build` - passed; generated `backend/dist` output was restored from the working tree after the build check.
- QA blocker fix: `cd backend && npm test -- createApiRequestHandler migrations backupRestoreVerification` - passed, 3 files / 34 tests.
- QA blocker fix: `cd backend && npm run typecheck` - passed.
- QA blocker fix: `cd backend && npm test` - passed, 13 files / 71 tests.
- QA blocker fix: `cd mobile && npm test -- evidenceUploadOrchestrator sharedExecutionShellService syncState` - passed, 5 files / 51 tests.
- QA blocker fix: `cd mobile && npm run typecheck` - passed.
- `git diff --check` - passed with existing CRLF line-ending warnings only.
- Generated/cache file check - clean after restoring build/Vitest generated output.

### QA Closeout (2026-05-02)
- Final BMAD QA verdict: Pass with minor non-blocking concerns.
- Previous blocking issue resolved: evidence finalization now validates actual stored object size and content type before writing finalized presence or retention state.
- Follow-up: persisted audit events for evidence access authorization are not implemented yet.
- Follow-up: supervisor/manager evidence access scope regression tests are still thin.
- Follow-up: provider bucket public-access validation can evolve as future release-preflight hardening.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
