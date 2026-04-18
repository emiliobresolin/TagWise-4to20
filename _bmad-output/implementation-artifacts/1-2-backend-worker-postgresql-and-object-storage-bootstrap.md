# Story 1.2: Backend, Worker, PostgreSQL, and Object Storage Bootstrap

Status: ready-for-dev

## Metadata
- Story key: 1-2-backend-worker-postgresql-and-object-storage-bootstrap
- Story map ID: E1-S2
- Epic: Epic 1 - Platform, Identity, and Local-First Foundation
- Release phase: Vertical Slice

## User Story
As an operations owner, I want the core backend runtime in place so TagWise has a production-minded home for reports, approvals, and evidence.

## Scope
modular monolith API bootstrap, worker bootstrap, PostgreSQL schema/migration baseline, object storage wiring, environment configuration, health endpoints.

## Key Functional Requirements Covered
FR-13 enablement, FR-14 enablement, Architecture runtime shape and deployment baseline.

## Technical Notes / Implementation Approach
create one codebase with separate API and worker entry points; wire PostgreSQL migrations; configure private object storage buckets/containers; expose health and readiness checks.

## Dependencies
- none.

## Risks
- storage/environment drift can create early instability; skipping worker bootstrap now will complicate validation and media flows later.

## Acceptance Criteria
1. API and worker processes boot independently from the same codebase.
2. PostgreSQL migrations can be applied cleanly in dev/staging.
3. Object storage connectivity is verified through a bootstrap smoke path.
4. Health endpoints expose service readiness for API and worker.

## Validation / Test Notes
- backend integration smoke tests, migration tests, object storage connectivity check, environment boot test.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
