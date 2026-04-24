# Story 5.3: Sync State UI, Retry, and Resume Behavior

Status: review

## Metadata
- Story key: 5-3-sync-state-ui-retry-and-resume-behavior
- Story map ID: E5-S3
- Epic: Epic 5 - Submission, Sync, and Pending Validation
- Release phase: Vertical Slice

## User Story
As a technician, I want clear sync states and retry controls so I know whether my report is still local, queued, pending validation, or has an issue.

## Scope
per-report and per-package sync badges, sync detail state, explicit retry action, auto-retry on reconnect/reopen, resume after app restart.

## Key Functional Requirements Covered
FR-10, FR-13, Offline/Sync "How the user sees sync state".

## Technical Notes / Implementation Approach
drive UI from explicit local sync state machine; separate report business state from sync transport state.

## Dependencies
- `E5-S1`, `E5-S2`.

## Risks
- if sync transport state and approval state are mixed, users will misread report status.

## Acceptance Criteria
1. Reports and packages show the approved sync states in the UI.
2. Auto-retry occurs on reconnect and app reopen for eligible items.
3. Users can manually retry failed sync items.
4. Sync status survives app restart and remains consistent with local queue records.

## Validation / Test Notes
- state-machine tests, reconnect/reopen retry tests, UI regression tests for state display.

## Dev Agent Record
### Implementation Summary
- Selected Story 5.3 from the ordered story index after Story 5.2; Story 5.4 depends on E5-S3.
- Added an explicit local sync-state model for the approved v1 states: `local-only`, `queued`, `syncing`, `pending-validation`, `synced`, and `sync-issue`.
- Added a mobile sync-state service that derives per-report and per-package sync summaries from local report drafts, evidence metadata, and queue records.
- Wired connected app reopen and connected sign-in to retry eligible queued evidence sync work without adding Story 5.4 server validation or approval behavior.
- Added report/package sync badges, report sync detail, evidence sync badges, and a manual retry action scoped to retry-ready local evidence queue items.
- Kept report lifecycle state separate from sync transport state.
- Preserved the helper-level offline-to-connected regain detector and reverted the QA-rejected AppState/timer monitor test attempt after approval.

### Files Updated
- `mobile/src/features/execution/model.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/sync/syncStateModel.ts`
- `mobile/src/features/sync/syncStateModel.test.ts`
- `mobile/src/features/sync/syncConnectivityRegain.ts`
- `mobile/src/features/sync/syncStateConnectivityRegain.test.ts`
- `mobile/src/features/sync/syncStateService.ts`
- `mobile/src/features/sync/syncStateService.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`

### Validation Results
- `cd mobile && npm run typecheck`
- `cd mobile && npm test -- syncState`
- `cd mobile && npm test -- sharedExecutionShellService`
- `cd mobile && npm test -- evidenceUploadOrchestrator`
- `cd mobile && npm test`
- `cd backend && npm run typecheck`

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
