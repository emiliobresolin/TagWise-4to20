# Story 1.5: Audit, Logging, and Error Capture Baseline

Status: review

## Metadata
- Story key: 1-5-audit-logging-and-error-capture-baseline
- Story map ID: E1-S5
- Epic: Epic 1 - Platform, Identity, and Local-First Foundation
- Release phase: First Release

## User Story
As an operations owner, I want baseline audit and diagnostic visibility so sync, approval, and field failures can be understood early.

## Scope
structured logs, request/report correlation ids, baseline audit event plumbing, mobile/backend error capture, basic service metrics.

## Key Functional Requirements Covered
FR-14 baseline, Architecture observability and auditability baseline.

## Technical Notes / Implementation Approach
create a shared correlation-id pattern; log audit-worthy state changes through a consistent service boundary; capture mobile and backend runtime errors with environment context.

## Dependencies
- `E1-S1`, `E1-S2`, `E1-S3`.

## Risks
- missing correlation early will make later sync issues difficult to trace.

## Acceptance Criteria
1. API and worker logs include correlation ids and structured severity fields.
2. Mobile app errors can be captured with device/session context.
3. Baseline audit events can be written for auth/session-level actions.
4. Basic operational metrics exist for service uptime and error rate.

## Validation / Test Notes
- log contract test, audit event persistence smoke test, forced-error capture check.

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
- Added structured JSON logging with correlation-id propagation for API and worker request handling plus a shared logger boundary that later sync and approval stories can reuse.
- Added a baseline audit event module and PostgreSQL persistence, then wired auth login and refresh actions through it without expanding into broader approval or report audit flows.
- Added a `/metrics` endpoint and service metrics state so early production environments can observe uptime, request count, and error rate with minimal operational overhead.
- Added mobile runtime error persistence in SQLite and a narrow diagnostics capture flow in the signed-in shell so forced errors can be stored with device, route, API base URL, and session context.
- Kept the story narrow: no sync engine, report lifecycle, approval lifecycle, or remote telemetry vendor integration was introduced.

### Tests Run
- `cd backend && npm test`
- `cd backend && npm run typecheck`
- `cd backend && npm run build`
- `cd mobile && npm test`
- `cd mobile && npm run typecheck`
- `cd mobile && npx expo export --platform android`

### Manual Smoke Test
1. In `backend/`, export the values from `.env.example`, run `npm run db:migrate`, then run `npm run dev:api` and `npm run dev:worker`.
2. Open `http://127.0.0.1:4100/metrics` and confirm the JSON payload contains `uptimeMs`, `requestCount`, `errorCount`, and `errorRate`.
3. Send `POST http://127.0.0.1:4100/auth/login` with header `x-correlation-id: smoke-login-001` and JSON body `{"email":"tech@tagwise.local","password":"TagWise123!"}`.
4. Query `SELECT action_type, correlation_id FROM audit_events ORDER BY occurred_at DESC LIMIT 2;` in PostgreSQL.
5. Expected backend result:
- the login response echoes `x-correlation-id: smoke-login-001`
- the audit table contains auth/session events with stored correlation ids
- the API and worker logs emit structured JSON lines with `severity`, `event`, and `correlationId`
6. In `mobile/`, run `npm start` and open the app on an emulator, simulator, or Expo Go.
7. Sign in with `tech@tagwise.local` / `TagWise123!`.
8. On the `Foundation` route, tap `Capture diagnostic error`.
9. Expected mobile result:
- `Captured errors` increments
- `Latest mobile diagnostic` shows `Forced mobile diagnostics capture`
- closing and reopening the app keeps the captured diagnostics count in local SQLite

### File List
- `backend/README.md`
- `backend/src/api/createApiRequestHandler.test.ts`
- `backend/src/api/createApiRequestHandler.ts`
- `backend/src/api/main.ts`
- `backend/src/modules/audit/auditEventRepository.ts`
- `backend/src/modules/audit/auditEventService.ts`
- `backend/src/modules/audit/model.ts`
- `backend/src/modules/auth/authService.test.ts`
- `backend/src/modules/auth/authService.ts`
- `backend/src/platform/db/migrations.test.ts`
- `backend/src/platform/db/migrations.ts`
- `backend/src/platform/diagnostics/correlation.ts`
- `backend/src/platform/diagnostics/serviceMetrics.ts`
- `backend/src/platform/diagnostics/structuredLogger.test.ts`
- `backend/src/platform/diagnostics/structuredLogger.ts`
- `backend/src/platform/health/httpHealthServer.ts`
- `backend/src/platform/health/readiness.ts`
- `backend/src/runtime/serviceRuntime.test.ts`
- `backend/src/runtime/serviceRuntime.ts`
- `backend/src/worker/main.ts`
- `mobile/README.md`
- `mobile/src/data/local/bootstrapLocalDatabase.test.ts`
- `mobile/src/data/local/bootstrapLocalDatabase.ts`
- `mobile/src/data/local/repositories/mobileRuntimeErrorRepository.ts`
- `mobile/src/data/local/sqlite/bootstrap.test.ts`
- `mobile/src/data/local/sqlite/migrations.ts`
- `mobile/src/features/app-shell/model.ts`
- `mobile/src/features/diagnostics/mobileErrorCapture.test.ts`
- `mobile/src/features/diagnostics/mobileErrorCapture.ts`
- `mobile/src/features/diagnostics/model.ts`
- `mobile/src/shell/TagWiseApp.tsx`
