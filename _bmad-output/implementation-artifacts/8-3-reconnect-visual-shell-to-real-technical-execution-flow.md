# Story 8.3: Reconnect Visual Shell to Real Technical Execution Flow

Status: ready-for-review

## Metadata
- Story key: 8-3-reconnect-visual-shell-to-real-technical-execution-flow
- Story map ID: Visual Shell Regression Repair Story B
- Epic: Post-8.1 Mobile Visual Shell Repair
- Release phase: Visual Shell Regression Repair
- Created: 2026-05-09
- Source decision: `_bmad-output/planning-artifacts/visual-shell-service-backed-adapter-decision.md`
- Predecessor: `_bmad-output/implementation-artifacts/8-2-reconnect-visual-shell-to-real-instrument-catalog-qr-and-selection-state.md`

## User Story
As a technician using the dark TagWise mobile shell,
I want calculation, conversion, history, checklist, next-step guidance, best practices, and normative references to use the selected local tag and template data,
so that I can execute the technical workflow offline without being routed through screenshot-only visual behavior.

## Context
Story 8.2 restored the service-backed identity foundation: authenticated visual catalog data now comes from downloaded/local packages, QR resolves through `LocalQrScanService`, selected tag identity is preserved, and detail opens the selected local tag context.

The remaining dark-shell execution screens still display static visual model state. The calculator buttons are visual pills, PV <-> mA <-> percent conversion actions do not execute, history rows are static, and diagnosis/checklist/reference content is hardcoded. Before Story 8.1, the older service-backed shell already had real execution handlers around `SharedExecutionShellService`, `DeterministicCalculationEngine`, local history projection, checklist outcomes, observation notes, and risk justifications. This story reconnects the dark technical execution screens to those existing services.

## Scope
In scope:
- Mobile app only. Backend is used only as the already-existing connected smoke dependency for login and package download.
- Reconnect the dark visual calculation, history, and diagnosis/guidance screens to the existing selected `SharedExecutionShell`.
- Ensure calculation inputs save through `SharedExecutionShellService.saveCalculation`.
- Wire PV <-> mA <-> percent helper behavior where selected template metadata/range supports it.
- Render current calculation result, pass/fail, deviation, percent-of-span, expected vs measured, unit, tolerance, and conversion basis from the execution shell.
- Render history comparison and freshness cues from the selected local tag/execution shell state.
- Render deterministic checklist, next step, best-practice, and normative/procedural reference content from selected template/local guidance data.
- Persist checklist outcomes, observation notes, skipped/incomplete risk hooks, and risk justifications through existing execution-shell update/save paths.
- Keep every missing-data condition nonblocking with explicit unavailable/missing labels and risk/justification capture where already supported.
- Add visual-shell adapter/view-model tests proving authenticated screens consume execution shell state instead of visual mock state.

## Out of Scope
- Do not implement report summary editability, report submission, evidence upload, photo capture, AI diagnosis projection, sync submission, supervisor queues, or approval decisions.
- Do not add new backend contracts, seed data, review services, evidence services, or AI provider behavior.
- Do not introduce a new calculation engine or duplicate deterministic formulas in `VisualProductShell`.
- Do not make AI part of the local deterministic diagnosis/checklist step.
- Do not hard-block the technician because history, references, checklist items, or conversion metadata are missing.

## Acceptance Criteria
1. Visual calculation screen is service-backed.
   - It loads from the selected `SharedExecutionShell` created for the Story 8.2-selected `workPackageId`, `tagId`, and `templateId`.
   - It shows template calculation mode, expected/observed inputs, unit, range, tolerance, conversion basis, deterministic result, and pass/fail from the execution shell.
   - It no longer displays hardcoded `model.calculation` values in authenticated flow.

2. Calculation save uses existing domain logic.
   - Editing expected and observed values updates shell-local raw inputs.
   - Saving invokes `SharedExecutionShellService.saveCalculation`.
   - Invalid inputs surface the existing `DeterministicCalculationInputError` message or equivalent nonblocking validation message.
   - Saved results survive route changes and shell reload.

3. Conversion controls work offline.
   - PV <-> mA <-> percent controls are interactive where template range/conversion metadata is available.
   - Conversion math uses selected tag/template range metadata and the 4-20 mA basis where applicable.
   - Unsupported or missing conversion metadata shows a clear unavailable state instead of fake output.
   - Conversion helpers remain deterministic and test-covered; no network call is required.

4. History comparison is local and contextual.
   - History screen renders selected tag history/freshness/current-vs-prior comparison from `executionShell.history` and local tag context.
   - Missing, stale, age-unknown, and unavailable history states remain distinct and nonblocking.
   - Static visual history rows are not used in authenticated flow.

5. Checklist and guidance are template/local-reference backed.
   - Diagnosis/guidance screen renders selected template checklist steps, guided diagnosis prompts, source references, and linked guidance snippets from the local execution shell.
   - "Next step", best-practice, and normative/procedural reference labels are driven by local template/guidance data.
   - The screen does not display AI-style "probable hypothesis" or "why this?" as if it were deterministic local AI output.

6. Checklist outcomes and notes persist through existing services.
   - Technician can mark checklist items, skip/flag items, enter observation notes, and enter required risk justifications where existing shell state requires them.
   - Saving guidance evidence uses `SharedExecutionShellService.saveGuidanceEvidence`.
   - Checklist/risk state survives visual route changes and local shell reload.

7. Technician remains unblocked.
   - Missing history, missing references, incomplete checklist, or unsupported conversion metadata cannot trap the user on a screen.
   - Existing risk flags and justification prompts are visible and editable where intended.
   - The UI explains unavailable local data without falling back to screenshot/demo content.

8. Visual-shell service-backed rule is enforced.
   - Authenticated calculation/history/guidance screens do not consume `model.calculation`, `model.history`, or `model.diagnosis` as production truth.
   - Signed-out demo state may remain explicitly demo-only.
   - Tests fail if authenticated execution screens regress to hardcoded visual values.

9. Validation commands pass.
   - `cd mobile && npm run typecheck`
   - `cd mobile && npm test`
   - `cd mobile && npx expo-doctor`
   - `cd .. && git diff --check`

10. Manual APK smoke validates offline technical execution.
    - With backend reachable, technician signs in and downloads/refreshes a package.
    - Technician opens at least two downloaded tags and selects valid templates.
    - Backend/network is disabled.
    - Calculation inputs and supported conversions work offline for a cached tag.
    - History/freshness state renders from cached data.
    - Checklist/guidance/reference content renders from cached template/local data.
    - Missing data is nonblocking and does not show demo fallback.

## Tasks / Subtasks
- [x] Confirm Story 8.2 identity state before editing (AC: 1, 8)
  - [x] Inspect current `TagWiseApp` props passed into `VisualProductShell`.
  - [x] Confirm selected `workPackageId`, `tagId`, and `templateId` reach `SharedExecutionShellService.loadShell`.
  - [x] Keep all edits inside execution-screen wiring unless a tiny adapter is required.

- [x] Create or extend visual execution adapter/view-models (AC: 1, 4, 5, 8)
  - [x] Project `SharedExecutionShell` calculation, history, guidance, and risk state into visual props.
  - [x] Keep adapters side-effect free under `mobile/src/features/visual-shell/` or reuse existing execution models directly.
  - [x] Remove authenticated reliance on static visual calculation/history/diagnosis data.

- [x] Wire calculation inputs and deterministic save (AC: 1, 2, 7)
  - [x] Pass service-backed calculation input state and handlers from `TagWiseApp` into `VisualProductShell`.
  - [x] Use existing calculation input change and save handlers or their thin adapted equivalents.
  - [x] Surface deterministic calculation errors without crashing or blocking navigation.

- [x] Add template-driven conversion behavior (AC: 3)
  - [x] Derive conversion availability from selected shell/template range and conversion basis.
  - [x] Implement pure helper tests for PV <-> mA <-> percent where metadata exists.
  - [x] Show unavailable state where conversion metadata is insufficient.

- [x] Wire history comparison (AC: 4, 7)
  - [x] Render shell-local current result and cached history/freshness state.
  - [x] Preserve stale/missing/age-unknown/unavailable distinctions.
  - [x] Avoid live history fetches from authenticated field screens.

- [x] Wire deterministic checklist/guidance/reference flow (AC: 5, 6, 7)
  - [x] Render checklist steps and linked guidance snippets from local template/guidance state.
  - [x] Wire checklist outcome, observation note, risk justification, and save-guidance-evidence handlers.
  - [x] Remove AI-style diagnosis copy from the local deterministic guidance path or relabel it as unavailable/report-level only.

- [x] Add focused regression tests (AC: 1-8)
  - [x] Adapter/view-model tests for calculation, history, guidance, risk, and missing-data states.
  - [x] Conversion helper tests for supported and unsupported metadata.
  - [x] Tests that fail if authenticated screens use static visual model data for calculation/history/diagnosis.
  - [x] Tests proving the technician can proceed with missing local history/guidance.

- [x] Validate and update Dev Agent Record (AC: 9, 10)
  - [x] Run required validation commands.
  - [x] Document manual APK smoke path and whether it was physically executed.
  - [x] Confirm no report/evidence/AI/approval work was added.

## Dev Notes

### Architectural Guardrails
- The visual shell is presentation-only in authenticated/production execution.
- Calculation truth belongs to `DeterministicCalculationEngine` and `SharedExecutionShellService`, not `VisualProductShell`.
- Checklist, next-step, best-practice, and normative/procedural references belong to selected template/local guidance data.
- AI diagnosis is not part of this story's deterministic guidance path. AI is report-level and deferred to Story 8.4.
- Missing data is explicit and nonblocking.
- Do not add new dependencies unless existing Expo/React Native primitives cannot cover the UI interaction.

### Previous Story Intelligence
- Story 8.2 changed authenticated visual workflow to use downloaded/local tags and explicit identity. Do not reintroduce PT-204, `seededTags[0]`, or no-argument detail navigation.
- Story 8.2 added `serviceBackedNavigation.ts` and tests. Follow the same pattern for pure visual-shell adapter logic.
- Story 8.2 intentionally left calculator/history/checklist/report/evidence/AI/approval out of scope; this story starts from that identity-safe shell.

### Existing Services / Modules To Reuse
- `mobile/src/features/execution/sharedExecutionShellService.ts`
  - `loadShell(session, workPackageId, tagId, templateId)`
  - `selectStep(session, shell, stepId)`
  - `saveCalculation(session, shell, rawInputs)`
  - `updateChecklistOutcome(shell, checklistItemId, outcome)`
  - `updateObservationNotes(shell, value)`
  - `updateRiskJustification(shell, riskItemId, value)`
  - `saveGuidanceEvidence(session, shell)`
- `mobile/src/features/execution/deterministicCalculationEngine.ts`
  - `computeDeterministicCalculation`
  - `resolveDeterministicCalculationDefinition`
  - `DeterministicCalculationInputError`
- `mobile/src/features/execution/localExecutionTemplateRegistry.ts`
  - template contract, capture fields, conversion basis, checklist steps, linked guidance snippets
- `mobile/src/features/execution/model.ts`
  - shared execution shell, calculation, history, guidance, risk, and report types
- `mobile/src/features/work-packages/localTagContextService.ts`
  - local range, tolerance, history preview, and reference pointers
- `mobile/src/shell/TagWiseApp.tsx`
  - existing execution handlers from the pre-visual shell are still present and should be reused/adapted
- `mobile/src/shell/VisualProductShell.tsx`
  - current visual screen layout to keep, but authenticated production data must come from the services above

### Likely Files / Modules To Inspect
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/src/shell/VisualProductShell.tsx`
- `mobile/src/features/visual-shell/model.ts`
- `mobile/src/features/visual-shell/serviceBackedNavigation.ts`
- `mobile/src/features/visual-shell/visualWorkflow.test.ts`
- `mobile/src/features/execution/model.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `mobile/src/features/execution/deterministicCalculationEngine.ts`
- `mobile/src/features/execution/deterministicCalculationEngine.test.ts`
- `mobile/src/features/execution/localExecutionTemplateRegistry.ts`
- `mobile/src/features/execution/localExecutionTemplateRegistry.test.ts`
- `mobile/src/features/work-packages/localTagContextService.ts`

### Validation / Test Plan
- Unit tests for visual execution adapters/view-models.
- Unit tests for conversion helpers with local range metadata and unsupported metadata.
- Regression tests proving authenticated calculation/history/guidance screens do not use hardcoded visual model values.
- Existing execution service tests should remain green.
- Manual APK smoke must include connected backend for login/package download, then offline calculation/history/guidance execution from cached data.

### Risks
- Copying formulas into `VisualProductShell` would create a second calculator and break Story 3.2 architecture.
- Treating AI-like diagnosis text as local deterministic guidance would violate the AI boundary.
- Making missing guidance/history block field progress would violate the product principle that the app must never hard-block the technician.
- Overloading this story with report/evidence work would make QA too broad; keep report lifecycle for Story 8.4.

### Dependencies
- Story 8.2 done from QA perspective.
- Existing Epic 3 services and tests are the implementation source of truth.
- Backend is required for connected login/package download smoke only; field execution itself must work offline after download.

### References
- `_bmad-output/planning-artifacts/visual-shell-functional-regression-analysis.md`
- `_bmad-output/planning-artifacts/visual-shell-service-backed-adapter-decision.md`
- `_bmad-output/planning-artifacts/architecture.md#Mobile Visual Experience Architecture`
- `_bmad-output/planning-artifacts/architecture.md#Offline / Mobile Architecture`
- `_bmad-output/planning-artifacts/story-map.md#Visual Shell Regression Repair Addendum`
- `_bmad-output/implementation-artifacts/3-2-deterministic-calculation-and-acceptance-engine.md`
- `_bmad-output/implementation-artifacts/3-6-history-comparison-and-freshness-cues.md`
- `_bmad-output/implementation-artifacts/3-7-guided-diagnosis-checklist-and-lightweight-guidance-flow.md`
- `_bmad-output/implementation-artifacts/8-2-reconnect-visual-shell-to-real-instrument-catalog-qr-and-selection-state.md`

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Debug Log References
- `cd mobile; npm run typecheck` - passed.
- `cd mobile; npm test` - passed, 25 files / 140 tests.
- `cd mobile; npx expo-doctor` - passed, 17/17 checks.
- `cd ..; git diff --check` - passed with existing CRLF normalization warnings for `mobile/src/shell/TagWiseApp.tsx` and `mobile/src/shell/VisualProductShell.tsx`.

### Completion Notes List
- Added a side-effect-free visual execution adapter for service-backed calculation, loop conversion, history, and deterministic guidance projections.
- Authenticated dark-shell calculation/history/guidance screens now read from the selected `SharedExecutionShell`; signed-out demo screens remain explicitly demo-only.
- Calculation inputs are passed to the existing `TagWiseApp` handlers and save through `SharedExecutionShellService.saveCalculation`.
- Existing deterministic calculation validation messages now render on authenticated technical screens through the visual shell message path.
- Checklist outcomes, observation notes, risk justifications, and guidance evidence save are wired through existing `SharedExecutionShellService` update/save paths.
- PV/mA/percent conversion controls use local 4-20 mA metadata when available and show unavailable output when metadata is insufficient.
- History/freshness and missing/unavailable states render from shell-local step fields and remain nonblocking.
- AI-style "probable hypothesis" / "why this?" content is not shown in the authenticated deterministic guidance path.
- Report summary/editability, photos/attachments/evidence submission, report-level AI Diagnosis, sync submission, and supervisor approval remain intentionally deferred to Story 8.4 and Story 8.5.
- Manual APK smoke path was documented but not physically executed in this environment:
  1. Start backend in a phone-reachable way for connected technician login/package download.
  2. Sign in as technician and download or refresh an assigned package.
  3. Open at least two downloaded tags and select valid execution templates.
  4. Disable backend/network.
  5. Verify calculation inputs and supported conversions work offline.
  6. Verify cached history/freshness renders from local data.
  7. Verify checklist/guidance/reference content renders from cached local/template data.
  8. Verify missing history/guidance/conversion data shows unavailable/nonblocking state and does not show demo fallback.

### File List
- `mobile/src/features/visual-shell/serviceBackedExecution.ts`
- `mobile/src/features/visual-shell/serviceBackedExecution.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/src/shell/VisualProductShell.tsx`
- `_bmad-output/implementation-artifacts/8-3-reconnect-visual-shell-to-real-technical-execution-flow.md`
