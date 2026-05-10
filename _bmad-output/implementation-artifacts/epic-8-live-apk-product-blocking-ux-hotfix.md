# Epic 8 Live APK Product-Blocking UX Hotfix

## Status

Done - ready for live APK rebuild and manual phone smoke after the 2026-05-10 phone UX repair pass.

## Context

Live phone/backend QA found product-blocking UX issues after Epic 8 automated QA:

- Signed-out users could still enter the operational demo flow.
- Fresh authenticated users could refresh assigned package summaries but had no clear dark-shell path to download snapshots or open cached tags.
- The active app surface was conceptually competing with signed-out demo and old white-shell remnants.
- There was no local/manual instrument intake path for instruments missing from assigned packages.

## Dev Agent Record

### Implemented

- Disabled signed-out operational demo behavior by default.
  - Production signed-out users now see a login-only screen.
  - The old interactive demo shell is only available when `EXPO_PUBLIC_TAGWISE_ENABLE_DEMO_SHELL=true`.
  - Default behavior does not expose seeded PT-204, tag detail, QR, calculator, report, or approval screens before login.

- Added authenticated dark-shell work package preparation.
  - Assigned packages are visible in the production dark shell.
  - Refresh assigned package list is separate from snapshot download.
  - Each package shows cache/download state and actions to download/update snapshot and open cached tags.
  - Downloading a package now loads its cached tags immediately into the dashboard.
  - Cached packages remain browsable offline; uncached packages show connected-required state.

- Added local/manual instrument intake.
  - Authenticated technicians can create a local/manual/ad-hoc instrument from the dashboard.
  - Manual intake works offline through a local-only downloaded snapshot.
  - Manual instruments are marked `local-manual` / `manual-intake` and pending reconciliation.
  - Manual instruments open through existing local tag context and shared execution shell services.
  - Manual report drafts remain local-only; backend acceptance/sync is not faked.

- Preserved manual intake across connected package refresh.
  - Remote assignment refresh still removes obsolete server packages.
  - Local manual intake snapshots are restored after refresh so technician-created ad-hoc work is not erased.

### Files Changed

- `mobile/src/features/visual-shell/model.ts`
- `mobile/src/features/visual-shell/visualWorkflow.test.ts`
- `mobile/src/features/visual-shell/serviceBackedPackages.ts`
- `mobile/src/features/visual-shell/serviceBackedPackages.test.ts`
- `mobile/src/features/visual-shell/serviceBackedReport.ts`
- `mobile/src/features/visual-shell/serviceBackedReport.test.ts`
- `mobile/src/features/work-packages/manualInstrumentModel.ts`
- `mobile/src/features/work-packages/manualInstrumentService.ts`
- `mobile/src/features/work-packages/manualInstrumentService.test.ts`
- `mobile/src/features/work-packages/assignedWorkPackageCatalogService.ts`
- `mobile/src/features/work-packages/assignedWorkPackageCatalogService.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/src/shell/VisualProductShell.tsx`
- `_bmad-output/implementation-artifacts/epic-8-live-apk-product-blocking-ux-hotfix.md`

### Validation

- `cd mobile && npm run typecheck` - passed.
- `cd mobile && npm test` - passed, 29 files / 163 tests.
- `cd mobile && npx expo-doctor` - passed, 17/17 checks.
- Live backend probe from dev machine - passed:
  - `/health/ready` ready.
  - Technician login succeeded.
  - Assigned packages returned.
  - First package download returned cached tags.
  - Supervisor login succeeded.

### Remaining Limitations

- Physical phone/APK smoke was not executed by the agent in this environment.
- APK must be rebuilt/reinstalled before the user can verify the fixed live phone behavior.
- Manual/ad-hoc instrument server reconciliation and official enterprise asset creation remain backlog work.
- Manual instrument reports are intentionally local-only for now; the app does not fake backend acceptance.
- Old white-shell code remains commented/unreachable in `TagWiseApp.tsx`; it was not restored as production UI.

## 2026-05-10 Live Phone UX / Functionality Repair Addendum

### Implemented in this pass

- Converted the active production shell toward PT-BR-first visible copy.
  - Supervisor review, report, guidance, sync, risk/evidence, calculation, and manual intake labels were translated where they appear in the active dark shell.
  - The exact phone-visible risk/evidence cards no longer render as `Cached history is stale`, `Expected evidence missing`, `Minimum evidence missing`, `Submit-blocking`, or `Risk justification`; they now use PT-BR service-backed text.

- Reduced misleading/dead dashboard UX.
  - Header icon-only controls that looked tappable but were not wired were removed from the production dashboard.
  - `Ver todas` was removed from section headers instead of remaining decorative.
  - The manual instrument form is no longer an always-visible dashboard block; the dashboard has a compact `Novo instrumento` action that opens a dedicated registration screen.

- Improved technician navigation and status visibility.
  - Added a compact dashboard action panel for `Calculadora`, `Meus relatorios`, `Novo instrumento`, and returned/correction awareness.
  - Added technician report summaries/statuses from local report draft/sync state.
  - Tag cards now show per-instrument work status when a local report exists: not started, draft, pending sync, pending review, returned, approved, sync issue, or manual local.
  - Added `Meus relatorios` route so technicians can open local drafts/submissions without supervisor actions.

- Improved manual/ad-hoc instrument intake.
  - Manual intake is a dedicated screen with picker chips for family, measured variable, signal type, unit, and tolerance pattern.
  - Free text remains for description, area, subtype/model, range, reason, and notes.
  - Manual local ids now include timestamp plus entropy to reduce rapid-tap collision risk.
  - Manual intake remains explicitly local/manual/pending reconciliation and does not pretend to be an official SAP/Maximo/TOTVS asset.

- Improved editability before sync.
  - Technician-owned draft and `submitted-pending-sync` reports are editable.
  - Saving a pending-sync report back to draft clears queued report/evidence sync work instead of silently locking the field user.
  - Server-accepted pending-review reports remain read-only and show a clear lock reason.

- Added calculator and loop-test support.
  - Added standalone field calculator model and dashboard access.
  - Supports PV <-> mA, mA <-> %, error absolute/tolerance, and standalone use without selected instrument.
  - Added loop test helper with 5 default points, editable from 1 to 10, PV/mA input modes, conversion, error, tolerance, and pass/fail summary.
  - The selected tag range can prefill the standalone calculator when available.

- Reduced blank/giant comparison state.
  - The history/compare screen now renders a compact mini trend visualization when local history rows exist.
  - If there is not enough data, it shows an explicit `Sem dados suficientes para grafico` state instead of leaving an empty oversized card.

### Fixed / partially fixed / deferred against the 20 manual findings

- Fixed: 1, 2, 3, 7, 11, 12 before server acceptance, 15, 16, 19 model/helper support.
- Partially fixed: 4 supervisor tabs are service-backed and translated, but real approved/returned visibility still depends on backend queue data returned by existing services.
- Partially fixed: 5 unsynced/pending-sync reports are editable; full server-side revision/correction after accepted review remains a future lifecycle story.
- Partially fixed: 6, 8, 9, 10, 14, 20 were improved through smaller manual/report/calculator routes, compact cards, dashboard actions, and clearer PT-BR labels, but a full step-by-step technician wizard remains a larger UX story.
- Partially fixed: 13 remains dependent on a coherent real report submission with backend/provider result; no AI output was faked.
- Deferred: 17 realistic seed/backend fixture data for many report states was not added in this pass.
- Deferred/partial: 18 technician report list can surface returned states from local lifecycle; full returned report rework/resubmission/version history depends on backend lifecycle support.

### Additional files changed in this pass

- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `mobile/src/features/sync/syncStateModel.ts`
- `mobile/src/features/sync/syncStateModel.test.ts`
- `mobile/src/features/visual-shell/fieldCalculator.ts`
- `mobile/src/features/visual-shell/fieldCalculator.test.ts`
- `mobile/src/features/visual-shell/serviceBackedExecution.ts`
- `mobile/src/features/visual-shell/serviceBackedExecution.test.ts`
- `mobile/src/features/visual-shell/serviceBackedReview.ts`
- `mobile/src/features/visual-shell/serviceBackedReview.test.ts`
- `mobile/src/features/visual-shell/technicianReports.ts`
- `mobile/src/features/visual-shell/technicianReports.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/src/shell/VisualProductShell.tsx`

### Validation for this pass

- `cd mobile && npm run typecheck` - passed.
- `cd mobile && npm test` - passed, 31 files / 168 tests.
- `cd mobile && npx expo-doctor` - passed, 17/17 checks.
- `git diff --check` - passed with existing CRLF normalization warnings only.

### Remaining limitations after this pass

- Physical phone/APK smoke was not executed by the agent.
- APK must be rebuilt/reinstalled before declaring this field-demo ready.
- Manual/ad-hoc instrument sync/reconciliation remains local-only/backlog.
- Full returned-report revision/versioning after backend acceptance remains backlog unless existing backend data already supports it.
- Rich production seed data covering draft/pending/approved/returned/escalated report states remains backlog.
- The execution flow is improved but not yet a full guided wizard with strict short screens for every stage.

## Manual APK Smoke Checklist

- Fresh app open while signed out shows login only.
- Technician login with backend reachable succeeds.
- Assigned packages appear in the dark shell.
- Download first assigned package.
- Cached tags appear/open.
- Disable network and confirm cached tags still open.
- QR/manual payload for cached tag resolves offline.
- Create manual/ad-hoc instrument offline.
- Open manual/ad-hoc instrument and save report notes/evidence where supported.
- Confirm manual report stays local-only/pending reconciliation.
- Confirm technician does not see approval queue/actions.
- Supervisor login while connected still loads review queue/actions.
