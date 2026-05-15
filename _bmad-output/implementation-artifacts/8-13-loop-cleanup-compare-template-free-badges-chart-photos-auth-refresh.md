# Story 8.13 — Loop test cleanup, compare without template, badge labels, chart from priorReadings, checklist photo filter, token refresh

Date: 2026-05-15
Predecessor: Story 8.12 (photos, lifecycle, calculator sweep, AI failure, toast).
Story 8.14 deferred work: #4 explain/drop pass-with-note, #5 formal delete-package feature, #7 loop visualization, #9 report read-only, #10 interactive red flags.

## Scope

Six "quick fix" findings reported after the Story 8.12 phone test, plus a one-time data wipe affordance:

| # | Finding | What changed |
|---|---|---|
| 1 | "all tests have loop test" | Renamed AI-330's `tpl-loop-integrity-check` → "Analog continuity check" (zero-point) and `tpl-loop-signal-validation` → "Analog signal validation at span" so the visual pattern resolver no longer routes them through the loop screen. `tpl-loop-current-vs-process` remains as the single dedicated loop test for AI-330. PT-101/TT-205/LT-410 each keep one loop template (correct ratio). Bumped `packageVersion: 1 → 2` so refresh replaces the local snapshot. New **"Apagar pacote local"** button on each downloaded package card so the technician can wipe local state and re-download fresh data |
| 2 | Compare screen forced a test selection | `handleOpenExecutionRoute` no longer requires a template when entering the `history` route. `ServiceHistoryScreen` falls back to `selectedTagContext.priorReadings` even when no execution shell is loaded |
| 3 | Badges said "Abrindo" / "Salvo" | Replaced with PT-BR plain wording: `Concluido` (pass) / `Incompleto` (fail) / `Em andamento` (saved partial or currently selected) / `Iniciar` (untouched) |
| 6 | Compare chart said "Sem dados suficientes para grafico" even with seeded history | Chart bars now source from `priorReadingsForPoint` (filtered prior readings) with deviation-proportional height and hot color when the past reading was pass-with-note or fail. Empty state copy clarified |
| 8 | "Foto de execucao" on checklist not displayed | Photos captured from each capture screen are now stamped with an explicit `executionStepIdOverride`: `'calculation'` for `ServiceCalculationScreen` and `LoopExecutionScreen`, `'guidance'` for `ServiceGuidanceScreen`. Previously the photo's `executionStepId` derived from `shell.progress.currentStepId` which lagged the route, so the per-screen thumbnail filter dropped them. The instrument-detail panel already used `'instrument'` correctly |
| 11 | "token expired" on report submit | `handleSubmitExecutionReport` now intercepts `EvidenceUploadApiError` with `statusCode === 401`, calls `sessionController.restoreSession()` (which uses the cached refresh token to mint a new access token), and silently retries the submit. If refresh fails, a clear PT-BR message asks the technician to sign in again; the report stays in the local queue either way |

Story 8.14 still owes: #4 "Aprovação com observação" semantics, #5 formal delete-package feature (this story only adds a single per-package wipe button), #7 loop test results visualization + removal of visit-summary augmentation from observation notes, #9 report-screen read-only mode, #10 interactive red flags.

## Files changed

### Backend
- `backend/src/modules/work-packages/seedData.ts`:
  - `tpl-loop-integrity-check`: title "Analog loop integrity check" → "Analog continuity check"; testPattern "loop integrity check" → "continuity verification at zero point"; calculationMode adjusted so the mobile pattern resolver no longer classifies it as `loop`.
  - `tpl-loop-signal-validation`: title → "Analog signal validation at span"; testPattern → "signal validation at span point"; calculationMode adjusted similarly.
  - Both packages: `packageVersion: 1 → 2`. `snapshotContractVersion` kept at `'2026-04-v1'` (DTO contract version, not data version) so server-side report-submission validation continues to accept legacy in-flight submissions.

### Mobile

**Repositories — new delete methods**
- `mobile/src/data/local/repositories/assignedWorkPackageRepository.ts` — `deleteSnapshot(workPackageId)`.
- `mobile/src/data/local/repositories/userPartitionedExecutionProgressRepository.ts` — `deleteForWorkPackage(workPackageId)`.
- `mobile/src/data/local/repositories/userPartitionedExecutionCalculationRepository.ts` — `deleteForWorkPackage(workPackageId)`.
- `mobile/src/data/local/repositories/userPartitionedExecutionEvidenceRepository.ts` — `deleteForWorkPackage(workPackageId)`.

**Service layer**
- `mobile/src/features/work-packages/assignedWorkPackageCatalogService.ts` — new `deleteLocalPackage(session, workPackageId)` orchestrates the four deletes. Drafts table is intentionally preserved so approved/submitted reports remain visible as history.

**Shell**
- `mobile/src/shell/TagWiseApp.tsx`:
  - Import `EvidenceUploadApiError` so the submit handler can do an instanceof check on 401.
  - New `handleDeleteLocalPackage(workPackageId)` wired down as `onDeleteLocalPackage`.
  - `handleSubmitExecutionReport` inner catch detects 401 → calls `sessionController.restoreSession()` → if `signed_in + connected`, retries the submit with the renewed session and persists the new session into state. Otherwise emits PT-BR "Sua sessao expirou..." message.
- `mobile/src/shell/VisualProductShell.tsx`:
  - `VisualProductShellProps` declares `onDeleteLocalPackage`.
  - `DashboardScreen` and `WorkPackagePreparationPanel` thread the prop down; each downloaded package card renders an additional "Apagar pacote local" Pressable.
  - `handleOpenExecutionRoute` skips the template-required check when `nextRoute === 'history'`. Also switched the bottom `setRoute(nextRoute)` to `openRoute(nextRoute)` so the route-history stack stays correct.
  - `ServiceCalculationScreen`, `LoopExecutionScreen`, `ServiceGuidanceScreen` invocations now pass `{ executionStepIdOverride: 'calculation' | 'calculation' | 'guidance' }` to `onAttachReportPhoto`.
  - `ServiceHistoryScreen`:
    - Early-return for the unavailable case now keeps the screen if `priorReadings.length > 0`.
    - Chart rail rewritten to render bars from `priorReadingsForPoint` (deviation-proportional height, hot color when result !== 'pass').
    - Empty-chart copy updated based on whether any priorReadings exist for the tag.
    - The legacy "Linha do tempo do ponto selecionado" section (driven by `selectedPoint.rows`) renders ONLY when no `priorReadings` exist for the tag AND the execution-shell history step has data.
  - `resolveTemplateStatusBadge` updated labels: `Concluido` (pass) / `Incompleto` (fail) / `Em andamento` (saved partial / currently selected) / `Iniciar` (untouched).

## Validation

- `mobile/`: `npx tsc --noEmit` — clean.
- `mobile/`: `npx vitest run` — **192 / 192** across 32 files (no test churn; new behavior is additive or under existing assertions).
- `backend/`: `npx tsc --noEmit` — clean.
- `backend/`: `npm test` — **99 passing + 1 env-gated skip / 100**. The previous attempt that bumped `snapshotContractVersion` to `'2026-05-v1'` broke 12 existing submission tests; rolled back to `'2026-04-v1'` and only `packageVersion` bumped.

## How to fresh-start the data on the phone

After installing the new APK:

1. Sign in.
2. Dashboard → for each downloaded package, tap **"Apagar pacote local"** (the new ghost button next to "Abrir tags"). Local snapshot + execution state for that package is dropped.
3. Tap **"Atualizar snapshot"** to download the new version. The renamed AI-330 templates and any future seed changes land fresh.
4. Approved / submitted reports remain visible in the supervisor view because the backend records are untouched. On the technician side the report list shows the drafts table, which this wipe preserves.

## Known carry-overs

- **#4 "Aprovação com observação"**: still surfaces in places that render `pass-with-note` as a long-form PT-BR label. Decision pending in 8.14 (drop the third acceptance state vs. make it interactive).
- **#5 formal delete-package**: this story adds the single-package wipe button. A future story should also handle: (a) preserving approved tags as locked, (b) batch wipe of all packages, (c) confirmation dialog, (d) telemetry for the action.
- **#7 loop visualization**: my Story 8.11 visit-summary augmentation still injects a fenced block into `observationNotes` on submit. 8.14 should remove the augmentation and build a proper loop-test results display (table + per-point error visualization).
- **#9 + #10**: report screen still exposes review notes + photo capture + clickable but not-yet-actionable red flags. 8.14 will make it read-only except for the AI request button, and wire the red flags to navigate to the offending screen.
