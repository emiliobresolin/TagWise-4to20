# Story 8.12 — Photo thumbnails, returned-report lifecycle, calculator sweep, AI failure reason, floating toast

Date: 2026-05-15
Predecessor QA: `_bmad-output/planning-artifacts/qa-defect-discovery-2026-05-15-pass-5.md`
Successor of Story 8.11 (per-visit aggregator + multi-point history + test status badges).

## Scope

Six user-reported findings + two cross-cutting fixes from the QA Pass 5 report, all landed in one software-only iteration:

| # | Finding | What changed |
|---|---|---|
| 1 | Photos not displayed on the screens where they were captured | `TagDetailScreen` instrument panel and `LoopExecutionScreen` per-loop-point row now render the captured photos via a new shared `PhotoThumbnailRow` component |
| 2 | Returned report stays editable as "in progress" | Additive `invalidated: boolean` + `invalidationReason: string \| null` flags on the draft state (Variant A from the QA report). The supervisor's "Devolver" comment is captured from the approval history and surfaced as an explicit "Relatorio invalidado pelo supervisor" banner on the Report screen. Editability predicates and `canSubmit` now honor the flag |
| 3 | Calculator missing "0 to 100%" loop sweep | New `Tabela 0-100%` mode in the standalone Calculadora that renders a 5-row reference table (0%/25%/50%/75%/100% with the corresponding 4-20 mA value and PV from the configured range) |
| 4 | Loop test template missing for ranged instruments | Added `tpl-temperature-loop-range` to TT-205 and `tpl-level-loop-range` to LT-410. XV-402 deliberately skipped (digital position feedback, not a 4-20 mA loop) |
| 5 | AI failure reason not surfaced | `failureReason` now threads through the projection from backend → mobile projection input → `VisualAiDiagnosisProjection` → Report screen / Supervisor review card. The `failed-nonblocking` branch of `buildVisualAiDiagnosisProjection` prefers the provider's actual error string over the generic message |
| 6 | Toast / banner scrolled out of view | New `MessageToast` overlay component absolutely positioned at the bottom of the `SafeAreaView`, auto-clears after 5s, manual dismiss button. Existing inline messages are preserved for backwards compatibility |
| N-3 | "Sync error" toast appeared even when the report actually arrived at the supervisor | `syncSubmittedReportEvidence` no longer rethrows per-photo upload failures. Per-photo failures are already recorded on the photo's own `syncIssue` field; the global error toast is now reserved for cases where the report submission itself failed |
| N-5 | Story 8.9 artifact referenced env vars `TAGWISE_AI_OPENAI_API_KEY` / `TAGWISE_AI_OPENAI_MODEL` that the loader does not read | Doc corrected to the actual names `OPENAI_API_KEY` / `OPENAI_MODEL` (per `backend/src/config/env.ts:116-117`). If the user had copied the artifact env names, the provider would have silently fallen back to mock |

## Files changed

### Backend
- `backend/src/modules/work-packages/seedData.ts` — added `tpl-temperature-loop-range` and `tpl-level-loop-range` template definitions; extended TT-205 and LT-410 `templateIds` arrays.
- `_bmad-output/implementation-artifacts/8-9-ai-diagnosis-end-to-end-and-length-validation.md` — corrected the env-var names to `OPENAI_API_KEY` / `OPENAI_MODEL`.

### Mobile
- `mobile/src/features/execution/model.ts` — added `invalidated?: boolean` and `invalidationReason?: string | null` to `SharedExecutionReportDraftState`.
- `mobile/src/features/execution/sharedExecutionShellService.ts` — `StoredPerTagReportDraftPayload` now persists the invalidated flag. `buildExecutionShell` populates `shell.report.invalidated/invalidationReason` from the stored payload. `buildStoredPerTagReportDraftPayload` writes them back. `parseStoredPerTagReportDraftPayload` round-trips them.
- `mobile/src/features/sync/evidenceUploadOrchestrator.ts`:
  - N-3 fix: `syncSubmittedReportEvidence` no longer rethrows per-photo failures after the report itself submitted successfully (logs a warning instead). Per-photo errors stay on each photo's `syncIssue` for independent retry.
  - `StoredReportSubmissionDraftPayload` carries `invalidated` and `invalidationReason`.
  - `refreshReportServerStatus` detects `'returned-by-supervisor'` / `'returned-by-manager'` and stamps the invalidated flag + reason (sourced from the last `actionType: 'returned'` approval-history item's comment via the new `resolveInvalidationReason` helper).
  - `updateReportDraftRecord` accepts optional `invalidated` and `invalidationReason` inputs.
  - `parseReportSubmissionDraftPayload` reads the new fields.
- `mobile/src/features/sync/evidenceUploadOrchestrator.test.ts` — updated 4 round-trip tests to expect the orchestrator call to resolve cleanly (instead of rejecting) on per-photo failure. Each test still asserts the photo's `syncIssue` records the underlying error so the user can retry.
- `mobile/src/features/visual-shell/serviceBackedExecution.ts` — `isTechnicianEditableReport` now consumes the full `shell.report` (not just the state) and returns `false` when `invalidated` is set.
- `mobile/src/features/visual-shell/serviceBackedReport.ts` — `VisualAiDiagnosisProjectionInput` and `VisualAiDiagnosisProjection` declare `failureReason`. `buildVisualAiDiagnosisProjection`'s `failed-nonblocking` branch prefers `input.failureReason` for the visible `detail`. `VisualReportProjection` exposes `invalidated` and `invalidationReason`; the projection's `editable` and `canSubmit` are both `false` when `invalidated` is true, and `editLockReason` is rewritten with the PT-BR invalidated copy plus the supervisor's return comment.
- `mobile/src/features/visual-shell/serviceBackedReport.test.ts` — added 1 test for the supervisor-returned / invalidated branch and 1 test for the AI `failureReason` branch.
- `mobile/src/shell/TagWiseApp.tsx` — `mapAiDiagnosisProjection` forwards `failureReason`. `isTechnicianEditableReportState` updated to consume the full report object; all 12 call sites updated to pass `.report` instead of `.report.state`.
- `mobile/src/shell/VisualProductShell.tsx`:
  - New `PhotoThumbnailRow` shared component (filters by `executionStepId` or `contextNote`; reuses the `executionPhotoThumb*` styles).
  - `TagDetailScreen` accepts `photoAttachments` and renders `PhotoThumbnailRow` with `filterStepKind="instrument"` below the "Foto do instrumento" panel.
  - `LoopExecutionScreen` accepts `photoAttachments` and renders `PhotoThumbnailRow` per loop point filtered by `contextNote === "Ponto de loop ${pct}%"`.
  - New `CalculatorSweepPanel` component renders the 0/25/50/75/100% × mA × PV reference table. New chip "Modo: Tabela 0-100%" alongside the existing Conversao / Loop chips; the panel re-uses the conversion-mode `processMin` / `processMax` / `unit` inputs.
  - `ServiceReportScreen` accepts the new `report.invalidated` / `report.invalidationReason` and renders an explicit red banner "Relatorio invalidado pelo supervisor" with the supervisor's return comment.
  - New `MessageToast` component absolutely positioned at the bottom of the `SafeAreaView`. Auto-clears after 5s; manual dismiss button. Wired to `shellMessage`.
  - New styles: `priorReadingCard*` (8.11), `sweepRow/sweepPercent/sweepValue` (8.12 #3), `invalidatedBanner*` (8.12 #2), `toastOverlay/toastCard/toastMessage/toastDismiss*` (8.12 #6).

## Validation

- `mobile/`: `npx tsc --noEmit` — clean.
- `mobile/`: `npx vitest run` — **192 / 192** across 32 files (+2 new tests: invalidated branch in `serviceBackedReport.test.ts`, AI failure-reason branch in `serviceBackedReport.test.ts`; 4 existing orchestrator tests updated for N-3).
- `backend/`: `npx tsc --noEmit` — clean.
- `backend/`: `npm test` — **99 passing + 1 env-gated skip / 100**.

## What the next phone test should reveal

1. **#1 photos**: Take a photo from the instrument detail screen (`Tirar foto` under "Foto do instrumento") — a thumbnail should appear immediately under the button row, with caption "Instrumento". Open a loop test (PT-101 → `tpl-pressure-loop-range`), take a photo from the 50% point — a 100×100 thumbnail with caption "Ponto 50%" should appear under that specific point's buttons.
2. **#2 returned report**: As technician, run a test on a tag and submit. Sign in as supervisor and "Devolver" the report with a comment ("Loop test fora da tolerancia"). Sign back in as technician. Opening that tag's report screen should now show a red banner "Relatorio invalidado pelo supervisor" with the supervisor's comment, and the technician should not be able to edit or re-submit (button states are disabled). Note: at this point the technician must start a new visit manually (the auto-fresh-draft affordance is a follow-up).
3. **#3 calculator sweep**: Open the standalone Calculadora. Tap "Modo: Tabela 0-100%". With PV min/max filled (e.g. 0 / 10 bar), a 5-row table should appear: 0% → 4.00 mA / 0 bar; 25% → 8.00 mA / 2.5 bar; ... ; 100% → 20.00 mA / 10 bar.
4. **#4 loop templates**: Open TT-205. The "Escolher teste" list should now include 4 templates ending in "Temperature loop verification". Open LT-410: similar for "Level loop verification". PT-101 keeps its existing `tpl-pressure-loop-range`.
5. **#5 AI failure reason**: With `TAGWISE_AI_ENABLED=true`, `TAGWISE_AI_PROVIDER=openai`, `OPENAI_API_KEY=invalid`, restart backend + worker, submit a report. After the AI job runs and fails, the AI card on the technician report screen should show the actual provider error string (e.g. "OpenAI diagnosis request failed with status 401.") instead of the generic "Nao foi possivel gerar...". Same on the supervisor review detail. If you previously copied env vars from the Story 8.9 artifact, replace `TAGWISE_AI_OPENAI_API_KEY` with `OPENAI_API_KEY` and `TAGWISE_AI_OPENAI_MODEL` with `OPENAI_MODEL`.
6. **#6 toast**: Save a calculation while scrolled to the bottom of the calculation screen. The confirmation message "Calculo salvo localmente..." should appear as a floating card at the bottom of the screen (with a × dismiss button), visible regardless of scroll position. Auto-disappears after 5s.
7. **N-3 sub-fix**: Submit a report while you have a photo that fails to sync (e.g. intentional bad MinIO config). The supervisor should still receive the report; the technician should NOT see a "Sync error" toast for the report itself, only the failing photo's own card shows the sync-issue badge for retry.

## Known carry-overs / scope discipline

- **Start-new-visit affordance for invalidated reports**: this story locks the returned report as read-only with a clear banner, but does NOT auto-mint a fresh draft on next tag open. The technician currently sees the invalidated draft on the Report screen and would need a follow-up button "Iniciar nova visita" to archive the old draft and start fresh. Bundle that into Story 8.13 if the user needs the full flow before next phone test.
- **Dashboard grouping for invalidated reports**: the technician reports list still shows the invalidated row inline with active drafts. A future story could group them into a "Visitas devolvidas (historico)" section.
- **Toast for `authMessage`**: the floating toast currently surfaces only `shellMessage`. `authMessage` (passed in from `TagWiseApp`) still renders inline in some screens. If you want both surfaced via toast, expose a `notify(message)` callback from the shell to the parent so all transient messages flow through the same overlay.
- **Loop sweep mode in the in-instrument calculator**: only the standalone Calculadora got the new "Tabela 0-100%" mode. The "Conversao" panel embedded inside the test execution screens (line 2952-2958 of `VisualProductShell.tsx`) still has 5 quick-conversion buttons without the sweep table. If you need the table there too, the `CalculatorSweepPanel` component is reusable; a wrapper can render it inline below the 5 buttons.

## Suggested validation order

1. Backend live: `npm run dev` in `backend/`, verify the work-package endpoint returns the new templates (`tpl-temperature-loop-range`, `tpl-level-loop-range`).
2. Mobile: rebuild the APK once and run through the 7 phone checks above.
3. If all pass, mark Story 8.12 done. If invalidated-report-flow needs the auto-fresh-draft affordance, queue Story 8.13.
