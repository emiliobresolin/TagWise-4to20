# Story 4.2: Photo Capture and Local Media Attachment

Status: ready-for-dev

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
