# Story 7.1: Staging/Production Deployment, Secrets, and Backups

Status: review

## Metadata
- Story key: 7-1-staging-production-deployment-secrets-and-backups
- Story map ID: E7-S1
- Epic: Epic 7 - Release Readiness, Deployment, and Optional AI Assist
- Release phase: Release Hardening

## User Story
As an operations owner, I want staging and production environments with safe configuration and backups so TagWise can run as a real service.

## Scope
staging/prod environment setup, secrets management, backup scheduling, restore verification baseline, deployment pipeline basics.

## Key Functional Requirements Covered
Architecture deployment baseline, production readiness objective.

## Technical Notes / Implementation Approach
single-region managed deployment, managed PostgreSQL backups, managed object storage policy, environment-scoped secrets.

## Dependencies
- `E1-S2`, `E5-S4`, `E6-S5`.

## Risks
- late environment setup can hide release blockers until the end.

## Acceptance Criteria
1. Staging and production environments exist and match the approved runtime shape.
2. Secrets/configuration are environment-scoped and not embedded in code.
3. Database backup and restore baseline is verified.
4. Deployment process can promote a tested build into staging and production.

## Validation / Test Notes
- environment smoke tests, backup/restore drill, deployment checklist verification.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)

## Dev Agent Record

### Selected Story Verification
- Verified `story-index.md` sequence: Story 7.1 follows Story 6.5.
- Verified Story 7.1 dependencies: `E1-S2`, `E5-S4`, `E6-S5`.
- Verified Story 6.5 closeout is `done` with final BMAD QA verdict `Pass`.
- Noted older dependency story records still show `Status: review`; treated as artifact hygiene, not an implementation blocker, because the implemented repo contains the backend runtime, sync validation, and Story 6.5 closeout needed by Story 7.1.

### Scope Implemented
- Added release-safe backend environment contract with `TAGWISE_DEPLOYMENT_ENV` and staging/production guardrails for managed database, object storage, and non-development secrets.
- Added staging and production environment templates with secret-manager placeholders and no embedded real secrets.
- Added one reusable backend container image that can run API by default and worker via command override.
- Added manual release-gate workflow for tested backend/mobile builds, backend image build, and environment-scoped deployment preflight.
- Added deployment preflight command that validates release configuration and emits a redacted environment summary.
- Added release smoke command for API/worker liveness, readiness, and metrics endpoints.
- Added backup restore verification command that checks a disposable restored PostgreSQL database against source/current migration version.
- Added Story 7.1 release environment runbook covering deployment shape, secret handling, promotion checks, and backup/restore drill.

### Tests Added / Updated
- Backend environment tests for release guardrails and production-safe config.
- Deployment preflight tests for redacted release summaries and rejected development storage behavior.
- Release smoke tests for API/worker health endpoint coverage and failure handling.
- Backup restore verification tests for matching and lagging restored schema versions.

### Validation Results
- `cd backend && npm test -- env deploymentPreflight releaseSmoke backupRestoreVerification` - passed, 4 files / 14 tests.
- `cd backend && npm run typecheck` - passed.
- `cd backend && npm test` - passed, 12 files / 45 tests.
- `cd backend && npm run build` - passed.
- `cd backend && npm run deploy:preflight` with staging-style environment variables - passed and emitted redacted config summary.
- `cd mobile && npm run typecheck` - passed.
- `cd mobile && npm test` - passed, 21 files / 120 tests.
- `git diff --check` - passed; only line-ending warnings from existing Git attributes.
- `docker build -t tagwise-backend:story-7-1 .` - not executed because Docker CLI is installed but the local Docker daemon is not running.

### File List
- `.gitignore`
- `.github/workflows/release-gate.yml`
- `backend/.dockerignore`
- `backend/.env.example`
- `backend/.env.staging.example`
- `backend/.env.production.example`
- `backend/Dockerfile`
- `backend/README.md`
- `backend/package.json`
- `backend/src/config/env.ts`
- `backend/src/config/env.test.ts`
- `backend/src/ops/backupRestoreVerification.ts`
- `backend/src/ops/backupRestoreVerification.test.ts`
- `backend/src/ops/backupRestoreVerificationCli.ts`
- `backend/src/ops/deploymentPreflight.ts`
- `backend/src/ops/deploymentPreflight.test.ts`
- `backend/src/ops/deploymentPreflightCli.ts`
- `backend/src/ops/releaseSmoke.ts`
- `backend/src/ops/releaseSmoke.test.ts`
- `backend/src/ops/releaseSmokeCli.ts`
- `docs/ops/story-7-1-release-environments.md`
