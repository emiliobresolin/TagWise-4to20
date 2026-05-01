# Story 6.5: Approval History, Work-Package Roll-Up, and Returned-Report Re-entry

Status: review

## Metadata
- Story key: 6-5-approval-history-work-package-roll-up-and-returned-report-re-entry
- Story map ID: E6-S5
- Epic: Epic 6 - Connected Review, Approval, and Audit Closure
- Release phase: First Release

## User Story
As a technician or reviewer, I want approval history and work-package status to stay coherent so I can understand where each tag report stands and what needs rework.

## Scope
approval history timeline, work-package roll-up calculation, returned-report re-entry for technician edits/resubmission, visible comment history.

## Key Functional Requirements Covered
FR-09 approval history, Work package roll-up rule, FR-14.

## Technical Notes / Implementation Approach
derive work-package status from child report states; preserve immutable decision history; re-open returned report into technician-owned editable state only.

## Dependencies
- `E6-S2`, `E6-S3`, `E6-S4`.

## Risks
- treating the work package as the review unit will violate the approved per-tag lifecycle model.

## Acceptance Criteria
1. Report detail shows full approval/return/escalation history.
2. Work-package status rolls up correctly from child per-tag report outcomes.
3. Returned reports can be reopened by the technician for rework and later resubmission.
4. Prior approval decisions remain visible after resubmission.

## Validation / Test Notes
- lifecycle transition tests, roll-up calculation tests, rework/resubmit regression tests.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)

## Dev Agent Record

### Selected Next Story Verification
- Verified `story-index.md` order: Story 6.4 is followed by Story 6.5.
- Verified `story-map.md` E6-S5 scope and acceptance criteria for approval history, work-package roll-up, and returned-report re-entry.
- Verified PRD and Architecture source references: per-tag report remains the canonical review unit, approval decisions remain server-authoritative and append-only, work-package state is derived from child report outcomes, and returned reports reopen only for technician rework/resubmission.

### Scope Implemented
- Added technician report status refresh with approval history for submitted/returned/escalated/approved report outcomes.
- Preserved approval/return/escalation audit history and displayed it in technician report detail and reviewer detail.
- Reopened returned report records for technician resubmission by updating the existing server report record back to `Submitted - Pending Supervisor Review` after validation.
- Derived work-package roll-up status from child per-tag report states on backend list/download and mobile local catalog load.
- Refreshed mobile local report state from server outcomes, mapping returned reports back to technician-owned editable local state while preserving report/evidence data and queue integrity.
- QA follow-up: preserved freshly mirrored server-authoritative `completed` / `attention_needed` mobile work-package roll-ups during later local catalog loads when local draft/report state is stale, while still allowing newer local draft/report state to drive offline roll-up derivation.
- QA follow-up: changed the freshness contract to use the mobile mirror timestamp (`local_updated_at` / `localUpdatedAt`) instead of package `updatedAt`, because backend child-report roll-up derivation changes status without advancing the assigned work-package row timestamp.

### Scope Adjustment
- Minimal adjustment: reactivated existing `manager_review_routes` on repeated escalation for the same report route. This is required because Story 6.5 allows returned manager reports to re-enter technician rework and later resubmission, which can legitimately escalate again without creating a duplicate route or leaking a database conflict.

### Tests Added / Updated
- Backend API tests for returned report status refresh, approval history persistence after resubmission, and work-package roll-up through `assigned`, `in_progress`, `attention_needed`, `pending_review`, and `completed`.
- Mobile orchestrator test for server returned-status refresh into editable local rework state with approval history.
- Mobile sync-state service test for connected server-status refresh and shell reload.
- Mobile work-package catalog test for local roll-up status derived from child report outcomes.
- QA follow-up: mobile orchestrator regression for accepted returned-report resubmission with already finalized photo evidence and no stale evidence queue items.
- QA follow-up: mobile catalog regression ensuring connected server roll-up statuses (`completed`, `attention_needed`) are preserved over stale local report drafts.
- QA follow-up: expanded the mobile catalog regression to call `loadLocalCatalog()` after connected refresh so stale local draft/report state cannot downgrade freshly mirrored server roll-ups.
- QA follow-up: mobile catalog regression now matches backend response shape where server-derived `completed` / `attention_needed` is returned with the older assigned work-package `updatedAt`, and confirms local-newer report state can still drive offline derivation after the mirror point.

### Validation Results
- `cd backend && npm run typecheck` - passed.
- `cd backend && npm test -- createApiRequestHandler` - passed, 15 tests.
- `cd backend && npm test` - passed, 9 files / 34 tests.
- `cd mobile && npm run typecheck` - passed.
- `cd mobile && npm test -- evidenceUploadOrchestrator syncState assignedWorkPackageCatalog` - passed, 5 files / 28 tests.
- `cd mobile && npm test` - passed, 21 files / 120 tests.
- `git diff --check` - passed; only line-ending warnings from existing Git attributes.

### QA Follow-up Validation Results (2026-05-01)
- `cd mobile && npm test -- assignedWorkPackageCatalog` - passed, 1 file / 6 tests.
- `cd mobile && npm test -- evidenceUploadOrchestrator syncState assignedWorkPackageCatalog` - passed, 5 files / 28 tests.
- `cd mobile && npm run typecheck` - passed.
- `cd mobile && npm test` - passed, 21 files / 120 tests.
- `git diff --check` - passed; only line-ending warnings from existing Git attributes.
- Generated/cache check - clean; no generated or cache files remain dirty.
- Backend response contract was not changed by the latest freshness-contract follow-up, so backend tests were not rerun after this mobile-only mirror fix.

### File List
- `backend/src/api/createApiRequestHandler.ts`
- `backend/src/api/createApiRequestHandler.test.ts`
- `backend/src/modules/report-submissions/model.ts`
- `backend/src/modules/report-submissions/reportSubmissionRepository.ts`
- `backend/src/modules/report-submissions/reportSubmissionService.ts`
- `backend/src/modules/review/supervisorReviewRepository.ts`
- `backend/src/modules/work-packages/assignedWorkPackageRepository.ts`
- `backend/src/modules/work-packages/model.ts`
- `mobile/src/features/execution/model.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/sync/evidenceUploadApiClient.ts`
- `mobile/src/features/sync/evidenceUploadOrchestrator.ts`
- `mobile/src/features/sync/evidenceUploadOrchestrator.test.ts`
- `mobile/src/features/sync/syncStateService.ts`
- `mobile/src/features/sync/syncStateService.test.ts`
- `mobile/src/data/local/repositories/assignedWorkPackageRepository.ts`
- `mobile/src/features/work-packages/assignedWorkPackageCatalogService.ts`
- `mobile/src/features/work-packages/assignedWorkPackageCatalogService.test.ts`
- `mobile/src/features/work-packages/assignedWorkPackageReadiness.test.ts`
- `mobile/src/features/work-packages/model.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `_bmad-output/implementation-artifacts/6-5-approval-history-work-package-roll-up-and-returned-report-re-entry.md`
