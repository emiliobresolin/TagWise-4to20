# Story 5.3: Sync State UI, Retry, and Resume Behavior

Status: ready-for-dev

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

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
