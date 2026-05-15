# QA Defect Discovery — 2026-05-15 — Pass 5

Date: 2026-05-15
Inputs: User's 6 manual Android findings after the Story 8.11 APK test.
Source of truth: current HEAD, Story 8.11 / 8.10 / 8.9 / 8.8 implementation artifacts.

## Verdict matrix

| # | Title | Severity | Verified | Fix effort | Recommended order |
|---|---|---|---|---|---|
| 1 | Photo thumbnails missing on key screens | medium | partial | 1-2h | 2 (UX gap, simple) |
| 2 | Returned report re-opens as editable draft (no invalidate) | high | yes | 4-6h | 5 (lifecycle reshape; breaks tests) |
| 3 | Calculator missing "0→100% sweep" mode | low | yes | 1-2h | 3 (small feature) |
| 4 | Loop-test template missing for 3 of 5 seeded tags | medium | yes | 30 min (seed-only) | 1 (smallest unblock; high value) |
| 5 | AI failure reason not surfaced to user | high | yes | 2-3h | 4 (cross-layer thread but contained) |
| 6 | Toast / banner scrolls out of view | medium | yes | 1-2h | 6 (UX polish; safest last) |

Recommended order rationale: do the seed-only fix (#4) first because it instantly improves coverage during phone test. Then thumbnails (#1) and calculator sweep (#3) are localized. Then AI failure surfacing (#5). Then the lifecycle reshape (#2) which is the biggest blast radius — leave the toast (#6) for last because it touches every screen layout.

## Cross-cutting risks

1. **#2 reshapes the report lifecycle**. The mobile `SharedExecutionReportState` union ([mobile/src/features/execution/model.ts:262-265](mobile/src/features/execution/model.ts#L262-L265)) is consumed by ~12 call sites in `TagWiseApp.tsx` and 5 in `evidenceUploadOrchestrator.ts`. Adding a new state value (e.g. `'supervisor-returned-invalidated'`) requires updating: `isSharedExecutionReportState`, `isTechnicianEditableReportState`, `mapServerReportStateToLocal`, the SQLite payload parser in `evidenceUploadOrchestrator.parseReportSyncPayload` and `syncStateService.parseStoredReportSyncPayload`, the orchestrator round-trip test ([mobile/src/features/sync/evidenceUploadOrchestrator.test.ts:630-690](mobile/src/features/sync/evidenceUploadOrchestrator.test.ts#L630-L690)) which currently asserts the OPPOSITE behavior (returned → technician-owned-draft), plus the `loadShell` payload tolerance and the `loadVisitForTag` aggregator. Of the 190 mobile tests, at minimum the orchestrator round-trip test and any state-union exhaustiveness checks need rewriting; expect 5-10 test updates plus 2-4 new tests for the invalidated-state branch. Backend changes are smaller: the `returnReport` handler keeps `'returned-by-supervisor'` (the SERVER state), the new semantics live in the MOBILE projection. No backend migration needed.

2. **#1, #5, #6 are additive**. None of them change existing contract types. Tests should remain green; only new tests are added.

3. **#3 (calculator sweep)** touches a single screen and `convertLoopValue`; the existing `case` statements remain.

4. **#4 (seed)** changes only `backend/src/modules/work-packages/seedData.ts`. Existing snapshot-shape tests still pass because the template list is just lengthened.

## Other issues noticed (not user-reported)

- **N-1 (low):** `mapAiDiagnosisProjection` in [TagWiseApp.tsx:3820-3831](mobile/src/shell/TagWiseApp.tsx#L3820-L3831) silently drops the backend's `failureReason` and `lastRequestedAt` fields. Same shape gap as finding #5 but also affects `lastRequestedAt` (technician cannot see when the last AI request was made).
- **N-2 (low):** `LoopExecutionScreen` per-loop-point row ([VisualProductShell.tsx:3074-3149](mobile/src/shell/VisualProductShell.tsx#L3074-L3149)) renders camera/gallery buttons but never displays the per-point photo thumbnails the user just captured. Sibling regression to finding #1 within the loop test screen. The Story 8.10 artifact at line 158 explicitly justifies skipping thumbnails here, but the rationale ("loop screen already has a per-point bar") is about buttons only, not previews.
- **N-3 (medium):** [evidenceUploadOrchestrator.ts:89-94](mobile/src/features/sync/evidenceUploadOrchestrator.ts#L89-L94) — `syncSubmittedReportEvidence` rethrows after report submission has already succeeded if any photo attachment errored. The user-facing caller then shows a sync error toast for an otherwise-successful submit. This is the most likely explanation for the user's note in finding #2 that "report arrived at supervisor but the technician saw a sync error". The orchestrator should record per-photo failure on the photo's own `syncIssue` (already done) and resolve cleanly when the report itself is server-accepted; the throw should be downgraded to a warning surfaced via a less-alarming UI path.
- **N-4 (low):** `setShellMessage` in [VisualProductShell.tsx](mobile/src/shell/VisualProductShell.tsx) is called from 30+ sites but never auto-cleared. Messages persist until the next call. Tied to finding #6 but worth a dedicated `useEffect(setTimeout, 5000)` even if the overlay approach is rejected.
- **N-5 (low):** Story 8.9 documentation references env var `TAGWISE_AI_OPENAI_API_KEY` (artifact line 152, 221) but the actual env loader at [backend/src/config/env.ts:116-117](backend/src/config/env.ts#L116-L117) reads `OPENAI_API_KEY` / `OPENAI_MODEL`. If the user copied the env names from the story artifact, the provider would never have been wired and the row would silently land as mock. Worth fixing the docs to avoid this trap.

---

## Finding #1 — Photos not displayed on the screens where they were taken

### Verified: partial

The Story 8.10 fix is correctly in place for `ServiceCalculationScreen` and `ServiceGuidanceScreen`. The thumbnail render path works. But two locations remain blind:
- **TagDetailScreen's `Foto do instrumento` panel** ([VisualProductShell.tsx:2757-2779](mobile/src/shell/VisualProductShell.tsx#L2757-L2779)) — has the buttons but NO thumbnail row.
- **LoopExecutionScreen's per-loop-point row** ([VisualProductShell.tsx:3074-3149](mobile/src/shell/VisualProductShell.tsx#L3074-L3149)) — has per-point Foto/Galeria buttons but no thumbnail under each point.

### Repro path

- `ServiceCalculationScreen` ExecutionPhotoActions wired at [VisualProductShell.tsx:2917-2923](mobile/src/shell/VisualProductShell.tsx#L2917-L2923) with `filterStepKind="calculation"` and `photos={photoAttachments}`. ✓
- `ServiceGuidanceScreen` ExecutionPhotoActions wired at [VisualProductShell.tsx:3794-3801](mobile/src/shell/VisualProductShell.tsx#L3794-L3801) with `filterStepKind="guidance"` and `photos={photoAttachments}`. ✓
- The `photoAttachments` prop is fed from `executionShell?.evidence.photoAttachments ?? []` at [VisualProductShell.tsx:998, 1084](mobile/src/shell/VisualProductShell.tsx#L998). ✓
- `handleAttachExecutionPhoto` ([TagWiseApp.tsx:1528-1646](mobile/src/shell/TagWiseApp.tsx#L1528-L1646)) updates `executionShell` immediately on save (L1612-1632) — the re-render IS synchronous; the thumbnail SHOULD appear without any other state event. ✓
- `ExecutionPhotoActions` component itself ([VisualProductShell.tsx:5056-5124](mobile/src/shell/VisualProductShell.tsx#L5056-L5124)) filters by `filterStepKind` and renders the ScrollView of thumbnails correctly.
- **Gap A**: TagDetailScreen does not import `ExecutionPhotoActions`; it has its own inline Pressable panel with no thumbnails.
- **Gap B**: LoopExecutionScreen's per-point block has buttons (L3121-3148) but no thumbnail render — there's no `photoAttachments` prop on LoopExecutionScreen at all.

### Root cause

Story 8.10 added thumbnails only to the two single-point capture screens; the instrument detail panel and the loop-test per-point row were not updated.

### Blast radius

- Touch: `TagDetailScreen` props ([VisualProductShell.tsx:2572-2600](mobile/src/shell/VisualProductShell.tsx#L2572-L2600)) — add `photoAttachments` prop.
- Touch: `LoopExecutionScreen` props ([VisualProductShell.tsx:2988-3003](mobile/src/shell/VisualProductShell.tsx#L2988-L3003)) — add `photoAttachments` prop.
- Touch: VisualProductShell call sites for both screens (`TagDetailScreen` at ~L940-955, `LoopExecutionScreen` at L1027-1046) — pass `executionShell?.evidence.photoAttachments ?? []`.
- Add thumbnail render to TagDetailScreen instrument panel (filter `executionStepId === 'instrument'`).
- Add per-point thumbnail filtering to LoopExecutionScreen (filter `contextNote === 'Ponto de loop {percent}%'`).
- Existing tests: none should break; tests don't render screens.

### Fix approach

1. For **TagDetailScreen**, render a `ScrollView` horizontal of `Image` thumbnails below the existing camera/gallery buttons, filtered by `photo.executionStepId === 'instrument'`. Reuse the existing styles `executionPhotoThumbRow`, `executionPhotoThumbCard`, `executionPhotoThumb`, `executionPhotoThumbCaption`. Caption: `photo.contextNote ?? 'Instrumento'`. The `photoAttachments` source should come from `executionShell?.evidence.photoAttachments ?? []` at the parent call site. Note: an instrument photo only persists once a template is loaded (Story 8.10 finding #4 auto-load). So the thumbnail row only renders after the first instrument photo is taken (which auto-loads the first template).

2. For **LoopExecutionScreen**, accept `photoAttachments` as a new prop, then inside the `result.rows.map((row, index) => ...)` block, after the camera/gallery buttons, filter `photoAttachments` by `photo.contextNote === \`Ponto de loop ${row.setpointPercent}%\`` and render the same horizontal thumbnail ScrollView. This makes per-point captures visible inline.

3. Both fixes are additive: the existing capture path already saves photos correctly; only the read path is missing. No test changes required.

---

## Finding #2 — Returned report re-opens as editable in-progress draft

### Verified: yes (semantics gap is real)

Current behavior: when the supervisor returns a report, the backend persists `reportState: 'returned-by-supervisor'`, `lifecycleState: 'Returned by Supervisor'` ([backend/src/modules/review/supervisorReviewService.ts:121-128](backend/src/modules/review/supervisorReviewService.ts#L121-L128)). The mobile orchestrator's `mapServerReportStateToLocal` ([evidenceUploadOrchestrator.ts:899-907](mobile/src/features/sync/evidenceUploadOrchestrator.ts#L899-L907)) MAPS this back to `'technician-owned-draft'`. That means the same report row re-enters the editable state with the same `reportId` and the same evidence; the technician edits in place and re-submits. There is no "invalidated" history record and no fresh draft.

### Repro path

- Supervisor return decision: [supervisorReviewService.ts:109-128](backend/src/modules/review/supervisorReviewService.ts#L109-L128) → `decisionType: 'returned'`, `reportState: 'returned-by-supervisor'`, `lifecycleState: 'Returned by Supervisor'`.
- Mobile reads server status: [evidenceUploadOrchestrator.ts:97-121](mobile/src/features/sync/evidenceUploadOrchestrator.ts#L97-L121) — calls `getReportSubmissionStatus`, writes `state: mapServerReportStateToLocal(status.reportState)` (L110).
- Map function: [evidenceUploadOrchestrator.ts:899-907](mobile/src/features/sync/evidenceUploadOrchestrator.ts#L899-L907) — `if (state === 'returned-by-supervisor' || state === 'returned-by-manager') return 'technician-owned-draft';`.
- `isTechnicianEditableReportState` ([TagWiseApp.tsx:5071-5073](mobile/src/shell/TagWiseApp.tsx#L5071-L5073)) treats `'technician-owned-draft'` as editable → the user can attach photos, change values, save, re-submit.
- The mobile `SharedExecutionReportState` enum ([model.ts:262-265](mobile/src/features/execution/model.ts#L262-L265)) has only 3 states; there is no `'supervisor-returned-invalidated'`.
- The existing orchestrator test at [evidenceUploadOrchestrator.test.ts:630-690](mobile/src/features/sync/evidenceUploadOrchestrator.test.ts#L630-L690) asserts the current incorrect-per-user-expectation behavior and would need to flip.

Sync-error-but-arrived sub-issue: [evidenceUploadOrchestrator.ts:74-94](mobile/src/features/sync/evidenceUploadOrchestrator.ts#L74-L94) — `syncSubmittedReportEvidence` collects per-photo failures, calls `submitReportForServerValidation` which can succeed, then rethrows the first per-photo failure. So the report reaches the server but the catch path in the caller shows a sync error. The local report's `state` is `'submitted-pending-review'` (since `submitReportForServerValidation` succeeded) but the per-photo `syncState: 'sync-issue'` is what's surfaced.

### Root cause

The mobile model treats supervisor-returned as the same lifecycle moment as a fresh draft, so the technician re-edits the same row in place. The user wants returned to be terminal/read-only on the technician side and a fresh draft to start on the next tag visit.

### Blast radius

This is the largest blast radius of the six findings:
- **Mobile model**: add a new enum value to `SharedExecutionReportState` (or add a sibling boolean `invalidated: true` on the draft state — a cleaner additive option).
- **Mobile orchestrator**: `mapServerReportStateToLocal` returns the new state; `parseStoredReportSyncPayload` and `parseReportSyncPayload` accept the new state in their parsers; `isTechnicianEditableReportState` returns `false` for it.
- **Mobile loadShell** ([sharedExecutionShellService.ts](mobile/src/features/execution/sharedExecutionShellService.ts)) — when a shell loads with the invalidated state, return it but the report draft should be read-only; new visit semantics start with a fresh `reportId`.
- **Mobile dashboard / technician reports list** — group invalidated reports into a "Historico de devolucoes" section. Currently `loadCurrentTechnicianReports` ([TagWiseApp.tsx](mobile/src/shell/TagWiseApp.tsx)) returns a flat list; needs grouping or a flag.
- **Backend**: minimal — the SERVER state stays `'returned-by-supervisor'`. The semantics live in the mobile projection. Optionally: relax the constraint that re-submission re-uses the same `reportId`; allow the second submission to mint a new `reportId` on the same `(workPackageId, tagId)` pair. The current `reportSubmissionService.submitForValidation` uses `submitPayload.reportId` from the queue; if the mobile starts a fresh visit, a new `reportId` is naturally generated by the local shell service.
- **Existing tests**: orchestrator round-trip test ([evidenceUploadOrchestrator.test.ts:630-690](mobile/src/features/sync/evidenceUploadOrchestrator.test.ts#L630-L690)) flips: expect `'supervisor-returned-invalidated'` (or whatever name) and `editable: false`. The aggregator test in `sharedExecutionShellService.test.ts` (added in Story 8.11) likely still works because it aggregates per-template; the invalidated history is a sibling list.
- **Supervisor UX language**: the "Devolver" button label should be updated to convey "Invalidar e exigir nova visita". The supervisor's return-comment field is still useful.

### Fix approach

Recommended phased approach (the additive variant is safer):

**Variant A — additive flag (recommended)**: keep `SharedExecutionReportState` as-is but add `invalidated: boolean` and `invalidationReason: string | null` to `SharedExecutionReportDraftState`. `mapServerReportStateToLocal` keeps mapping returned → `'technician-owned-draft'` but `updateReportDraftRecord` sets `invalidated: true` on that mapping. `isTechnicianEditableReportState` is extended to consult the flag. The technician reports list groups invalidated rows into a "Visitas devolvidas (historico)" section. Opening the tag from the dashboard checks for an invalidated row; if found, the next `loadShell` call mints a new `reportId` instead of reusing the invalidated one. Backend stays unchanged.

**Variant B — new enum value**: add `'supervisor-returned-invalidated'` to the three-state union. This is more typesafe (every consumer must explicitly handle it) but ripples through more files and has a higher chance of breaking unexpected call sites. Choose this only if Variant A introduces hard-to-find guard-condition forks.

For the orphan sync-error-but-arrived sub-issue (N-3), the simplest fix is to NOT rethrow the per-photo failure in `syncSubmittedReportEvidence` ([evidenceUploadOrchestrator.ts:89-94](mobile/src/features/sync/evidenceUploadOrchestrator.ts#L89-L94)). Instead, log the per-photo failure (it's already stored on `photo.syncIssue`) and resolve the orchestrator call cleanly. The user already sees the per-photo issue in the photo card; the global error toast is misleading.

---

## Finding #3 — Calculator missing "0 to 100% sweep" mode

### Verified: yes

The standalone Calculadora has Conversion mode + Loop mode. Conversion mode supports 6 single-value modes ([VisualProductShell.tsx:1948-2052](mobile/src/shell/VisualProductShell.tsx#L1948-L2052)): `pv-to-ma`, `ma-to-pv`, `pv-to-percent`, `ma-to-percent`, `percent-to-ma`, `error`. The within-instrument single-point Conversao panel ([VisualProductShell.tsx:2952-2958](mobile/src/shell/VisualProductShell.tsx#L2952-L2958)) exposes 5 buttons. Neither offers a "0% / 25% / 50% / 75% / 100% sweep" view that shows all 5 mA / PV / % triples in one screen.

`convertLoopValue` ([serviceBackedExecution.ts:317-364](mobile/src/features/visual-shell/serviceBackedExecution.ts#L317-L364)) supports 5 single-point modes and has no sweep mode.

### Root cause

The conversion utility is designed for one input → one output. The user wants a one-input (the process range) → 5-row output ("at 0%, 4 mA = X PV; at 25%, 8 mA = Y PV; …"). This requires a new helper function and a new UI section, not a modification to `convertLoopValue`.

### Blast radius

- Add `buildLoopSweepRows({ processRange, loopRange }): SweepRow[]` to [serviceBackedExecution.ts](mobile/src/features/visual-shell/serviceBackedExecution.ts) returning 5 rows of `{ percent, milliamp, processValue }`.
- Add unit tests for the new helper in [serviceBackedExecution.test.ts](mobile/src/features/visual-shell/serviceBackedExecution.test.ts).
- Add a new conversion mode button "Tabela 0-100%" (or call it "Faixa completa") to the in-instrument Conversao section ([VisualProductShell.tsx:2952-2958](mobile/src/shell/VisualProductShell.tsx#L2952-L2958)) and to the standalone Calculadora ([VisualProductShell.tsx:1948-2052](mobile/src/shell/VisualProductShell.tsx#L1948-L2052)).
- Render a 5-row table when this mode is active. No existing tests should break.

### Fix approach

1. Add `buildLoopSweepRows` helper. Iterate `[0, 25, 50, 75, 100]`. For each, compute `mA = 4 + (percent/100) * 16` and `pv = processMin + (percent/100) * (processMax - processMin)`. Return rows with `{ percentLabel: '0%', milliampLabel: '4.00 mA', processValueLabel: '0.00 bar' }` etc.
2. In `convertLoopValue`, add a new branch `case 'sweep'`: return a multi-row result shape. The simplest path: don't extend `convertLoopValue`; instead add a sibling render that ignores the user's numeric input field entirely and dumps the table.
3. In the standalone Calculadora, after the conversion mode picker, when mode is the new sweep value, hide the value/expected/measured inputs (or grey them out) and render the 5-row table directly. Title: "Sweep 4-20 mA na faixa configurada". Subtitle: hint that this is a reference table, not a live measurement.
4. The Calculadora's `PickerChips` mode list at [VisualProductShell.tsx:1954](mobile/src/shell/VisualProductShell.tsx#L1954) needs the new mode added: `['pv-to-ma', 'ma-to-pv', 'pv-to-percent', 'ma-to-percent', 'percent-to-ma', 'sweep', 'error']`.

---

## Finding #4 — Loop test template not auto-available for ranged instruments

### Verified: yes

The mobile pattern resolver ([executionFlow.ts:34-90](mobile/src/features/visual-shell/executionFlow.ts#L34-L90)) classifies a template as `'loop'` only when its title/testPattern/captureSummary/calculationMode matches `/loop|curva|multi.?ponto|5\s*pontos|10\s*pontos|as.?found.*as.?left/i`. Of the 5 seeded tags:

| Tag | templateIds | Loop-test? |
|---|---|---|
| PT-101 ([seedData.ts:779-783](backend/src/modules/work-packages/seedData.ts#L779-L783)) | tpl-pressure-as-found, tpl-pressure-as-left, **tpl-pressure-loop-range** | yes (loop-range matches) |
| TT-205 ([seedData.ts:800-804](backend/src/modules/work-packages/seedData.ts#L800-L804)) | tpl-temperature-input-simulation, tpl-temperature-calibration-verification, tpl-temperature-range-check | **NO** |
| AI-330 ([seedData.ts:821-825](backend/src/modules/work-packages/seedData.ts#L821-L825)) | tpl-loop-integrity-check, tpl-loop-signal-validation, tpl-loop-current-vs-process | yes (all 3 match "loop") |
| LT-410 ([seedData.ts:1091-1095](backend/src/modules/work-packages/seedData.ts#L1091-L1095)) | tpl-level-range-check, tpl-level-basic-calibration, tpl-level-output-verification | **NO** |
| XV-402 ([seedData.ts:1112-1115](backend/src/modules/work-packages/seedData.ts#L1112-L1115)) | tpl-valve-stroke-test, tpl-valve-position-feedback-verification | **NO** (valve has stroke positions, not 4-20 mA loop) |

The user expects every 4-20 mA ranged instrument to have a loop-test template available. PT-101 and AI-330 are fine. TT-205 and LT-410 are 4-20 mA transmitters with configured ranges and SHOULD have a loop-test template. XV-402 is a control valve with digital position feedback (not a 4-20 mA loop), so a sweep loop-test does not semantically apply — though the user's complaint was framed broadly, this one is debatable.

### Root cause

Seed templates for TT-205 and LT-410 do not include a loop-verification template. The 3 templates each tag carries are functionally similar single-point verifications.

### Blast radius

Seed-only fix. Files touched:
- [backend/src/modules/work-packages/seedData.ts](backend/src/modules/work-packages/seedData.ts) — add `tpl-temperature-loop-range` and add it to TT-205's `templateIds`; add `tpl-level-loop-range` and add it to LT-410's `templateIds`.
- The prior-readings seed builder doesn't reference templateId so won't need an update.
- No mobile changes required: the pattern resolver already recognizes "loop" in title/testPattern.
- No existing tests should break; the work-package snapshot shape simply has 1 more template per affected tag. If any test counts templates per tag (search confirmed none), update.

### Fix approach

Add two new template entries to `templates: [...]` block in each package:

```ts
buildTemplate({
  id: 'tpl-temperature-loop-range',
  instrumentFamily: 'temperature transmitter / RTD input',
  testPattern: 'loop verification across configured range',
  title: 'Temperature loop verification',
  calculationMode: 'expected output vs measured output across loop range',
  acceptanceStyle: 'within tolerance at each loop checkpoint',
  captureSummary: 'Capture 0/25/50/75/100% temperature checkpoints and verify the loop output across the configured operating range.',
  expectedLabel: 'Expected temperature',
  observedLabel: 'Measured output',
  checklistSteps: buildTemperatureChecklistSteps(),
  guidedDiagnosisPrompts: buildTemperatureDiagnosisPrompts(),
  minimumSubmissionEvidence: ['loop checkpoints', 'measured outputs'],
  expectedEvidence: ['reference source note', 'supporting photo'],
  historyComparisonExpectation: 'compare repeated loop drift at the same checkpoints',
}),
```

Analogous entry for `tpl-level-loop-range`. Then append the new ids to TT-205 and LT-410 templateIds arrays. Re-seed (or rely on idempotent seed). XV-402 is intentionally skipped per the rationale above — recommend asking the user to confirm before adding a "stroke sweep" template for valves.

---

## Finding #5 — AI failure reason not surfaced

### Verified: yes

The backend correctly captures and stores `failureReason`. The mobile drops it before render.

### Repro path

- Backend worker handler captures the provider error and persists `failureReason`: [aiDiagnosisJobHandler.ts:59-78](backend/src/modules/ai-diagnosis/aiDiagnosisJobHandler.ts#L59-L78).
- Backend record model includes `failureReason: string | null`: [model.ts:57](backend/src/modules/ai-diagnosis/model.ts#L57).
- Backend projection includes `failureReason`: [reportSubmissionService.ts:383-406](backend/src/modules/report-submissions/reportSubmissionService.ts#L383-L406).
- Mobile API client mirrors `failureReason` on the response type: [evidenceUploadApiClient.ts:159](mobile/src/features/sync/evidenceUploadApiClient.ts#L159).
- **Gap**: `mapAiDiagnosisProjection` in [TagWiseApp.tsx:3820-3831](mobile/src/shell/TagWiseApp.tsx#L3820-L3831) reads only 5 fields (`state`, `summary`, `detail`, `providerLabel`, `generatedAt`) — `failureReason` is dropped.
- **Gap**: `VisualAiDiagnosisProjectionInput` in [serviceBackedReport.ts:19-25](mobile/src/features/visual-shell/serviceBackedReport.ts#L19-L25) does not declare `failureReason`.
- **Gap**: `buildVisualAiDiagnosisProjection` `failed-nonblocking` branch at [serviceBackedReport.ts:255-266](mobile/src/features/visual-shell/serviceBackedReport.ts#L255-L266) renders only `input.detail ?? 'Nao foi possivel gerar o diagnostico de IA agora. ...'` — generic.
- The rendered card on technician and supervisor side ([VisualProductShell.tsx:4166-4197](mobile/src/shell/VisualProductShell.tsx#L4166-L4197) and L4557-4564) shows `aiDiagnosis.detail` only. So the user sees "Nao foi possivel gerar" with no further info.

OpenAI provider produces specific messages like `OpenAI diagnosis request failed with status 401.` or `OpenAI diagnosis request timed out after 30000ms.` ([openAiDiagnosisProvider.ts:60-92](backend/src/modules/ai-diagnosis/openAiDiagnosisProvider.ts#L60-L92)) — these would land in `failureReason` if the row reaches mobile.

Env var sanity: configuration loader reads `OPENAI_API_KEY` and `OPENAI_MODEL` ([env.ts:116-117](backend/src/config/env.ts#L116-L117)), with `TAGWISE_AI_ENABLED` and `TAGWISE_AI_PROVIDER` controlling factory selection ([aiDiagnosisProviderFactory.ts:16-30](backend/src/modules/ai-diagnosis/aiDiagnosisProviderFactory.ts#L16-L30)). The Story 8.9 artifact references `TAGWISE_AI_OPENAI_API_KEY` which does NOT exist; if the user copied from there their key may not be wired (see also N-5).

### Root cause

The backend captures and stores the failure reason but the mobile projection mapper drops it. The `failed-nonblocking` UI branch shows only a generic message.

### Blast radius

- Add `failureReason?: string | null` to `VisualAiDiagnosisProjectionInput` ([serviceBackedReport.ts:19-25](mobile/src/features/visual-shell/serviceBackedReport.ts#L19-L25)) and to `VisualAiDiagnosisProjection` ([serviceBackedReport.ts:27-35](mobile/src/features/visual-shell/serviceBackedReport.ts#L27-L35)).
- In `mapAiDiagnosisProjection` ([TagWiseApp.tsx:3820-3831](mobile/src/shell/TagWiseApp.tsx#L3820-L3831)) thread `failureReason: projection.failureReason`.
- In `buildVisualAiDiagnosisProjection` ([serviceBackedReport.ts:255-266](mobile/src/features/visual-shell/serviceBackedReport.ts#L255-L266)) for `failed-nonblocking`, set `detail: input.failureReason ?? input.detail ?? <existing generic>`. Also return `failureReason` on the projection for explicit rendering.
- Render path: technician card at [VisualProductShell.tsx:4166-4197](mobile/src/shell/VisualProductShell.tsx#L4166-L4197) and supervisor card at L4557-4564 — optionally add an explicit "Motivo da falha:" Text when `failureReason` is non-null.
- Tests: `buildVisualAiDiagnosisProjection` has 4 existing tests in `serviceBackedReport.test.ts`; add 1 new test for the failure-reason branch. No breakage expected.

### Fix approach

1. Widen the projection input and output to carry `failureReason: string | null`.
2. Update `mapAiDiagnosisProjection` to forward the field.
3. In the `failed-nonblocking` branch of `buildVisualAiDiagnosisProjection`, prefer `input.failureReason` for the `detail` field, or render it as a separate "Motivo:" line in the UI card.
4. Document that `TAGWISE_AI_ENABLED=true`, `TAGWISE_AI_PROVIDER=openai`, `OPENAI_API_KEY=<key>`, `OPENAI_MODEL=<model>` is the correct env var set (the Story 8.9 artifact's `TAGWISE_AI_OPENAI_API_KEY` is incorrect; see N-5).
5. Optional but recommended: when the worker handler catches `AiDiagnosisProviderError` with status 401, prepend a hint like "Chave OpenAI invalida ou ausente: <message>" before persisting — makes the failure self-explanatory in the UI.

---

## Finding #6 — Toast/banner UX gap

### Verified: yes

Every authenticated screen renders inside a single `<ScrollView>` at [VisualProductShell.tsx:862-866](mobile/src/shell/VisualProductShell.tsx#L862-L866). The `shellMessage` / `authMessage` is rendered as an `InlineMessage` inside the screen content (e.g. dashboard [L1336](mobile/src/shell/VisualProductShell.tsx#L1336), service calculation [L2841](mobile/src/shell/VisualProductShell.tsx#L2841), loop screen [L3030](mobile/src/shell/VisualProductShell.tsx#L3030), guidance [L3701](mobile/src/shell/VisualProductShell.tsx#L3701)). When the user scrolls down to fill in values or save a calculation, the message is offscreen at the top.

There is no auto-clear on the message; only the next `setShellMessage(null)` or `setShellMessage(...)` call replaces it. There are ~30 call sites of `setShellMessage` in `VisualProductShell.tsx` alone.

### Root cause

The notification text is part of normal document flow inside a scroll container, not absolutely positioned over the screen. The user has no way to see it after scrolling and no way to dismiss it.

### Blast radius

This is a styling change. Plan:
- Add a `Toast` inline component at the top of `VisualProductShell.tsx` (the file is large but no new files were created in Stories 8.7+).
- Wrap the `<KeyboardAvoidingView>` or use a sibling `<View>` with `position: 'absolute'`, `bottom: 16`, `left: 16`, `right: 16`, `zIndex: 10`. React Native supports `position: 'absolute'` on a child of `SafeAreaView` — the absolutely-positioned overlay sits above the ScrollView regardless of scroll position.
- Optionally add `setTimeout` for auto-hide (5s) and a dismiss button.
- Remove the per-screen `<InlineMessage text={shellMessage} />` once the toast is in place, OR keep both for full backwards compatibility and only flip the toast on when `shellMessage` changes.
- All 30+ `setShellMessage` call sites continue to work unchanged.

### Fix approach

1. Add a single `Toast` component:

```tsx
function MessageToast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  if (!message) return null;
  return (
    <View style={styles.toastOverlay}>
      <Text style={styles.toastMessage}>{message}</Text>
      <Pressable onPress={onDismiss} accessibilityRole="button" style={styles.toastDismiss}>
        <Text style={styles.toastDismissLabel}>x</Text>
      </Pressable>
    </View>
  );
}
```

Styles: `toastOverlay: { position: 'absolute', bottom: 24, left: 16, right: 16, padding: 12, backgroundColor: colors.surfaceElevated, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }`.

2. Render `<MessageToast message={shellMessage ?? authMessage} onDismiss={() => setShellMessage(null)} />` as a sibling of `<ScrollView>` inside `<SafeAreaView>` so absolute positioning anchors against the screen, not the scroll content.

3. Trade-offs:
- Native `Alert.alert(...)` blocks the JS thread and is overkill for non-blocking feedback. Avoid.
- Toast keeps the user in the flow; works for both confirmation ("Calculo salvo") and lighter errors.
- For true errors (e.g. submission rejected by server) the existing `pendingCard` panel in the report screen is still the right durable surface; the toast is a temporary cue.

4. After landing the toast, remove the in-flow `<InlineMessage text={shellMessage} />` at the 5+ screen-level call sites to avoid double-rendering the same text. Keep `InlineMessage` for the "context-providing" usages that are intentional in-page hints (e.g. [L1633](mobile/src/shell/VisualProductShell.tsx#L1633) "Cadastro local para campo. ...").

---

## Notes on test impact

Estimated test changes per finding:

| # | Mobile tests touched | Backend tests touched | Net new tests |
|---|---|---|---|
| 1 | 0 | 0 | 0 (visual only) |
| 2 | 5-10 (orchestrator round-trip, isTechnicianEditableReportState branches, dashboard grouping, sharedExecutionShellService aggregator) | 0 | +2-4 new (invalidated state lifecycle) |
| 3 | 0 | 0 | +1 (buildLoopSweepRows) |
| 4 | 0 (pattern resolver already handles) | 0 (snapshot shape tolerant) | 0 |
| 5 | 0 | 0 | +1 (failureReason branch of buildVisualAiDiagnosisProjection) |
| 6 | 0 | 0 | 0 (visual only) |

The 190/190 baseline should hold for everything except #2. If #2 is implemented as Variant A (additive flag), expect 5-10 test updates plus 2-4 new tests, ending around 195/195. Variant B (new enum value) could ripple to 15+ test files.

## References

- Story 8.11 artifact: `_bmad-output/implementation-artifacts/8-11-per-visit-aggregator-multi-point-history-test-status-badges.md`
- Story 8.10 artifact: `_bmad-output/implementation-artifacts/8-10-instrument-hub-flow-redesign-no-blocking-photo-thumbnails.md`
- Story 8.9 artifact: `_bmad-output/implementation-artifacts/8-9-ai-diagnosis-end-to-end-and-length-validation.md`
- Story 8.8 artifact: `_bmad-output/implementation-artifacts/8-8-evidence-three-context-vertical-layout-and-connectivity-regain.md`
- Predecessor QA: `_bmad-output/planning-artifacts/qa-defect-discovery-2026-05-14-pass-4.md`
