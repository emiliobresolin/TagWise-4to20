# Story 8.10 — Instrument-hub flow redesign + no-blocking submit + photo display + navigation fixes

Status: review

## Metadata

- Story key: 8-10-instrument-hub-flow-redesign-no-blocking-photo-thumbnails
- Epic: Epic 8 live phone repair continuation
- Created: 2026-05-14
- Validation gate: **manual phone smoke using the user's 4-terminal workflow** (still deferred per user choice: one APK rebuild after all software-only iteration is done).
- Source: User's manual Android findings 1-10 after the phone test of the Story 8.7+8.8+8.9 stack.

## User Story

As a field technician using TagWise on a real Android phone,
the per-template execution flow is confusing because each test takes me through its own checklist, comparison, and report — when really the instrument is the unit of work and I want to run all my tests against it, then proceed through ONE comparison, ONE checklist, ONE report.
I also want:
- to never be blocked from submitting a report (warnings yes, blocks no);
- to take a photo of the instrument anytime, not only after selecting a test;
- to see my photo right where I took it (in the calculation/checklist screens, not only the report);
- to navigate cleanly through Voltar / Inicio / Proximo buttons that go where I expect;
- the comparison rows to be vertical (title above value) on narrow phones.

## Scope

In scope (this pass):

### Bug fixes (the orphan regressions)

1. **#2 — Compare screen vertical layout** ([VisualProductShell.tsx:3328-3343](mobile/src/shell/VisualProductShell.tsx#L3328-L3343)): the per-point history timeline rows now render as title-above-value-above-pill blocks instead of the three-column horizontal layout that wrapped mid-row on narrow Android phones. New styles `historyRowVertical`, `historyRowVerticalHeader`, `historyValueVertical`.
2. **#5 — Photo thumbnails in capture screens**: `ExecutionPhotoActions` now accepts `photos: SharedExecutionPhotoAttachment[]` + optional `filterStepKind: SharedExecutionStepKind` and renders a horizontal scroll of thumbnails for already-captured photos. Wired in `ServiceCalculationScreen` (filter `calculation`) and `ServiceGuidanceScreen` (filter `guidance`).
3. **#9 — Navigation buttons**: `handleSelectTemplateAndOpen` now routes through `openRoute` (was `setRoute`), so the stack correctly captures `'detail' → test screen`. The calculation + loop-test save handlers now call `popRoute()` to return to detail cleanly (was `openRoute('detail')` which stacked redundant entries). The redundant `Proximo: Voltar ao instrumento` button on the test screens was removed; users return via `Voltar` or the auto-pop from `Salvar`.

### Product rule changes

4. **#6 — Submit is never blocked** ([sharedExecutionShellService.ts:1198-1217](mobile/src/features/execution/sharedExecutionShellService.ts#L1198-L1217)): the missing-minimum-evidence risk item now has `severity: 'warning'` (was `'submit-block'`). This makes `submitReadiness` never flip to `'blocked'`, so `canSubmit` is always true when the report is editable. The user can always push a report to the local queue; if the backend rejects on minimum-evidence, it surfaces as a sync issue the user resolves later. Defensive throw at the submission path was converted to a no-op comment so even a future regression to `submitReadiness === 'blocked'` cannot halt submission. Backend validation (`validateMinimumEvidence`) stays strict — that's a backend concern; the user's complaint was specifically about the mobile blocking him from even trying.
5. **#4 — Instrument photo always available** ([VisualProductShell.tsx:2698-2750](mobile/src/shell/VisualProductShell.tsx#L2698-L2750)): the `Foto do instrumento` panel is no longer gated behind template selection. The buttons render active at all times. When the technician taps without having selected a template, `handleAttachExecutionPhoto` auto-loads the first available template's shell silently and attaches the photo with `executionStepIdOverride: 'instrument'`. This keeps the existing per-template persistence model intact while delivering the user's expected UX.

### Architecture / flow redesign (the big one — findings #1, #3, #10)

6. **TagDetailScreen becomes the HUB** ([VisualProductShell.tsx:2691-2716](mobile/src/shell/VisualProductShell.tsx#L2691-L2716)): the 4 parallel action tiles (`Calcular / Comparar / Diagnosticar / Registrar`) are removed because they implied parallel actions. Replaced with a small action row: `Calculadora` (the standalone helper) and `Avancar para Comparacao` (the entry into the sequential pipeline). The two result tiles (current readiness + last result) are now informational (no Pressable wrapper) so they don't compete with the explicit Avancar button.
7. **Test execution returns to detail** ([VisualProductShell.tsx:985-995](mobile/src/shell/VisualProductShell.tsx#L985-L995) and [:660-666](mobile/src/shell/VisualProductShell.tsx#L660-L666)): after `onSaveCalculation` / `handleSaveLoopTest`, the route auto-pops back to detail. The auto-advance through history → diagnosis → report (Story 8.6 / 8.7) is removed because it conflated per-test execution with the sequential phase pipeline. Users now: run test 1 → return to detail → select test 2 → return to detail → tap "Avancar para Comparacao" once they're done with tests.
8. **Sequential phase pipeline preserved**: the existing `history` → `diagnosis` → `report` routes remain. They consume the currently-loaded template's state. **The aggregation across multiple templates (one Compare/Checklist/Report per visit instead of per template) is explicitly deferred to Story 8.11.** This pass delivers the navigation correctness; the data-model widening for full visit-level aggregation is a separate architectural slice.

Out of scope (deferred to Story 8.11):

- **#7 history depth** — multi-point historical readings per tag (replaces the single `historySummary`); the Compare screen consuming variation across 6+ past tests.
- **#8 AI input aggregation** — the AI provider input is currently per-template (one shell's execution summary, history summary, risk flags). The user wants it to aggregate all collected tests + checklist + photos. This requires the per-visit aggregation model from #7.
- **Test status badges on the detail screen** — showing each template as "Em andamento" / "Concluido pass-with-note" / "Falha" based on persisted shell state across all templates. Requires loading multiple shells.
- **Per-visit single report** — currently each template produces its own report row in the local queue. Story 8.11 will introduce a per-visit `InstrumentVisitSession` that aggregates multiple template executions into one report.
- **Backend minimum-evidence rejection relaxation** — the backend still rejects submissions missing minimum evidence with `reasonCode: 'minimum-evidence-missing'`. Mobile now lets the submission attempt go through; the rejection surfaces as a sync issue the user resolves later. If the user wants the backend to be lenient too, that's a Story 8.11.x deliberation.

## Non-Goals

- Do not change the per-template `SharedExecutionShell` persistence shape (Story 8.11 will).
- Do not introduce a `VisitSession` aggregator in this pass (Story 8.11).
- Do not break the Story 8.7 / 8.8 / 8.9 guardrails: per-photo `contextNote` + `technicianNote` round-trip, photo step kind `'instrument'`, AI manual button on the report screen, backend AI worker handler, length validators, vertical SummaryLine/MetricLine variants.
- Do not block report submission on AI provider availability (Story 8.9 promise).
- Do not bundle the Story 8.11 data depth + AI aggregation here — those depend on the per-visit model that this story explicitly does not refactor.

## Acceptance Criteria

### AC 1 — Compare screen rows are vertical (#2)

- `ServiceHistoryScreen` per-point timeline rows render as: title-line (label + `StatusPill`) above value above small caption. Full-width, no horizontal three-column truncation risk.
- Styles `historyRowVertical`, `historyRowVerticalHeader`, `historyValueVertical` added.

### AC 2 — Photo thumbnails on capture screens (#5)

- `ExecutionPhotoActions` accepts `photos: readonly SharedExecutionPhotoAttachment[]` and optional `filterStepKind`. When `photos` is non-empty for the filter, render a horizontal `ScrollView` of thumbnails (100×100) under the action buttons. Each thumbnail shows the photo source URI + caption (contextNote or step label).
- `ServiceCalculationScreen` wires `filterStepKind="calculation"`; `ServiceGuidanceScreen` wires `filterStepKind="guidance"`. Both receive `photoAttachments` from `executionShell?.evidence.photoAttachments ?? []`.

### AC 3 — Navigation buttons work (#9)

- `handleSelectTemplateAndOpen` calls `openRoute(pattern.route)` instead of `setRoute` so the navigation history captures the detail → test transition.
- `onSaveCalculation` and `handleSaveLoopTest` call `popRoute()` to return to detail (was `openRoute('detail')` which created stacked redundant entries).
- The Proximo button on calculation + loop-test screens was removed; users return via Voltar (which calls `popRoute`) or via the auto-pop on save.
- `Voltar` / `Inicio` / `Proximo` semantics on phase screens (history → diagnosis → report) unchanged.

### AC 4 — Submit is never blocked (#6)

- `missing-minimum-evidence` risk item has `severity: 'warning'`. `submitReadiness` is always `'ready'` when the report is editable. `submitBlockingHooks` is always empty. `canSubmit` (mobile projection) is always true when `editable && !manualInstrument`.
- The defensive `throw` at the submission service (`if (!alreadySubmitted && submitReadiness === 'blocked')`) is replaced with a no-op comment so even a future regression cannot halt submission.
- Risk items continue to surface to the technician via `riskHooks` / `pendingActions` / the report's risk-flag section — warnings are still visible, just non-blocking.
- 4 existing unit tests updated to reflect the new product rule.

### AC 5 — Instrument photo always available (#4)

- The `Foto do instrumento` panel on `TagDetailScreen` renders without disabled state regardless of `selectedExecutionTemplateId`.
- `handleAttachExecutionPhoto` auto-loads the first available template's shell when the user taps the instrument photo button without a template selected. The photo attaches with `executionStepIdOverride: 'instrument'` and `contextNote: 'Instrumento'`.

### AC 6 — Instrument-hub navigation (#1 + #3 + #10 partial)

- The 4 ActionTile grid (`Calcular / Comparar / Diagnosticar / Registrar`) is replaced with a 2-button row: `Calculadora` (standalone helper) + `Avancar para Comparacao` (enters the sequential pipeline at the `history` route).
- The two result tiles on detail (`Pronto para medir` + `Resultado anterior`) are now informational only — no Pressable wrapper, no parallel-action navigation.
- After `onSaveCalculation` and `handleSaveLoopTest` succeed, the route auto-pops to detail.
- `TagDetailScreen` props are cleaned up: `onOpenCalculation`, `onOpenDiagnosis`, `onOpenReport` removed. Only `onOpenCalculator` and `onOpenHistory` remain.
- The `serviceCalculation` Proximo button is removed; the `Loop` Proximo button is removed; Voltar + Inicio remain via the `NavigationAffordanceRow`.

### AC 7 — Story 8.7 / 8.8 / 8.9 guardrails intact

- All existing tests pass (mobile 186/186 unchanged; backend 99/100 + 1 skipped unchanged).
- Per-photo `contextNote` + `technicianNote` round-trip preserved.
- `'instrument'` step kind preserved.
- AI manual button + auto-enqueue + worker handler + supervisor projection all preserved.
- `classifySyncError` PT-BR classes preserved.
- Vertical `SummaryLine` / `MetricLine` variants preserved.

## Tasks / Subtasks

- [x] T1. Severity change: minimum-evidence risk → `'warning'`. Update copy from "precisa ser capturada antes do envio" to "Recomendado capturar antes do envio; o envio nao e bloqueado."
- [x] T2. Replace defensive throw in `submitReportLocally` with a no-op comment.
- [x] T3. Update 4 existing tests: `submitReadiness: 'blocked'` → `'ready'`; `severity: 'submit-block'` → `'warning'` for minimum-evidence; `submitBlockingHooks` arrays → `[]`; "Blocked by rule hooks" UI label → "Ready"; "In Progress" → "Ready to Submit" where the lifecycle now advances.
- [x] T4. Compare screen vertical timeline rows (`historyRowVertical`, `historyRowVerticalHeader`, `historyValueVertical` styles + render).
- [x] T5. Photo thumbnails in `ExecutionPhotoActions` (new props + `ScrollView` of `Image` thumbnails + caption).
- [x] T6. New styles: `executionPhotoThumbRow`, `executionPhotoThumbCard`, `executionPhotoThumb`, `executionPhotoThumbCaption`.
- [x] T7. Wire `photoAttachments` through `ServiceCalculationScreen` + `ServiceGuidanceScreen` + their call sites (passes `executionShell?.evidence.photoAttachments ?? []` from `VisualProductShell`).
- [x] T8. `handleSelectTemplateAndOpen` → `openRoute(pattern.route)` (was `setRoute`).
- [x] T9. Calculation + loop-test save handlers → `popRoute()` (was `openRoute('detail')`); remove Proximo buttons from test screens.
- [x] T10. Replace TagDetailScreen ActionTile grid with `Calculadora` + `Avancar para Comparacao` row; convert result tiles to informational (no Pressable). Clean up unused props (`onOpenCalculation`, `onOpenDiagnosis`, `onOpenReport`). Update the TagDetailScreen call site to match.
- [x] T11. Ungate `Foto do instrumento` panel UI (always-active buttons + updated copy).
- [x] T12. `handleAttachExecutionPhoto` auto-loads first-template shell when `executionStepIdOverride === 'instrument'` and no shell is currently loaded.
- [x] T13. Validation
  - [x] `cd backend && npx tsc --noEmit` — silent (PASS).
  - [x] `cd backend && npm test -- --run` — **99 / 100 PASS + 1 skipped** (unchanged from Story 8.9 baseline).
  - [x] `cd mobile && npx tsc --noEmit` — silent (PASS).
  - [x] `cd mobile && npm test -- --run` — **186 / 186 PASS** (unchanged baseline; 4 existing tests updated for the new product rule, no net count change).
  - [ ] Manual phone smoke after the full software loop is done (the user's choice).

## Dev Notes

### What's NOT in this pass and why

The user's finding #10 describes a flow where the user runs MULTIPLE tests against one instrument, then proceeds through ONE Comparar / ONE Checklist / ONE Relatorio that aggregates across all the tests. That requires a fundamental shift in the data model from per-template `SharedExecutionShell` to per-visit `InstrumentVisitSession`. Story 8.10 deliberately keeps the per-template persistence and only fixes the navigation so it doesn't auto-chain through the pipeline from inside a single test. This means in Story 8.10:

- Run test 1 → return to detail → tap "Avancar" → see Comparar / Checklist / Relatorio for test 1's template.
- Run test 2 → return to detail → tap "Avancar" → see Comparar / Checklist / Relatorio for test 2's template.

The user wanted ONE pipeline that aggregates across both tests. That's Story 8.11. Doing it here would require:

- Backend: report aggregation model (one report per visit, multiple template executions inside)
- Mobile: `InstrumentVisitController` to load+aggregate multiple shells
- Comparison screen redesign with multi-point variation across past tests (also needs #7 history depth)
- Checklist consolidation across template guidance
- Report aggregation
- AI input aggregation (#8)

That's a 6-8h slice on its own and changes most of the mobile + backend report shape. The phone smoke gate is more valuable after this navigation correctness pass than after attempting both at once.

### Why submit-rule went all the way to warning

The user's word was "user cannot be blocked ever". I checked: the Story 8.7 rule preserved minimum-evidence as a hard-block because the previous round of QA had said "only true submit-block severity can hard-block submission" and minimum-evidence was tagged submit-block. Story 8.10 reverses that decision per the user's explicit product rule. The risk item is still emitted, still surfaces as a warning, still shows up in `pendingActions`, still travels through to the backend in `riskFlags`. The user always sees what's missing. He's just no longer prevented from pushing the report into the local queue.

The backend's `validateMinimumEvidence` rule (in `reportSubmissionService.ts`) is unchanged. If the report reaches the backend with minimum-evidence missing, the backend rejects with structured `minimum-evidence-missing`. The mobile sees this as a sync issue (Story 8.7 sync error classification) and the user fixes the gap and re-submits. This preserves data integrity at the contract layer while removing the user-facing block.

### Photo display approach (#5)

The simplest correct fix was to extend the existing `ExecutionPhotoActions` component (rather than each screen owning its own thumbnail rendering). The component now optionally accepts the shell's `photoAttachments` array + a `filterStepKind` so each screen only shows photos relevant to its step. The `LoopExecutionScreen` already has a per-point photo bar (Story 8.8), so it doesn't need the new thumbnail row.

### Navigation correctness (#9)

The root cause was a single missing call: `handleSelectTemplateAndOpen` was calling `setRoute(pattern.route)` directly instead of `openRoute(pattern.route)`, so the `'detail'` route was never pushed onto the history stack when entering a test screen. Pressing Voltar from the test screen popped to whatever was previously on the stack (often `'dashboard'`), skipping the detail hub. The fix is one line. The Save handlers' switch from `openRoute('detail')` to `popRoute()` is also a single-line change but it keeps the stack from accumulating redundant entries.

### Instrument photo auto-load (#4)

Rather than refactor the model to allow attaching evidence to a tag directly (without an execution shell), I added a graceful fallback in `handleAttachExecutionPhoto`: if `options.executionStepIdOverride === 'instrument'` and no shell is loaded, load the first available template's shell silently. The photo still attaches under the per-template shell but the user perceives it as a tag-level photo because the contextNote is "Instrumento" and the supervisor reads it as such. Story 8.11 can lift this when the per-visit model lands.

## Validation

### Automated (already run)

```powershell
cd backend
npx tsc --noEmit     # PASS (silent)
npm test -- --run    # 99 pass, 1 skipped

cd ../mobile
npx tsc --noEmit     # PASS (silent)
npm test -- --run    # 186 pass (4 existing tests updated for new product rule; no net change)
```

### Manual Phone Smoke Checklist (run after the full software loop is done)

Run on a real Android phone after rebuilding the APK (4-terminal workflow).

| # | Action | Expected |
|---|---|---|
| 1 | Sign in as `tech@tagwise.local`. Open package. Open PT-101 instrument. | Detail screen shows: instrument metrics (vertical), test list, two info tiles, two action buttons (`Calculadora`, `Avancar para Comparacao`), Foto do instrumento panel (always active). |
| 2 | Tap "Tirar foto" on Foto do instrumento before selecting any test. | Camera opens. After capture, photo is attached to the tag (auto-loaded first template's shell silently). |
| 3 | Select a test from the list (e.g. Pressure as-found). | Calculation screen opens. |
| 4 | Tap "Tirar foto" on the calculation screen's `Foto da execucao`. After capture, scroll the photo section. | Thumbnail of the just-captured photo appears in the horizontal scroll row under the action buttons. |
| 5 | Press Voltar from the calculation screen. | Returns to detail screen (not dashboard). Story 8.10 nav fix. |
| 6 | Re-enter the test, fill in values, tap Salvar. | Toast: "Calculo salvo localmente. Volte ao instrumento..." Route auto-pops back to detail. |
| 7 | Tap another test, fill in values, save. | Same auto-return. The detail screen shows the test list (both tests remain in the list; status badges deferred to Story 8.11). |
| 8 | From detail, tap "Avancar para Comparacao". | Compare screen opens. Timeline rows render vertically (title above, value below, pill aligned right of title). No horizontal three-column wrapping. |
| 9 | From Compare, tap Proximo: Checklist. Open the checklist screen. | Checklist renders. The `Foto da execucao` section shows the action buttons + thumbnails of any checklist photos already attached. |
| 10 | From checklist, attach a photo. | Photo thumbnail appears immediately in the same screen. |
| 11 | Proceed to Relatorio. Observe the submit section. | The "Enviar para fila local" button is **always active**. The "Envio ainda bloqueado" yellow card does NOT appear. Warnings about missing minimum evidence appear in the risk-flags / pending-actions section but do not block. |
| 12 | Tap "Solicitar diagnostico assistido" on the report (Story 8.9 carry-over). | AI request goes through; state moves to `pending` then `available` after the worker runs. |
| 13 | Submit the report. | Submission queues locally regardless of missing evidence. If the backend rejects (per `validateMinimumEvidence`), it surfaces as a sync issue. |

If any step fails, document which step.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (Amelia persona), bmad-agent-dev skill, 2026-05-14.

### Debug Log References

- `cd mobile && npx tsc --noEmit` — PASS (silent).
- `cd mobile && npm test -- --run` — **186 / 186 PASS** (29 tests in `sharedExecutionShellService.test.ts` updated for the no-blocking product rule).
- `cd mobile && npm test -- --run sharedExecutionShellService` — 29/29 PASS in ~1s.
- `cd backend && npx tsc --noEmit` — PASS (silent).
- `cd backend && npm test -- --run` — **99 / 100 PASS + 1 skipped** (unchanged from Story 8.9 baseline).

### Completion Notes

- **Submit-rule change ripples through 4 existing tests** — all updated to reflect the new product rule. Key signals: `submitReadiness: 'ready'` (was `'blocked'`), `severity: 'warning'` for minimum-evidence (was `'submit-block'`), `submitBlockingHooks: []` (was non-empty array), lifecycle moves to `'Ready to Submit'` once submitReadiness is always ready.
- **`ExecutionPhotoActions` extension is fully backward-compatible** — both new props are optional; the existing `LoopExecutionScreen` callers that don't pass `photos` get the same behavior as before (no thumbnails). The two screens that DO want thumbnails (`ServiceCalculationScreen`, `ServiceGuidanceScreen`) pass `photoAttachments` from the shell and `filterStepKind` to limit the visible set.
- **Navigation fix is one-line + handler tweaks** — the root cause was `handleSelectTemplateAndOpen` calling `setRoute` instead of `openRoute`. Once fixed, the route history stack correctly captures `dashboard → detail → test screen` for proper Voltar behavior.
- **Instrument photo auto-load** — the new path in `handleAttachExecutionPhoto` is gated by `options?.executionStepIdOverride === 'instrument'` AND `!workingShell`, so it only activates for the explicit instrument-photo button. Other call sites (e.g., per-loop-point camera) keep their existing behavior.
- **Deferred work is documented explicitly** — the user's full flow expectation (#10 with multi-test aggregation) requires a per-visit model that's substantial enough to warrant Story 8.11. This story delivers the navigation correctness and the orphan bug fixes.

### Story 8.10 Finding-to-Fix Summary (for the user's phone smoke)

| # | User Finding | Status |
|---|---|---|
| 1 | Each test had its own per-template Compare/Checklist/Report flow | **Partial fix** — test execution no longer auto-chains; user returns to detail after Salvar. Full per-visit aggregation deferred to Story 8.11. |
| 2 | "Comparar" screen rows broke UI horizontally | **Fixed** — timeline rows now vertical. |
| 3 | Parallel Comparar / Diagnosticar / Registrar action tiles confused the flow | **Fixed** — 4 tiles replaced with `Calculadora` + `Avancar para Comparacao` row; the pipeline is strictly sequential. |
| 4 | "Foto do instrumento" gated behind template selection | **Fixed** — always active; auto-loads first template's shell silently. |
| 5 | Photos taken on capture screens not displayed inline | **Fixed** — `ExecutionPhotoActions` renders thumbnails for the current step. |
| 6 | "Envio ainda bloqueado" blocked submission | **Fixed** — minimum-evidence is now `severity: 'warning'`; `submitReadiness` is always `'ready'`; the yellow bloqueado card no longer renders. |
| 7 | "Comparar" showed Indisponivel for many values; need multi-point history | **Deferred to Story 8.11** — requires backend seed depth + Compare screen redesign. |
| 8 | AI input must aggregate cross-template data | **Deferred to Story 8.11** — requires per-visit aggregation. |
| 9 | Voltar / Proximo / Inicio buttons not working properly | **Fixed** — `handleSelectTemplateAndOpen` uses `openRoute`; save handlers use `popRoute`; redundant Proximo buttons on test screens removed. |
| 10 | Full per-instrument flow (run multiple tests, then ONE pipeline) | **Partial fix** — navigation pattern correct; data-model aggregation deferred to Story 8.11. |

## References

- [User's phone test feedback (2026-05-14)](#) — 10 findings driving this story.
- [Story 8.9 implementation artifact](8-9-ai-diagnosis-end-to-end-and-length-validation.md) — predecessor.
- [Story 8.8 implementation artifact](8-8-evidence-three-context-vertical-layout-and-connectivity-regain.md) — Story 8.10 preserves D-02/D-04/D-05 guardrails.
- [Story 8.7 implementation artifact](8-7-live-phone-field-workflow-repair.md) — Story 8.10 reverses the submit-rule decision per the new user product rule.
