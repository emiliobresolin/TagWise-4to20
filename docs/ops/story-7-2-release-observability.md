# Story 7.2 Release Observability

This runbook implements the Story 7.2 provider-neutral monitoring baseline for release health,
alert dry-runs, operational dashboards, and backend/mobile error trend capture.

## Release Health Command

Run after the API, worker, migrations, storage smoke, and release smoke checks have passed:

```powershell
cd backend
$env:TAGWISE_API_BASE_URL='https://<api-host>'
$env:TAGWISE_WORKER_BASE_URL='https://<worker-host>'
npm run release:observability
```

The command reads release database state and service health endpoints, then prints a JSON
`release.observability.completed` event containing:

- queue depth for supervisor review, manager review, and pending evidence finalization
- accepted report submissions in the release window
- stale evidence finalization signals
- approval decision latency and oldest pending review age
- API and worker readiness/error metrics
- mobile runtime error trends by platform and app environment
- alert decisions and a dashboard-ready section/check model

## Alert Thresholds

The Story 7.2 baseline treats these as release-health alerts:

- total operational queue depth above 25: warning
- stale pending evidence finalization older than 60 minutes: critical
- any sync failure signal from stale evidence finalization: critical
- approval decision or pending review age above 120 minutes: warning
- worker readiness failure: critical
- worker-reported errors: critical
- API error rate at or above 5 percent: critical
- mobile runtime errors in the release window: critical

Provider-native alerting can mirror these thresholds later without changing the application contract.

## Dashboard Use

Use the `dashboard.sections` output as the source for the release dashboard. During staging and
production promotion, the operations owner should confirm:

- Sync and queue checks are `ok`.
- Approval flow checks are `ok` or have an accepted operational explanation.
- Worker readiness is `true`.
- Backend API error rate is below the threshold.
- Mobile error count for the release window is zero unless a known synthetic diagnostic was run.

## Error Monitoring

Backend crash/error trends come from `/metrics` and structured service logs. Mobile runtime errors
are captured locally by the app and reported while connected to:

```text
POST /diagnostics/mobile-errors
```

The endpoint requires an authenticated mobile session and persists the runtime error event for the
release observability dashboard. Offline devices keep captured errors local and report them after a
connected session is restored.

## Validation

Minimum Story 7.2 validation:

```powershell
cd backend
npm test -- releaseObservability createApiRequestHandler migrations
npm run typecheck
npm test

cd ../mobile
npm test -- mobileDiagnostics mobileErrorCapture bootstrap
npm run typecheck
npm test
```

Synthetic failure check:

1. Capture a diagnostic error in the mobile shell while connected.
2. Run `npm run release:observability`.
3. Confirm `mobile-crash-trend-present` appears in `dashboard.alerts`.

The command is intentionally provider-neutral for this release stage. Hosted dashboards and alert
policies should ingest the same JSON fields when a cloud provider is selected.
