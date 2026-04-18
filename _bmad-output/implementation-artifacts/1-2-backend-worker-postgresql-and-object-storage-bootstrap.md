# Story 1.2: Backend, Worker, PostgreSQL, and Object Storage Bootstrap

Status: review

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

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Completion Notes List
- Created a new `backend/` TypeScript codebase for the approved modular monolith backend baseline without changing the mobile/local-first foundation from Story 1.1.
- Added separate API and worker entry points from the same codebase with independent health and readiness endpoints.
- Added PostgreSQL pool/bootstrap code plus a versioned migration runner with the initial service foundation migration.
- Added S3-compatible object storage wiring and a bootstrap smoke command that verifies bucket access through a create-or-head, put, and delete cycle.
- Added environment parsing, `.env.example`, and backend README instructions for local dev and staging-style bootstrap.
- Added focused automated tests for environment loading, PostgreSQL migrations, object storage smoke behavior, and API/worker readiness endpoints.

### Tests Run
- `npm run typecheck`
- `npm test`
- `npm run build`

### Manual Smoke Test
1. Run `cd backend && npm install`.
2. Start PostgreSQL and a private S3-compatible object store such as MinIO.
3. Export the values from `backend/.env.example`.
4. Run `npm run db:migrate`.
5. Run `npm run storage:smoke`.
6. In separate terminals run `npm run dev:api` and `npm run dev:worker`.
7. Open `http://127.0.0.1:4100/health/ready` and `http://127.0.0.1:4101/health/ready`.
8. Expected result:
- both services boot independently
- readiness returns `200` after PostgreSQL is reachable
- storage smoke completes without a leftover bootstrap object

### File List
- `backend/.env.example`
- `backend/README.md`
- `backend/package-lock.json`
- `backend/package.json`
- `backend/src/api/main.ts`
- `backend/src/config/env.test.ts`
- `backend/src/config/env.ts`
- `backend/src/platform/db/migrations.test.ts`
- `backend/src/platform/db/migrations.ts`
- `backend/src/platform/db/postgres.ts`
- `backend/src/platform/db/runMigrationsCli.ts`
- `backend/src/platform/health/httpHealthServer.ts`
- `backend/src/platform/health/readiness.ts`
- `backend/src/platform/storage/objectStorage.test.ts`
- `backend/src/platform/storage/objectStorage.ts`
- `backend/src/platform/storage/runObjectStorageSmokeCli.ts`
- `backend/src/runtime/serviceRuntime.test.ts`
- `backend/src/runtime/serviceRuntime.ts`
- `backend/src/worker/main.ts`
- `backend/tsconfig.json`
- `backend/vitest.config.ts`
