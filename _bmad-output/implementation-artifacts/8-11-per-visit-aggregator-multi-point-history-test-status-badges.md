# Story 8.11 — Per-Visit Aggregator, Multi-Point History, Test Status Badges

Date: 2026-05-14
Predecessor QA: `_bmad-output/planning-artifacts/qa-defect-discovery-2026-05-14-pass-4.md`
Successor of Story 8.10 (instrument hub redesign + no-blocking submit + photo thumbnails).

## Scope

Three deliverables landed in a single pass:

- **D-1 — Multi-point history (finding #7, finding #2 carry-over).** Backend snapshot now carries `priorTestReadings[]` per work-package, projected to mobile as `LocalTagContext.priorReadings`. The Compare screen renders a per-measurement-point "Leituras anteriores neste ponto" panel above the existing timeline rows so the technician can scan drift across past tests at the active point.
- **D-2 — Test status badges on the detail screen (finding #10 partial).** The detail screen now reads per-template saved acceptance from the calculation repository and renders "Concluido" / "Falha" / "Salvo" / "Abrindo" / "Iniciar" badges next to each template in the "Escolher teste" list. Badges persist across visits to the detail screen and refresh after every save.
- **D-3 — Per-visit aggregator (finding #10, finding #8).** New `InstrumentVisitAggregator` service projection (`loadVisitForTag`) loads every per-template shell for the tag and produces a single `InstrumentVisitView`. The Report screen renders a "Resumo da visita" panel listing every saved test for the tag. On submission, the canonical report's observation notes are augmented (in place, fence-marker guarded) with a visit-summary block so the supervisor and the AI input naturally carry cross-test context. Persistence stays per-template; aggregation is a thin projection.

Deferred to a future story:
- A schema-level "per-visit canonical report" record. The current implementation keeps per-template reports on the backend; the UI shows ONE relatorio, and the supervisor sees the cross-test context via the augmented observation notes. A future story can promote the visit to a first-class backend object if needed.

## Files changed

### Backend
- `backend/src/modules/work-packages/model.ts` — added `AssignedWorkPackagePriorTestReadingSnapshot` type and made `priorTestReadings?` optional on `AssignedWorkPackageSnapshot` for backwards compatibility with packages that have not been re-seeded.
- `backend/src/modules/work-packages/seedData.ts` — added `buildPriorReadingSession` helper plus per-tag seed builders. Each of the 5 seeded tags now carries 4 prior test sessions; PT-101/TT-205/AI-330/LT-410 carry 5 measurement points each, XV-402 carries 3 stroke positions. Total: ~92 prior readings across both packages, telling realistic drift / steady-state / stuck-valve stories that align with the existing `historySummary.trendHint` narratives.

### Mobile
- `mobile/src/features/work-packages/model.ts` — mirrored backend types, added `LocalTagPriorTestReading` and `LocalTagContext.priorReadings`.
- `mobile/src/features/work-packages/localTagContextService.ts` — projects `snapshot.priorTestReadings` to `LocalTagContext.priorReadings`, sorted newest-first and scoped to the requested tag.
- `mobile/src/features/work-packages/localTagContextService.test.ts` — added 2 tests: prior readings sort + cross-tag scoping, and empty default when the snapshot has none.
- `mobile/src/data/local/repositories/userPartitionedExecutionCalculationRepository.ts` — added `listForTag(workPackageId, tagId)` so the detail screen can summarize saved calculations across all templates without opening each shell.
- `mobile/src/features/execution/sharedExecutionShellService.ts` — added `SharedExecutionTemplateStatus`, `InstrumentVisitTemplateEntry`, `InstrumentVisitView` types; added `listTemplateStatusesForTag` and `loadVisitForTag` methods.
- `mobile/src/features/execution/sharedExecutionShellService.test.ts` — added 2 tests: per-template status badge listing and visit-aggregate projection with deduplicated risk items + canonical template selection.
- `mobile/src/shell/TagWiseApp.tsx` — added `executionTemplateStatuses` and `instrumentVisit` to the ready state, populated them in `openTagContext` and refreshed them after `saveCalculation` / `saveGuidanceEvidence`. Submission path applies `applyVisitSummaryAugmentation` to fold cross-test context into observation notes before calling `submitReport`. New helpers `applyVisitSummaryAugmentation` and `formatVisitSummaryForObservationNotes` at the bottom of the file.
- `mobile/src/shell/VisualProductShell.tsx` — added `executionTemplateStatuses` and `instrumentVisit` props; threaded into `TagDetailScreen` for the per-template badges and into `ServiceReportScreen` for the "Resumo da visita" panel. The Compare screen (`ServiceHistoryScreen`) now consumes `priorReadings` and renders the per-point "Leituras anteriores neste ponto" panel. New helpers: `selectPriorReadingsForPoint`, `formatPriorReadingDate/Number/Deviation`, `formatPriorReadingResultLabel`, `mapPriorReadingResultSeverity`, `resolveTemplateStatusBadge`, `visitAcceptanceLabel/Severity`, `formatVisitMeasurementLine`. New styles: `priorReadingCard/Header/Date/Value/Subtitle/Note` and `visitTemplateRow/Header/Title/Line/Note`.
- `mobile/src/features/visual-shell/visualWorkflow.test.ts` — fixture updated to include `priorReadings: []` so the test harness still compiles against the enriched `LocalTagContext` shape.

## Visit summary observation-note augmentation

The augmentation block is rendered between fixed markers so re-submission rewrites it in place rather than stacking copies:

```
---VISIT-SUMMARY-START---
Tag PT-101: 2 teste(s) nesta visita.
- Pressure transmitter as-found template [OK]: esperado 5 bar, medido 5.02 bar desvio +0.02 bar (+0.20% span)
- Pressure transmitter as-left template [FALHA]: esperado 5 bar, medido 8 bar desvio +3 bar (+30.00% span)
---VISIT-SUMMARY-END---
```

This lands inside `shell.evidence.observationNotes`, flows through `saveGuidanceEvidence`, and is part of the per-tag report draft payload. The supervisor sees the block in their review queue, the AI prompt builder reads it as part of the canonical report content, and there is no backend schema change required.

## Validation

- `mobile/`: `npx tsc --noEmit` — clean.
- `mobile/`: `npx vitest run` — **190 / 190** tests passing across 32 files (was 186 before this story; +4 new tests).
- `backend/`: `npx tsc --noEmit` — clean.
- `backend/`: `npm test` — **99 passing + 1 env-gated skip / 100**.

## What the next phone test should reveal

1. **Compare screen — multi-point history.** Open PT-101, then "Avancar para Comparacao". With the 4-20 mA conversion available, the point chips (0% / 25% / 50% / 75% / 100%) should each show 4 prior readings, with 75% showing the documented drift (0.01 → 0.06 → 0.10 → 0.12 bar across 2025-11 → 2026-03). The 2026-02 entry should carry a technician note and the 2026-03 entry should carry both a technician note and a supervisor note. AI-330's 50% point should show recurring mid-range drift. LT-410's 75-90% should show building upper-range bias. TT-205 should look steady. XV-402 only has 3 stroke checkpoints (Fechado / Meio curso / Aberto) and should not surface 5-point chips.
2. **Detail screen — test status badges.** After saving a calculation for template A, navigating back to detail should show template A's row with a "Concluido" / "Falha" badge depending on the acceptance, while template B and C should still show "Iniciar". Repeating with template B should leave both A and B with their respective badges. Closing and reopening the tag should preserve the badges.
3. **Report screen — Resumo da visita.** After running 2+ tests on a tag, opening the Report screen should show a "Resumo da visita" section above "Resumo automatico" listing every saved test with its acceptance and measurement. Submitting the report should leave the augmentation block visible in the supervisor review.
4. **Supervisor side.** Approving a report whose observation notes contain `---VISIT-SUMMARY-START---` should display the block verbatim in the supervisor review detail. The AI prompt input (when AI is requested) should include the visit summary as part of the report content.

## Known carry-overs / risks

- The augmentation is applied at submit time only; if the technician saves and re-opens before submission, the visit summary doesn't appear in observation notes until the submit moment (it does appear in the Resumo da visita panel rendered live from `instrumentVisit`). Acceptable: the user-facing "ONE relatorio" cue is the panel, not the raw notes.
- `loadVisitForTag` calls `loadShell` once per saved template. For tags with many templates this is N database round-trips; in practice TagWise tags carry 2-3 templates so this is fine. If a tag ever carried 10+ templates we'd want to add a bulk projection method.
- The deduplicated risk items in the aggregate use the risk-item id; if two templates emit a different message for the same id (unlikely in practice — the id encodes the rule, not the prose), the first one wins.
- The valve XV-402's `pointLabel` values are PT-BR (`Fechado` / `Meio curso` / `Aberto`) while the linear instruments use `0% / 25% / 50% / 75% / 100%`. The Compare screen's chip filter is keyed on `pointPercent`, so this asymmetry is harmless; the point chips for XV-402 will simply read `0% / 50% / 100%` while the per-point cards show the PT-BR labels.

## Suggested validation order

1. Backend live: `npm run dev` in `backend/`, verify the work-package endpoint returns `priorTestReadings` in the snapshot.
2. Mobile: rebuild the APK once and run through the 4 phone-test checks above.
3. If all pass, mark Story 8.11 done. Otherwise capture the screen + behaviour gap and feed to a QA pass before iterating again.
