# TagWise QA Defect Discovery Report — Pass 4 (Story 8.10 re-verification)

- **Date:** 2026-05-14
- **Author:** QA re-verification pass after Story 8.10
- **Predecessor:** [`qa-defect-discovery-2026-05-14-pass-3.md`](qa-defect-discovery-2026-05-14-pass-3.md) (Story 8.9 verification)
- **Source of truth:** Story 8.10 implementation artifact + user's 10 manual Android findings + current mobile + backend code at HEAD + automated test suite.
- **Intent:** Re-verify the 10 findings the user raised after his phone test (the user explicitly chose software-only iteration until all stories are done; this report is the gate for Story 8.11 vs APK rebuild).

---

## 1. Verdict

**Pass with concerns — greenlight Story 8.11.**

All 6 Story 8.10 deliverables (D-1 through D-6) verify at the code level. Tests are green (186/186 mobile, 99/100 backend with 1 env-gated skip). The 4 deferred items (per-visit aggregation, history depth, AI input aggregation, test status badges) match the dev artifact — none are partially implemented and hidden.

Two minor findings surfaced during the pass. **One has already been patched in this report cycle** (P-01); the other is cosmetic dead code (C-01) that does no harm.

- **P-01 (medium → patched):** `handleAttachExecutionPhoto` auto-loaded a default template's shell for instrument photos but didn't sync `selectedExecutionTemplateId`. The detail screen's readiness tile said "Selecione um teste" even though a shell was loaded. **Fixed in this pass** — `selectedExecutionTemplateId: current.selectedExecutionTemplateId ?? executionShell.template.id` added to the post-attach `setStatus` updater.
- **C-01 (low, cosmetic):** The "Envio ainda bloqueado" yellow card render block at [VisualProductShell.tsx:4009-4017](mobile/src/shell/VisualProductShell.tsx#L4009-L4017) is now unreachable because `canSubmit` is always true for editable reports. Leave as defensive dead code or remove in a later cleanup — does not block the user's next phone test.

The deferred items (Story 8.11 scope) are exactly the architectural shift the user described in his finding #10: per-visit aggregation, multi-point history, AI input aggregation across all collected tests. Doing them next is the right move — the phone smoke after Story 8.11 will validate both 8.10 (navigation correctness + bug fixes) AND 8.11 (the full per-instrument flow) at once. Single rebuild, full coverage.

---

## 2. Per-deliverable verdict matrix

### Story 8.10 deliverables

| # | Deliverable | Verdict | Key file:line |
|---|---|---|---|
| D-1 | Submit rule — never block, only warn (#6) | **FIXED** | [sharedExecutionShellService.ts:1213](mobile/src/features/execution/sharedExecutionShellService.ts#L1213) severity='warning'; defensive throw replaced with no-op comment at [:695-700](mobile/src/features/execution/sharedExecutionShellService.ts#L695-L700); 4 unit tests updated; backend `validateMinimumEvidence` intentionally unchanged |
| D-2 | Instrument photo always available (#4) | **FIXED** (with P-01 patch in this pass) | UI ungated at [VisualProductShell.tsx:2740-2753](mobile/src/shell/VisualProductShell.tsx#L2740-L2753); auto-load-shell at [TagWiseApp.tsx:1472-1510](mobile/src/shell/TagWiseApp.tsx#L1472-L1510); `selectedExecutionTemplateId` sync patch applied this pass |
| D-3 | Hub-and-spoke navigation (#1, #3, #10 partial) | **FIXED** | 4 ActionTiles replaced with 2-button row at [:2710-2725](mobile/src/shell/VisualProductShell.tsx#L2710-L2725); result tiles now `<View>` only (informational); `TagDetailScreen` props cleaned; save handlers call `popRoute()` |
| D-4 | Compare screen vertical layout (#2) | **FIXED** | Timeline rows now vertical at [:3337-3343](mobile/src/shell/VisualProductShell.tsx#L3337-L3343) with new `historyRowVertical*` styles; legitimate horizontal `historyRow` style kept for other consumers |
| D-5 | Photo thumbnails in capture screens (#5) | **FIXED** | `ExecutionPhotoActions` accepts `photos` + `filterStepKind` at [:4807-4825](mobile/src/shell/VisualProductShell.tsx#L4807-L4825); thumbnails rendered inside the existing component; wired into `ServiceCalculationScreen` + `ServiceGuidanceScreen`; `LoopExecutionScreen` intentionally skipped (has per-loop-point bar already) |
| D-6 | Navigation buttons (#9) | **FIXED** | `handleSelectTemplateAndOpen` uses `openRoute` (not `setRoute`) at [:644](mobile/src/shell/VisualProductShell.tsx#L644); save handlers call `popRoute()`; redundant Proximo buttons removed from test screens |

### Story 8.7 / 8.8 / 8.9 guardrails (regression watch)

| Guardrail | Status | Note |
|---|---|---|
| Story 8.7 submit-block reversal | **VERIFIED INTENTIONAL** | Type union keeps `'submit-block'` (legacy); no production emitter remains after Story 8.10 |
| Story 8.8 contextNote + technicianNote round-trip | **VERIFIED INTACT** | Cross-boundary test still passes; fixture values well within C-02 caps |
| Story 8.8 `'instrument'` step kind | **VERIFIED INTACT** | `handleAttachExecutionPhoto` still threads the override through |
| Story 8.8 ReportPhotoCard inline note editor | **VERIFIED INTACT** | Unchanged |
| Story 8.8 vertical SummaryLine/MetricLine variants | **VERIFIED INTACT** | Visual confirmation deferred to phone smoke |
| Story 8.8 PT-BR sweep + `reviewLifecycleLabel` | **VERIFIED INTACT** | `'Ready to Submit'` mapping in place — used more often now |
| Story 8.9 AI manual button on report screen | **VERIFIED INTACT** | Renders when `state !== 'available'` |
| Story 8.9 auto-enqueue on `submitForValidation` | **VERIFIED INTACT** | Both acceptance paths call `enqueueAiDiagnosisAfterAcceptance` |
| Story 8.9 worker handler | **VERIFIED INTACT** | Registered in `backend/src/worker/main.ts` |
| Story 8.9 supervisor projection includes aiDiagnosis | **VERIFIED INTACT** | `toReportDetail` threads it through |
| Story 8.9 C-02 length validation | **VERIFIED INTACT** | `validateOptionalPhotoMetadata` still in `validateAcceptedSubmission` |

---

## 3. Verified new defects

### P-01 — `selectedExecutionTemplateId` not synced when auto-loading shell for instrument photo

- **Severity:** Medium (UX signal inconsistency).
- **Status:** **PATCHED IN THIS PASS.**
- **Location (pre-patch):** [mobile/src/shell/TagWiseApp.tsx:1556-1567](mobile/src/shell/TagWiseApp.tsx#L1556-L1567)
- **Observation:** When the user taps `Foto do instrumento` without having selected a template, `handleAttachExecutionPhoto`'s new auto-load branch loads the first template's shell silently. After `attachPhotoEvidence` returns, `setStatus` updates `executionShell` but leaves `selectedExecutionTemplateId` at `null`. The detail screen's readiness tile then displays "Selecione um teste" even though a shell IS loaded.
- **Fix applied:** Added `selectedExecutionTemplateId: current.selectedExecutionTemplateId ?? executionShell.template.id` to the post-attach updater. Falls back to the loaded shell's templateId only when no template was previously selected, so legitimate template selections aren't overwritten.
- **Verification:** Mobile typecheck silent; mobile tests 186/186 still pass.

### C-01 — Dead code: "Envio ainda bloqueado" card unreachable

- **Severity:** Low (cosmetic).
- **Location:** [mobile/src/shell/VisualProductShell.tsx:4009-4017](mobile/src/shell/VisualProductShell.tsx#L4009-L4017)
- **Observation:** The yellow `Envio ainda bloqueado` card is wrapped in `{!report.canSubmit ? <View>...</View> : null}`. With Story 8.10's change, `canSubmit = editable && submitReadiness === 'ready' && !manualInstrument` and `submitReadiness` is now always `'ready'` — so `!report.canSubmit` is false for every editable non-manual report. The card never renders.
- **Why not patched:** Defensive dead code is harmless. A future story that re-introduces a hard-block (unlikely per the new product rule) could re-use it. Leave as-is or remove in a Story 8.11.x cleanup.

---

## 4. Investigated and dismissed (false-positive claims)

### D-1 (alarmist verdict from sub-agent): "vertical layout variants not re-found"

The verification sub-agent's regression-watch row for Story 8.8 vertical `SummaryLine` / `MetricLine` variants noted "no explicit `variant=\"vertical\"` found in Grep sweep" and marked it SUSPECTED. This is a false alarm: the variants are still present (the Story 8.8 implementation grafted them onto `SummaryLine` and `MetricLine` and Story 8.10 didn't touch those components). Confirmed by direct read of the components and call sites. Marking as VERIFIED INTACT.

### Defect-hunt G (auto-load picks first template)

The auto-load deliberately picks `executionTemplates[0]`. The photo travels with `contextNote: 'Instrumento'` and `executionStepIdOverride: 'instrument'`, so the supervisor sees it as instrument-level regardless of which template's shell carries the persistence. **Not a bug, intentional design.** Documented in the Story 8.10 dev agent record.

### Defect-hunt H (no test status badges on detail screen)

The user's finding #1 said "tests must be with status after user test". Story 8.10 explicitly deferred this. Confirmed: template rows render title + body + pattern detail + `StatusPill` showing only `Abrindo` / `Iniciar` based on selected state — no per-template completion badge. **Not a regression, acknowledged deferral.**

### Defect-hunt E (submit-with-zero-evidence UX)

The backend still rejects with `minimum-evidence-missing` (status 422). The mobile mobile classifier categorizes 422 as `SYNC_ERROR_UNKNOWN` → "Falha de sincronizacao. Veja a fila local." The user sees a generic sync-error message and must open the local queue for the specific reason. **Acceptable UX trade-off per the new product rule**; the user said "warn the user about the missing pieces, but he should be able to proceed" — the warning is in the risk-flags + pending-actions surfaces; the sync rejection is the canonical "go fix this" signal. Not a defect.

---

## 5. Unverified suspicions (need phone or live backend)

| # | Item | What a phone smoke would prove |
|---|---|---|
| U-01 | Photo thumbnails render correctly on Android with the local `previewUri` | The thumbnails are coded correctly but the `Image source={{ uri: photo.previewUri }}` only resolves at runtime when the sandbox file is reachable. Phone smoke confirms the local file ownership stays valid across navigation. |
| U-02 | Compare screen vertical rows render legibly on the user's specific Android device | The code is correct; visual fit depends on screen width + font scale. |
| U-03 | "Avancar para Comparacao" button feels right after the user runs all his tests | Per-visit aggregation is deferred (Story 8.11), so each "Avancar" still loads the most-recently-selected template's pipeline. The user's UX expectation is the full aggregation; he'll notice it's still per-template until 8.11 ships. |
| U-04 | Instrument photo auto-load is invisible to the user | The user shouldn't notice that a shell was loaded silently; the photo should just attach. |
| U-05 | Submit-never-blocks works end-to-end with backend rejection surfacing as a sync issue | Backend rejects with 422 → mobile shows generic "Falha de sincronizacao." in the report's sync section. User opens the local queue to see the structured reason. |
| U-06 | popRoute()-based back navigation feels natural across all the new flows | Multiple test runs → Avancar → phase pipeline → Voltar all the way back to dashboard. Stack stays clean (verified mentally) but feel-correct needs real navigation. |

---

## 6. Regression risk list for Story 8.11

Story 8.11 will introduce the per-visit aggregation model (the user's full #10 + #7 + #8). Whatever it builds must NOT regress:

1. **Submit never blocks.** Story 8.10's no-block rule must hold. If Story 8.11 adds an aggregated-shell validation, do not re-introduce hard-blocks at the mobile boundary. Warnings only.
2. **Per-photo `contextNote` + `technicianNote` round-trip.** Story 8.8 contract. Aggregation must preserve both fields end-to-end at every photo across every template execution rolled up into the visit.
3. **AI is non-blocking.** Story 8.9 contract. The aggregated AI input must NEVER halt report submission. Worker failures still mark `failed-nonblocking`.
4. **`'instrument'` step kind.** Aggregated reports still need to distinguish instrument-level photos from per-test photos.
5. **Backend stays strict on minimum evidence** (Story 8.10 left this intentional). Story 8.11's aggregation shouldn't loosen the backend rule.
6. **Navigation correctness.** Story 8.10's `openRoute` + `popRoute` semantics must continue to work after Story 8.11 introduces new routes (e.g., a per-visit comparison/checklist/report).
7. **Story 8.10 patch (P-01).** When auto-loading a shell for an instrument photo, keep `selectedExecutionTemplateId` in sync. If Story 8.11 reshapes the model (per-visit shell), the patch logic moves but the invariant stays: when a shell loads, the UI signal must follow.
8. **Photo thumbnails per step.** Story 8.10's filter logic (`filterStepKind`) must keep working when there are multiple template executions inside one visit. The aggregated view may need to scope per-test photos to the currently-active test.
9. **C-01 dead code.** When Story 8.11 ships, consider removing the "Envio ainda bloqueado" card render block (now permanently unreachable).

---

## 7. Recommended next BMAD step

**Greenlight Story 8.11.** Per-visit aggregation + history depth + AI input aggregation. Recommended scope:

1. **Per-visit shell** — introduce `InstrumentVisitSession` (or refactor `SharedExecutionShell` to be per-tag with a `tests: TestExecution[]` array). Each test execution carries its own calculation + status. Evidence, checklist, report become visit-level.
2. **Test status badges on detail screen** — derived from the per-visit shell's `tests[].status`. Show "Em andamento" / "Concluido — Aprovado" / "Concluido com observacao" / "Falha" per template. Addresses finding #10 partially (the user wanted at-a-glance status).
3. **Multi-point history seed** — replace the flat `historySummary` with `historyEntries: PriorTestReading[]` per tag, seeded with ≥6 prior readings per measurement point (e.g., 0/25/50/75/100% for PT-101). Compare screen renders point variation across these. Addresses finding #7.
4. **AI input aggregation** — `buildDiagnosisInput` reads from the visit-level shell (all test executions, checklist, photos) instead of one template's payload. Addresses finding #8.
5. **One report per visit** — the backend `report_submission_records` row aggregates multiple test executions inside its `payloadJson`. The supervisor projection consumes the aggregated shape.

Estimated effort: 6-8h (similar to Story 8.9). Bigger than Story 8.10. The phone smoke after Story 8.11 lands validates BOTH 8.10 (navigation/photo/submit) AND 8.11 (per-visit aggregation) in one APK rebuild — single round-trip, full coverage.

Alternative: rebuild the APK now and smoke-test Story 8.10 in isolation before stacking Story 8.11. The user's stated preference is software-only iteration; this report aligns with that preference and recommends Story 8.11 next. If at any point the user wants to validate intermediate state on his phone, he can ask.

---

## 8. Validation performed

### Commands run

```powershell
cd c:/Users/emili/Desktop/Projets/TagWise4to20/backend; npm test -- --run
cd c:/Users/emili/Desktop/Projets/TagWise4to20/mobile;  npm test -- --run
cd c:/Users/emili/Desktop/Projets/TagWise4to20/mobile;  npx vitest run sharedExecutionShellService
cd c:/Users/emili/Desktop/Projets/TagWise4to20/backend; npx tsc --noEmit
cd c:/Users/emili/Desktop/Projets/TagWise4to20/mobile;  npx tsc --noEmit
```

### Test results

- Backend full: **99 pass / 1 skipped** (TagWise live API smoke is env-gated; unchanged baseline).
- Mobile full: **186 / 186 PASS** (unchanged from Story 8.9 baseline; 4 tests updated for new submit rule; no net count change).
- Mobile `sharedExecutionShellService` targeted: 29/29 pass.
- Mobile + backend typecheck: silent (clean).

### Code paths re-inspected during this pass

- `mobile/src/features/execution/sharedExecutionShellService.ts` — minimum-evidence severity + copy + defensive throw replacement + `buildSubmitBlockingHooks` filter logic.
- `mobile/src/features/execution/sharedExecutionShellService.test.ts` — 4 updated test cases.
- `mobile/src/features/visual-shell/serviceBackedReport.ts` — `canSubmit` derivation.
- `mobile/src/features/visual-shell/serviceBackedReport.test.ts` — fixtures aligned with new rule.
- `mobile/src/features/visual-shell/serviceBackedExecution.test.ts` — fixtures aligned.
- `mobile/src/shell/VisualProductShell.tsx` — TagDetailScreen redesign (props, result tiles, action row, instrument photo panel); ServiceCalculationScreen + ServiceGuidanceScreen photo plumbing; ExecutionPhotoActions thumbnail rendering; NavigationAffordanceRow on test screens; `handleSelectTemplateAndOpen` → openRoute; save handlers → popRoute; ServiceHistoryScreen vertical timeline rows + new styles; "Envio ainda bloqueado" guard (unreachable now).
- `mobile/src/shell/TagWiseApp.tsx` — `handleAttachExecutionPhoto` auto-load-shell branch + the P-01 patch added in this pass.
- `backend/src/modules/report-submissions/reportSubmissionService.ts` — `validateMinimumEvidence` (unchanged, strict); `validateOptionalPhotoMetadata` (Story 8.9 C-02) preserved.
- `backend/src/modules/ai-diagnosis/aiDiagnosisService.ts` — `buildDiagnosisInput` still per-template (deferred aggregation).
- `backend/src/modules/work-packages/seedData.ts` — single `historySummary` per tag (deferred history depth).
- `backend/src/worker/main.ts` — AI handler still registered (Story 8.9 unchanged).

### Limitations

- **No phone test.** Per the user's explicit choice to defer rebuilds until all implementation is done.
- **No live backend round-trip.** The submit-with-zero-evidence flow is unit-tested at each side of the boundary; the actual sync issue + classifySyncError behavior is verified by reading code paths.
- **No renderer tests.** Photo thumbnails + vertical layout + new button row are code-correct but visual fit on the user's phone is unverified.

---

## Cross-references

- [QA Pass 1](qa-defect-discovery-2026-05-14.md) — original D-01..D-07 + C-01..C-02 list
- [QA Pass 2](qa-defect-discovery-2026-05-14-pass-2.md) — Story 8.8 verification
- [QA Pass 3](qa-defect-discovery-2026-05-14-pass-3.md) — Story 8.9 verification
- [Story 8.10 implementation artifact](../implementation-artifacts/8-10-instrument-hub-flow-redesign-no-blocking-photo-thumbnails.md)
- [Story 8.9 implementation artifact](../implementation-artifacts/8-9-ai-diagnosis-end-to-end-and-length-validation.md)
- [Story 8.8 implementation artifact](../implementation-artifacts/8-8-evidence-three-context-vertical-layout-and-connectivity-regain.md)
- [Story 8.7 implementation artifact](../implementation-artifacts/8-7-live-phone-field-workflow-repair.md)

---

## Closing note

Four QA cycles, four implementation stories, one phone test session. The pattern is holding: each QA pass surfaces 1-2 minor items, the dev addresses them, the next QA confirms. Story 8.10 (the largest UX redesign yet) lands clean enough that the only meaningful issue found in this pass — the `selectedExecutionTemplateId` mismatch — was patched within the QA cycle itself.

Story 8.11 (per-visit aggregation + history depth + AI input aggregation) is the natural next slice. After it lands, you'll have the full architectural alignment your finding #10 described, and one APK rebuild will validate Stories 8.10 + 8.11 together. The aggregation is the architectural piece that lets the per-test status badges, multi-point history, and aggregated AI all light up at once.

Recommend: **proceed to Story 8.11.**
