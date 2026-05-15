# Story 8.15 — Loop test per-point persistence + Report-screen curve

Date: 2026-05-15
Predecessor: Story 8.14 (the loop-test pollution removal documented this as the explicit deferred follow-up).

## Scope

The Story 8.14 cleanup removed the auto-append of formatted loop-test text into `observationNotes`. That fixed the pollution but introduced a regression: per-point loop detail (expected / measured / error per setpoint) was no longer stored anywhere durable. The technician saw the curve live on the LoopExecutionScreen, but the data evaporated as soon as they navigated away — and the Report screen had no formatted view of the loop results.

Story 8.15 closes that gap end-to-end:

| Layer | What changed |
|---|---|
| Model | New `SharedExecutionLoopReadingPoint` shape; `SharedExecutionEvidenceState` carries `loopReadings: SharedExecutionLoopReadingPoint[]`, `loopInputMode: 'pv' \| 'ma' \| null`, `loopUpdatedAt: string \| null`. The stored evidence row's `structured_readings_json` column is extended with optional `loopReadings: StoredExecutionLoopReadingPoint[]` and `loopInputMode`. No SQLite migration — the existing TEXT column round-trips the richer JSON shape, and the new fields are optional so old rows keep loading. |
| Service | New `SharedExecutionShellService.saveLoopTestEvidence(session, shell, { points, inputMode, worstCase })`. It writes the worst-deviation point into the calculation repo (so the visit aggregator's "Resumo da visita" panel shows a meaningful single-point summary) and stamps `structuredReadings.loopReadings` on the calculation evidence row with the full curve. When the template has no deterministic calculation definition, the calculation row is skipped and only the per-point detail is persisted. |
| Visit aggregator | `InstrumentVisitTemplateEntry` mirrors `loopReadings` + `loopInputMode` so the Report screen can render the curve from the aggregate without re-loading shells. |
| LoopExecutionScreen | A `useEffect` keyed on `(templateId, loopUpdatedAt, loopReadings)` rehydrates `loopPoints` and `loopInputMode` from the persisted evidence when the technician re-enters a previously-saved loop template. |
| TagWiseApp | New `handleSaveLoopTestEvidence` handler wired as `onSaveLoopTestEvidence`. It calls the new service method, then refreshes `technicianReports`, `executionTemplateStatuses`, and `instrumentVisit` so badges + visit panel stay in sync. |
| VisualProductShell `handleSaveLoopTest` | No longer calls the old `onSaveLoopTestNote(text)` path. Builds an array of `SharedExecutionLoopReadingPoint`, computes the worst-deviation row via the new `findWorstLoopCaseRawInputs` helper, then calls `onSaveLoopTestEvidence`. |
| Report screen | The "Resumo da visita" panel now renders a "Curva do teste de loop" subsection for any visit entry whose `loopReadings.length > 0` — one row per setpoint with expected / measured / pass-fail pill. New styles `loopResultTable`, `loopResultRow`, `loopResultPercent`, `loopResultValue`. |

## Files changed

### Mobile
- `mobile/src/features/execution/model.ts` — added `StoredExecutionLoopReadingPoint`, `StoredExecutionLoopInputMode`, `SharedExecutionLoopReadingPoint` types; extended `StoredExecutionStructuredReadingsEvidence` with optional `loopReadings` + `loopInputMode`; extended `SharedExecutionEvidenceState` with `loopReadings`, `loopInputMode`, `loopUpdatedAt`.
- `mobile/src/features/execution/sharedExecutionShellService.ts` — added `saveLoopTestEvidence` method; updated `buildEvidenceState` to hydrate the new fields from the calculation evidence row; extended `InstrumentVisitTemplateEntry` and the aggregator's projection to mirror `loopReadings` + `loopInputMode`.
- `mobile/src/features/execution/sharedExecutionShellService.test.ts` — new test ("persists per-point loop test detail and surfaces it on the visit aggregate") that exercises the full round-trip + visit aggregation; 32 / 32 tests in the file (was 31).
- `mobile/src/shell/VisualProductShell.tsx`:
  - Imported `SharedExecutionLoopReadingPoint`.
  - Added `onSaveLoopTestEvidence` to `VisualProductShellProps`.
  - `handleSaveLoopTest` rewritten to call the new save path; `findWorstLoopCaseRawInputs` helper added at module scope.
  - New `useEffect` rehydrates `loopPoints` + `loopInputMode` from `executionShell.evidence.loopReadings` keyed by `(templateId, loopUpdatedAt)`.
  - Report screen's visit panel renders "Curva do teste de loop" subsection from `entry.loopReadings`. New styles `loopResultTable*`.
- `mobile/src/shell/TagWiseApp.tsx`:
  - Imported `SharedExecutionLoopReadingPoint`.
  - New `handleSaveLoopTestEvidence` handler; wired as `onSaveLoopTestEvidence` to `<VisualProductShell />`.
- `mobile/src/features/sync/evidenceUploadOrchestrator.test.ts`, `mobile/src/features/sync/syncStateService.test.ts`, `mobile/src/features/visual-shell/serviceBackedExecution.test.ts`, `mobile/src/features/visual-shell/serviceBackedReport.test.ts` — each added the `loopReadings: []`, `loopInputMode: null`, `loopUpdatedAt: null` defaults to their `SharedExecutionEvidenceState` test fixtures to satisfy the extended type.

### Backend
No backend changes — the per-template submission DTO already carries `evidence` content as part of the report payload, and the existing `structured_readings_json` shape is forward-compatible. Supervisor visibility into the loop curve flows through the existing report submission path with no schema migration.

## Validation

- `mobile/`: `npx tsc --noEmit` — clean.
- `mobile/`: `npx vitest run` — **193 / 193** across 32 files (+1 new test for `saveLoopTestEvidence` round-trip).
- `backend/`: `npx tsc --noEmit` — clean.
- `backend/`: `npm test` — **99 passing + 1 env-gated skip / 100**.

## Phone-test path for 8.13 + 8.14 + 8.15

After installing the new APK:

1. Wipe + refresh data — "Apagar pacote local" → confirmation dialog → "Apagar" → "Atualizar snapshot".
2. AI-330 templates: only `tpl-loop-current-vs-process` routes to the LoopExecutionScreen; the renamed `tpl-loop-integrity-check` ("Analog continuity check") and `tpl-loop-signal-validation` ("Analog signal validation at span") route to the single-point ServiceCalculationScreen.
3. Open a tag's loop template (PT-101 → `tpl-pressure-loop-range`). Fill in the 5 points. Tap "Salvar loop".
4. Navigate back to detail. Re-open the same loop template — **the 5 points should still be filled in** (this is the 8.15 deliverable). Edit one point and save again; the curve persists.
5. Tap "Avancar para Comparacao" → Compare screen renders prior readings panel (8.13).
6. Continue to "Checklist" → "Relatorio". The Report screen's "Resumo da visita" now shows the loop template with a "Curva do teste de loop (modo PV)" subsection listing each setpoint row + pass/fail pill (8.15).
7. Submit the report. Sign in as supervisor. The supervisor review detail shows the loop curve via the same report payload.

## Known carry-overs

- **Per-photo per-loop-point cross-screen**: the Loop screen renders per-point camera buttons (Story 8.10 #1 / 8.12 #1), but the photo `contextNote` is the screen-local `Ponto de loop X%` string. If the seed renames "Ponto de loop" wording in the future, persisted photos may not match the new caption. Acceptable today; track if a seed-wide rename ever happens.
- **Multi-template visit summaries**: the "Resumo da visita" panel now shows the loop curve for any template that has `loopReadings`. If a single tag has multiple loop templates (today none do), each one gets its own subsection — that's the intent.
- **Old drafts**: rows saved before 8.15 don't have `loopReadings` in their JSON. They keep loading with an empty `loopReadings: []` array (no error, no crash) and the Report screen simply doesn't render the curve subsection for them. Re-running the loop test populates the field on the next save.
- **Worst-case heuristic**: `findWorstLoopCaseRawInputs` picks the row with the largest absolute error. If multiple rows tie, the first one wins. The acceptance computed from the worst-case input is what surfaces in the visit aggregator's single-point summary; the per-point pills still convey the granular truth.
