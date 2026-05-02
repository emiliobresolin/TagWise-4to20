# Story 7.2: Monitoring, Alerting, and Release Observability Hardening

Status: done

## Metadata
- Story key: 7-2-monitoring-alerting-and-release-observability-hardening
- Story map ID: E7-S2
- Epic: Epic 7 - Release Readiness, Deployment, and Optional AI Assist
- Release phase: Release Hardening

## User Story
As an operations owner, I want release-grade monitoring so sync, approval, and evidence failures are visible before they become field incidents.

## Scope
production metrics, dashboards, alert thresholds, release error monitoring, audit/sync observability checks.

## Key Functional Requirements Covered
Architecture observability and auditability, FR-14 operational traceability.

## Technical Notes / Implementation Approach
build on `E1-S5`; add dashboards for queue depth, sync success/failure, approval latency, evidence upload failures, worker failures.

## Dependencies
- `E1-S5`, `E5-S4`, `E6-S5`.

## Risks
- missing release dashboards will make field rollout support reactive instead of controlled.

## Acceptance Criteria
1. Production metrics exist for queue depth, sync failures, approval latency, and worker failures.
2. Alerts exist for severe sync/approval/evidence processing failure conditions.
3. Operational dashboards can be used to confirm release health.
4. Error monitoring captures backend and mobile crash trends.

## Validation / Test Notes
- alert dry-run, dashboard data verification, synthetic failure test.

## Dev Agent Record

### Implementation Summary
- Added a provider-neutral release observability module and `npm run release:observability` command that builds a dashboard-ready JSON report from PostgreSQL release data plus API/worker health metrics.
- Added release alert evaluation for operational queue depth, stale evidence finalization, sync failure signals, approval latency/pending review age, worker readiness/errors, backend error rate, and mobile runtime error trends.
- Added authenticated backend mobile diagnostics telemetry ingestion at `POST /diagnostics/mobile-errors`, with a durable `mobile_runtime_error_events` table included in backup/restore row-count verification.
- Added mobile diagnostics reporting so locally captured runtime errors remain offline-safe and are flushed to the backend when a connected session is available.
- Hardened diagnostics ingress after QA blocker review with a diagnostics-specific 24 KiB request body limit, clean malformed-JSON validation, bounded fields, URL origin normalization, and bounded/redacted context JSON persistence.
- Documented the Story 7.2 release observability runbook, thresholds, dashboard usage, and synthetic failure validation.

### Files Changed
- `backend/package.json`
- `backend/README.md`
- `backend/src/api/createApiRequestHandler.ts`
- `backend/src/api/createApiRequestHandler.test.ts`
- `backend/src/api/main.ts`
- `backend/src/modules/diagnostics/model.ts`
- `backend/src/modules/diagnostics/mobileDiagnosticsRepository.ts`
- `backend/src/modules/diagnostics/mobileDiagnosticsService.ts`
- `backend/src/ops/backupRestoreVerification.ts`
- `backend/src/ops/releaseObservability.ts`
- `backend/src/ops/releaseObservability.test.ts`
- `backend/src/ops/releaseObservabilityCli.ts`
- `backend/src/platform/db/migrations.ts`
- `backend/src/platform/db/migrations.test.ts`
- `docs/ops/story-7-2-release-observability.md`
- `mobile/src/data/local/repositories/mobileRuntimeErrorRepository.ts`
- `mobile/src/data/local/sqlite/bootstrap.test.ts`
- `mobile/src/data/local/sqlite/migrations.ts`
- `mobile/src/features/diagnostics/mobileDiagnosticsApiClient.ts`
- `mobile/src/features/diagnostics/mobileDiagnosticsReporter.ts`
- `mobile/src/features/diagnostics/mobileDiagnosticsReporter.test.ts`
- `mobile/src/features/diagnostics/mobileErrorCapture.ts`
- `mobile/src/features/diagnostics/model.ts`
- `mobile/src/shell/TagWiseApp.tsx`

### Validation Summary
- `cd backend && npm test -- releaseObservability createApiRequestHandler migrations backupRestoreVerification` - passed, 4 files / 24 tests.
- `cd mobile && npm test -- mobileDiagnostics mobileErrorCapture bootstrap` - passed, 4 files / 10 tests after hardening migration 13 for legacy diagnostics-table gaps.
- `cd backend && npm test -- createApiRequestHandler releaseObservability` - passed, 2 files / 30 tests after diagnostics ingress bounds fix.
- `cd backend && npm test -- env deploymentPreflight releaseSmoke backupRestoreVerification` - passed, 4 files / 25 tests.
- `cd mobile && npm test -- mobileDiagnostics mobileErrorCapture bootstrap` - passed, 4 files / 11 tests after backend-rejection retry-safety regression.
- `cd backend && npm run typecheck` - passed.
- `cd mobile && npm run typecheck` - passed.
- `cd backend && npm test` - passed, 13 files / 71 tests.
- `cd mobile && npm test` - passed, 22 files / 124 tests.
- `cd backend && npm run build` - passed; generated `backend/dist` output was restored from the working tree after the build check.
- `git diff --check` - passed with existing CRLF line-ending warnings only.
- Generated/cache file check - clean after restoring build/Vitest generated output.

### QA Closeout (2026-05-02)
- Final BMAD QA verdict: Pass with minor non-blocking concerns.
- Follow-up: `releaseObservabilityCli` service-signal fetch behavior could use small unit coverage.
- Follow-up: device-side offline sync queue depth is not centrally observable yet.
- Follow-up: diagnostics retention/redaction policy can evolve later, especially broader PII value redaction and retention windows.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
