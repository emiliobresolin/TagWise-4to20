# Story 1.4: User-Partitioned Local Repositories and Media Sandbox

Status: ready-for-dev

## Metadata
- Story key: 1-4-user-partitioned-local-repositories-and-media-sandbox
- Story map ID: E1-S4
- Epic: Epic 1 - Platform, Identity, and Local-First Foundation
- Release phase: Vertical Slice

## User Story
As a technician, I want my local drafts, evidence, and queued work isolated to my authenticated session so device sharing cannot corrupt report ownership.

## Scope
user-partitioned local tables, user-partitioned media folders, repository identity binding, local cleanup rules.

## Key Functional Requirements Covered
Offline identity/session boundary, FR-08 baseline enablement, Sync lifecycle groundwork.

## Technical Notes / Implementation Approach
key local records by authenticated user plus business object id; isolate sandbox media paths by user/session; never reuse unsynced records across users.

## Dependencies
- `E1-S1`, `E1-S3`.

## Risks
- weak local partitioning will break sync ownership and auditability later.

## Acceptance Criteria
1. Local drafts, evidence metadata, and queued items are stored under the authenticated user partition.
2. Media files captured by one user are not visible in another user's local session.
3. User logout/login does not reassign unsynced content to a different user.
4. Local repositories can query by user and business object identity.

## Validation / Test Notes
- multi-user device simulation, local data isolation test, media path ownership test.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
