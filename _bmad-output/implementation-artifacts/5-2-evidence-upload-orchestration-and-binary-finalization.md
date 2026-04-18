# Story 5.2: Evidence Upload Orchestration and Binary Finalization

Status: ready-for-dev

## Metadata
- Story key: 5-2-evidence-upload-orchestration-and-binary-finalization
- Story map ID: E5-S2
- Epic: Epic 5 - Submission, Sync, and Pending Validation
- Release phase: End-to-End Demo

## User Story
As a technician, I want my evidence attachments to sync safely after connectivity returns so the canonical report includes the right media without losing local files.

## Scope
evidence metadata sync, upload authorization flow, binary upload to object storage, server/worker finalization of evidence presence.

## Key Functional Requirements Covered
FR-13, Evidence/media architecture upload flow, Pending validation flow.

## Technical Notes / Implementation Approach
sync metadata first, then upload binaries using controlled authorization; worker verifies upload completion and finalizes evidence state.

## Dependencies
- `E1-S2`, `E4-S2`, `E5-S1`.

## Risks
- binary uploads can fail after metadata acceptance and create confusing partial state if not surfaced clearly.

## Acceptance Criteria
1. Evidence metadata can sync independently of the binary upload.
2. Client can upload evidence binaries using the approved storage flow.
3. Server or worker records final evidence presence status.
4. Local evidence is retained until the canonical upload outcome is known.

## Validation / Test Notes
- upload integration tests, retry tests for transient failures, object storage finalization tests.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
