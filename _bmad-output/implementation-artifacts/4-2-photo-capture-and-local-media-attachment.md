# Story 4.2: Photo Capture and Local Media Attachment

Status: review

## Metadata
- Story key: 4-2-photo-capture-and-local-media-attachment
- Story map ID: E4-S2
- Epic: Epic 4 - Evidence, Justification, and Per-Tag Report Drafting
- Release phase: End-to-End Demo

## User Story
As a technician, I want to attach photos locally during field work so visual evidence is preserved even before sync.

## Scope
mobile photo capture/select flow, local file storage, metadata linkage, attachment preview in draft report.

## Key Functional Requirements Covered
FR-08, Evidence/media architecture local capture.

## Technical Notes / Implementation Approach
store binaries in sandbox filesystem; keep metadata in SQLite; defer remote upload to Epic 5.

## Dependencies
- `E1-S4`, `E4-S1`.

## Risks
- large files and partial captures can create storage issues if not bounded.

## Acceptance Criteria
1. Technician can capture or attach a photo while offline.
2. Photo metadata is linked to the current tag/report context.
3. Local attachment remains viewable in the draft report before sync.
4. Removing a draft attachment updates metadata and local file state consistently.

## Validation / Test Notes
- camera/gallery integration tests, local file lifecycle tests, attachment preview test.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Completion Notes List
- Added a bounded mobile photo acquisition seam for both camera capture and local-library attach so Story 4.2 can stay offline-first without embedding picker logic into the execution service.
- Reused the approved per-tag draft-report anchor from Story 4.1: photo binaries now copy into the user-owned sandbox under the draft report, while attachment metadata stays in SQLite and carries tag, template version, execution step, and report linkage.
- Kept the shared execution shell generic by surfacing draft-linked photo attachment preview and removal inside the existing guidance/evidence area, without creating a new report screen or introducing report-generation behavior early.
- Preserved non-blocking field flow by merging in-session calculation inputs, notes, and checklist outcomes back into the shell after attachment add/remove reloads.

### Tests Run
- `cd mobile && npm run typecheck`
- `cd mobile && npm test -- photoAcquisitionBoundary sharedExecutionShellService`
- `cd mobile && npm test`
- `cd mobile && npx expo export --platform android`

### File List
- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/src/data/local/repositories/userPartitionedEvidenceMetadataRepository.ts`
- `mobile/src/features/execution/model.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `mobile/src/platform/files/appSandboxBoundary.ts`
- `mobile/src/platform/media/photoAcquisitionBoundary.ts`
- `mobile/src/platform/media/photoAcquisitionBoundary.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/tests/helpers/createNodeAppSandboxBoundary.ts`
- `_bmad-output/implementation-artifacts/4-2-photo-capture-and-local-media-attachment.md`
