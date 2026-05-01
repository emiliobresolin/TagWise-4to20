# Story 7.1: Staging/Production Deployment, Secrets, and Backups

Status: done

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
- QA blocker fix: environment and deployment preflight regressions now reject production/staging template placeholders (`<...>`), invalid database URLs, release storage placeholders, release seed-email placeholders, and `TAGWISE_NODE_ENV=production` with deployment guardrails disabled.
- QA blocker fix: backup/restore verification regressions now require exact ordered migration IDs and fail when same-count migration rows contain different IDs.
- QA hardening: release smoke now has a bounded request timeout with an actionable failure message.

### QA Blocker Fix Follow-up (2026-05-01)
- Root cause: release guardrails only rejected known development defaults, so template placeholder tokens and unparsable release database URLs could pass `deploy:preflight`.
- Root cause: backup restore verification compared only `schema_migrations` row counts, so same-count but wrong migration identities could pass.
- Fix: release environments now fail closed on placeholder tokens, invalid/non-PostgreSQL database URLs, local release storage endpoints, development database credentials, default seed identities, and production runtime with `TAGWISE_DEPLOYMENT_ENV=development`.
- Fix: restore verification now compares source/restored ordered migration IDs against `postgresMigrationDefinitions` and compares core table row counts between source and restored databases.
- Scope decision: CI still does not run release smoke or backup restore verification automatically because those require deployed endpoints and disposable restored database credentials; the Story 7.1 baseline keeps them as release/runbook gates.

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

### QA Fix Validation Results (2026-05-01)
- `cd backend && npm test -- env deploymentPreflight releaseSmoke backupRestoreVerification` - passed, 4 files / 25 tests.
- `cd backend && npm run typecheck` - passed.
- `cd backend && npm test` - passed, 12 files / 56 tests.
- `cd backend && npm run build` - passed.
- `cd backend && npm run deploy:preflight` with staging-style environment variables - passed and emitted redacted config summary.
- `cd backend && npm run deploy:preflight` with production template placeholders - failed as expected on `TAGWISE_DATABASE_URL`.
- `git diff --check` - passed; only line-ending warnings from existing Git attributes.
- Generated/cache file check - clean after removing build/Vitest generated outputs from the working tree.
- `docker build -t tagwise-backend:story-7-1 .` - not executed because Docker CLI is installed but the local Docker daemon is not running.

### QA Closeout (2026-05-01)
- Final BMAD QA verdict: Pass with minor non-blocking concerns.
- Story 7.1 is approved and closed as `done`.
- Non-blocking follow-up: CI does not automatically run `release:smoke` or `backup:restore:verify`; these remain release/runbook gates because they require deployed endpoints and disposable restored database credentials.
- Non-blocking follow-up: core table row counts provide a Story 7.1 restore baseline, not full restore data integrity proof.

### File List
- `_bmad-output/implementation-artifacts/7-1-staging-production-deployment-secrets-and-backups.md`
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
