# Story 8.6: Live Phone Guided Workflow, Test Pattern, PT-BR, and Submission UX Repair

Status: ready-for-review

## Metadata

- Story key: 8-6-live-phone-guided-workflow-test-pattern-pt-br-and-submission-ux-repair
- Epic: Epic 8 live phone repair continuation
- Release phase: Live APK field-usability repair
- Created: 2026-05-10
- Source QA: real phone/manual testing after Epic 8 and the live APK product-blocking UX hotfix
- Predecessors:
  - `_bmad-output/implementation-artifacts/8-1-mobile-visual-product-shell-and-technician-demo-flow.md`
  - `_bmad-output/implementation-artifacts/8-2-reconnect-visual-shell-to-real-instrument-catalog-qr-and-selection-state.md`
  - `_bmad-output/implementation-artifacts/8-3-reconnect-visual-shell-to-real-technical-execution-flow.md`
  - `_bmad-output/implementation-artifacts/8-4-reconnect-visual-shell-to-real-report-evidence-photos-ai-diagnosis.md`
  - `_bmad-output/implementation-artifacts/8-5-reconnect-role-aware-supervisor-approval-queue-and-decisions.md`
  - `_bmad-output/implementation-artifacts/epic-8-live-apk-product-blocking-ux-hotfix.md`

## User Story

As a field technician using TagWise on a real phone,
I want the app to guide me through the correct PT-BR test flow for the selected instrument and template,
so that I can execute, calculate, compare, justify, attach evidence, submit, and recover from sync issues without hunting through confusing screens or fake/demo behavior.

## Context

Epic 8 restored the dark visual shell and reconnected the authenticated production flow to service-backed catalog, QR, execution, report/evidence/sync, AI Diagnosis projection, and supervisor review. A follow-up live APK hotfix removed signed-out operational demo behavior, added work-package download/open paths, added local manual instrument intake, improved PT-BR coverage, and added a standalone field calculator plus a loop-test helper.

Manual phone testing still fails product usability. The remaining defects are not visual polish only. They affect the real technician workflow:

`tag/instrument -> select test -> execute correct test pattern -> calculate/compare -> checklist/guidance -> evidence/photos -> report -> submit/sync -> supervisor review`

The MVP and project instructions require a short tag-centered workflow, offline-first execution, sync-later reporting, lightweight guidance, nonblocking missing-data handling, and PT-BR field language. The MVP PDF explicitly frames the flow as tag -> calculo -> comparacao -> diagnostico -> checklist/boa pratica -> relatorio, with reports generated from work already done and missing data shown as context/justification instead of a dead end.

This story is necessary because automated tests passed while real phone use still showed confusing navigation, wrong placement of loop testing, generic test screens, mixed English/PT-BR, hard-to-find evidence actions, weak submit/sync feedback, scroll/keyboard problems, and report/supervisor count inconsistencies.

## Scope

In scope:

- Mobile app authenticated production UX only.
- Keep the dark service-backed shell as the single production surface.
- Repair test selection so choosing a template opens its correct execution flow immediately.
- Make execution staged and test-pattern-aware rather than one generic large measurement screen.
- Move the complete loop-test workflow out of the standalone calculator and into instrument execution when the selected template/test pattern requires it.
- Keep a standalone field calculator available from the dashboard and as an in-execution helper.
- Add calculator result apply-to-test behavior where feasible without creating a second execution engine.
- Add missing conversion support, including PV -> %, when range and signal metadata are available.
- Fix compare/history semantics so it compares selected points/variables instead of showing unrelated acceptance cards.
- Translate visible production copy in these flows to PT-BR presentation labels.
- Make checklist/guidance/reference content first-class in the selected test workflow.
- Make report pending items clickable and guide the user to resolve or justify them.
- Improve evidence/photo discoverability.
- Make AI Diagnosis messaging field-friendly, PT-BR, report-level, optional, and nonblocking.
- Improve submit/sync feedback, token/network error copy, and retry/re-auth actions.
- Fix supervisor queue/status counters and post-decision feedback.
- Fix route scroll-to-top and keyboard avoidance for long forms.

Out of scope:

- Do not implement a new backend contract unless an existing API cannot support the repair through a tiny adapter.
- Do not build a second execution, report, sync, review, or AI engine inside visual components.
- Do not create screenshot-only mock/demo production behavior.
- Do not reintroduce PT-204, `seededTags[0]`, visual-only lifecycle state, or static screenshot fallback in authenticated flow.
- Do not move OpenAI/API keys or provider calls into mobile.
- Do not claim backend manual-instrument reconciliation if it is not implemented.
- Do not add reviewer offline approval authority.
- Do not rewrite the full app navigation architecture unless a small local route helper cannot solve scroll/step-state issues.
- Do not make perfect backend fixture data the main story deliverable; seed/fixture data can be a small support task only if it uses service-backed, integration-shaped paths.

## Acceptance Criteria

### A. Test-pattern routing and staged execution

1. Selecting a test/template from the instrument detail screen immediately opens that test's execution flow.
   - The user does not need to tap the instrument card again after selecting a test.
   - The selected `workPackageId`, `tagId`, and `templateId` are preserved.
   - The flow loads through `SharedExecutionShellService.loadShell`; visual route state must not become the execution source of truth.
   - Test/template labels visible to the user are PT-BR.

2. Different tests route to different execution screens or stages according to template/test-pattern metadata.
   - Loop verification opens loop execution.
   - Single-point/basic calibration opens a single expected/measured flow.
   - Checklist-only/procedure-oriented tests open checklist/guidance first.
   - Unsupported or unknown patterns show a PT-BR fallback that explains the limitation and still permits notes/evidence/report where existing services allow it.

3. Execution is staged and phone-usable.
   - Stages are short and understandable: `Contexto`, `Teste`, `Medicoes`, `Comparacao`, `Checklist`, `Evidencias`, `Relatorio`, `Enviar`.
   - The user always sees where they are, what is next, what is pending, and how to go back.
   - Long walls of cards are split into smaller sections or route steps.
   - Next/back/proceed actions are obvious and near the current task, with a persistent footer where useful.

### B. Calculator versus instrument tests

4. The complete loop test is no longer a standalone calculator feature.
   - The standalone calculator may keep loop-related conversion helpers, but the 5/10-point loop execution belongs to the selected instrument test pattern.
   - Loop execution defaults to 5 points and allows 1 to 10 points where the template supports editing.
   - The user can choose PV or mA input mode.
   - Each point shows expected value, measured value, PV/mA/% where applicable, error, tolerance, and pass/fail.
   - The loop summary clearly shows approved/failure/pending status.

5. The standalone calculator remains available offline from the dashboard.
   - It can be used without a selected instrument.
   - It supports PV -> mA, mA -> PV, mA -> %, % -> mA, PV -> %, expected vs measured, absolute error, error %, tolerance, and pass/fail where inputs allow it.
   - It does not require network.

6. Calculator helper is available during execution.
   - When opened from a selected tag/test, it can prefill range, unit, signal, and tolerance from local tag/template metadata.
   - The user can override variable/range/unit.
   - A calculated result can optionally be applied to a selected test input.
   - The apply flow asks which test/template, which point when applicable, and which field to fill. It must not assume 50% automatically.
   - Applying a calculator result updates the existing execution input state and saves through existing execution paths when the user saves the test.

### C. Conversion availability and PV/% support

7. Conversion availability is accurate and explainable.
   - PV -> mA, mA -> PV, mA -> %, % -> mA, and PV -> % work whenever range plus signal basis are known.
   - For 4-20 mA / HART / analog loop metadata, conversion uses deterministic local formulas.
   - For non-analog instruments or missing metadata, the app explains in PT-BR why conversion is unavailable and what data is missing.
   - The UI must not show generic "metadata unavailable" when range and signal data exist.

8. Conversion logic remains service-backed/deterministic.
   - Reuse or extend existing visual-shell conversion adapters and deterministic calculation helpers.
   - Do not duplicate calculation truth inside `VisualProductShell`.
   - Add tests for PV -> % and unavailable-reason mapping.

### D. Compare/history semantics

9. Compare screen focuses on historical comparison for a selected measurement point or variable.
   - For loop tests, the user can select 0%, 25%, 50%, 75%, 100%, or any available configured point.
   - For non-loop tests, the user can select the relevant variable/result if more than one exists.
   - The screen shows timeline/history rows for the selected point: date, expected value, measured value, mA/PV/% where applicable, error, and pass/fail.
   - If no point-level history exists, show `Sem dados suficientes para grafico` or equivalent PT-BR copy.
   - Do not render unrelated generic acceptance cards such as "Pass (Tolerance is...)" on the compare page.

10. History/freshness remains explicit and nonblocking.
    - Missing, stale, unavailable, and age-unknown states are distinct.
    - The user can continue to checklist/report with visible risk/justification rather than being trapped.

### E. Checklist, guidance, PT-BR, and reference content

11. Production visible UI in the affected flows is PT-BR-first.
    - Translate dashboard action labels, test titles, calculation labels, conversion messages, history summaries, acceptance labels, checklist prompts, why-it-matters copy, helps-rule-out copy, guidance summaries, reference labels, report summaries, sync messages, AI messages, and supervisor review feedback.
    - Internal code enums and integration IDs may remain English.
    - Presentation mappers should translate integration-shaped/source text without corrupting source records.

12. Checklist is part of the selected test model.
    - `Checklist tecnico` is available as a first-class test step/option near test selection.
    - Checklist items show the applicable procedure, best-practice, or normative reference source.
    - If the source is an internal reference such as `TAGWISE-BP-PT-001`, also show a readable PT-BR explanation of what that reference means.
    - Guidance must come from local template/reference data where available. Hardcoded text is allowed only as presentation fallback for explaining missing local data, not as production guidance truth.

13. Saving checklist, observations, and justifications gives visible feedback.
    - Successful save shows a confirmation near the current view and a next action, such as `Checklist salvo localmente. Proximo: adicionar evidencia ou gerar relatorio.`
    - Save failure explains recovery in PT-BR.
    - Risk justification and observation fields must not silently refuse typing.

### F. Report, evidence, AI, and submission UX

14. Evidence/photo actions are easy to find.
    - The report/evidence step clearly shows `Adicionar foto`, `Escolher da galeria`, added attachments/evidence, minimum evidence, and expected evidence.
    - If photos or evidence are required/expected, the UI shows exactly where to add them.
    - Camera denial/cancel remains nonblocking with PT-BR recovery guidance.

15. Pending report items are actionable.
    - Pending items are clickable/tappable and navigate to the screen or step that can resolve or justify them.
    - If a minimum evidence item truly blocks final submission under existing service validation, explain why and provide the action to add evidence.
    - Expected evidence, stale history, incomplete checklist, and other noncritical gaps request justification and allow report generation/submission where existing minimum-submission rules allow it.
    - `Continuar para relatorio` and submit buttons must not look disabled without a visible reason.

16. Report summary layout is readable on phone.
    - Long report summary content uses vertical layout: section title above, content below.
    - Do not use a squeezed two-column label/content row for long summaries.
    - Labels are PT-BR and content wraps cleanly above Android navigation overlays.

17. AI Diagnosis message is user-friendly and nonblocking.
    - If no AI result exists, show PT-BR field copy such as: `Diagnostico de IA ainda nao disponivel. O relatorio pode ser enviado normalmente. Quando houver conexao, o sistema podera gerar uma analise assistiva com base nos dados coletados.`
    - If AI can be requested/refreshed through an existing service boundary, show the action.
    - If AI is disabled/unavailable, explain simply.
    - Do not fake AI output.
    - AI remains report-level and never blocks draft save, submit, sync, calculation, checklist, or approval.

18. Submission behavior follows the nonblocking product rule without bypassing service validation.
    - Do not silently disable submit.
    - For allowed incomplete/noncritical items, request justification and permit local queueing.
    - For true minimum-submission blockers, explain the blocker and navigate to the evidence/checklist step that resolves it.
    - Offline/queued submission stays local and visible.
    - Technician submit never routes to supervisor approval.

19. Submit and sync feedback appears where the user can see it.
    - After `Enviar para fila local`, show confirmation near the current view or navigate/scroll to a status area automatically.
    - Sync/network/token errors are translated and actionable.
    - Example token-expiry copy: `Sessao expirada. O relatorio ficou salvo no aparelho e sera reenviado apos novo login/conexao.`
    - Offer actions where applicable: `Tentar sincronizar novamente`, `Fazer login novamente`, `Ver fila local`.
    - Reports/evidence are never lost because the phone changes network.

### G. Supervisor queue/status feedback

20. Supervisor queue counters match queue contents.
    - Pending, returned, approved, escalated, rejected/closed groups use service-backed lifecycle data.
    - Tab counters update after refresh and after approve/return/escalate decisions.
    - Empty states are PT-BR and distinguish "no reports in this group" from connection/API failures.

21. Review decisions give explicit feedback.
    - Approve success: `Relatorio <tag> aprovado.`
    - Return success: `Relatorio <tag> devolvido ao tecnico com comentario.`
    - Escalate success: `Relatorio <tag> escalonado para gerente.`
    - Queue/detail refreshes after backend acceptance.
    - Network/server errors do not fake decision success.

### H. Scroll, keyboard, and navigation usability

22. Every route/screen transition starts at top on phone.
    - Opening test, compare, checklist, report, manual instrument, calculator, technician reports, supervisor review, and review detail scrolls to top.
    - This must work with the current React Native `ScrollView` implementation or a small ref/helper.

23. Long text inputs avoid keyboard overlap.
    - Manual instrument fields, reason, notes, risk justification, observations, technician report notes, supervisor return comments, and escalation rationales remain visible while typing.
    - Use `KeyboardAvoidingView`, `ScrollView` focus handling, or the existing React Native primitives already in the app.

24. Android bottom navigation does not cover important actions/content.
    - Add bottom padding/safe area where needed.
    - Persistent footers should remain usable above the system navigation area.

### I. Sync/network recovery messages

25. Network and token recovery is explicit.
    - After network change, failed sync must preserve queued local work and explain next retry.
    - If auth token is expired and refresh/re-login is required, show PT-BR message and action.
    - If backend is unreachable from the phone, explain phone/backend network reachability in user language, not raw technical stack text.
    - Use existing auth/session/sync services; do not invent a new sync queue.

## Tasks / Subtasks

- [ ] Confirm current live-phone defects and preserve service-backed boundaries (AC: all)
  - [ ] Reproduce the current code paths behind the user's screenshots and notes before editing.
  - [ ] Verify the active production route is still the authenticated dark shell.
  - [ ] Confirm signed-out operational demo remains disabled by default.
  - [ ] Add a short implementation note to the Dev Agent Record explaining which defects were fully fixed, partially fixed, or deferred.

- [ ] A. Implement test-pattern routing and staged execution (AC: 1-3)
  - [ ] Replace template-row behavior in `VisualProductShell` so choosing a template loads the shell and routes to the correct execution stage immediately.
  - [ ] Add a pure test-pattern projection under `mobile/src/features/visual-shell/` that maps local template metadata to visual execution route/stage type.
  - [ ] Use `SharedExecutionShellService.loadShell` and existing `TagWiseApp` handlers for shell loading.
  - [ ] Add stage navigation and next/back/proceed actions for context, test, measurement, compare, checklist, evidence, report, and submit.
  - [ ] Add fallback stage for unknown patterns that explains the limitation without losing notes/evidence/report access.

- [ ] B. Move loop test into instrument execution and keep calculator standalone (AC: 4-6)
  - [ ] Move complete loop-test UI/state from standalone calculator into the loop test execution stage.
  - [ ] Keep calculator conversions and error helper available from dashboard.
  - [ ] Add an in-execution calculator/helper entry point prefilled from selected tag/template.
  - [ ] Add apply-result-to-test flow that asks target test and target point/field before updating execution inputs.
  - [ ] Ensure loop test state persists through existing local execution/report paths instead of standalone visual-only state.

- [ ] C. Extend conversion support (AC: 7-8)
  - [ ] Add PV -> % support to the conversion model and UI.
  - [ ] Fix conversion availability detection so known range/signal metadata does not produce false unavailable states.
  - [ ] Add PT-BR unavailable reasons for non-analog or incomplete metadata.
  - [ ] Keep formulas deterministic and covered by unit tests.

- [ ] D. Repair compare/history semantics (AC: 9-10)
  - [ ] Add point/variable selector for loop and non-loop comparisons.
  - [ ] Project point-level history rows where local history supports them.
  - [ ] Show explicit insufficient-data state when point-level history is missing.
  - [ ] Remove unrelated acceptance/availability cards from the compare screen.
  - [ ] Preserve stale/missing/age-unknown history status and risk justification handoff.

- [ ] E. Complete PT-BR/checklist/guidance/reference UX (AC: 11-13)
  - [ ] Add presentation label mappers for remaining English service text in active production flows.
  - [ ] Translate visible checklist/guidance/reference/sync/report/review messages without changing internal IDs/enums.
  - [ ] Make checklist a first-class step reachable from test selection and staged execution.
  - [ ] Show source reference plus readable PT-BR explanation for internal guidance IDs.
  - [ ] Add save confirmations and recoverable error messages for checklist, observations, and risk justifications.

- [ ] F. Repair report/evidence/AI/submission UX (AC: 14-19)
  - [ ] Rework report summary layout into vertical cards/sections for long content.
  - [ ] Add clear evidence/photo action area and attachment list.
  - [ ] Make pending items tappable and route to the right resolution/justification step.
  - [ ] Replace provider/internal AI copy with user-friendly PT-BR nonblocking copy.
  - [ ] Fix submit button/readiness behavior so true blockers explain action, while allowed noncritical gaps request justification and proceed.
  - [ ] Show submit/sync feedback near the current view or navigate/scroll to visible status.
  - [ ] Translate token/network/sync errors and offer retry/re-auth/local-queue actions.

- [ ] G. Repair supervisor queue/status feedback (AC: 20-21)
  - [ ] Ensure visual queue tab counters derive from the same grouped list content.
  - [ ] Refresh queue/detail after approve, return, and escalate.
  - [ ] Add PT-BR success/failure feedback for review decisions.
  - [ ] Preserve technician RBAC denial and connected-required official decision rule.

- [ ] H. Fix scroll, keyboard, and phone ergonomics (AC: 22-24)
  - [ ] Add route transition scroll-to-top helper for the active shell `ScrollView`.
  - [ ] Add keyboard avoidance/focused-field visibility for manual instrument, report notes, justifications, observations, and review comments.
  - [ ] Add bottom padding/safe-area handling so Android navigation does not hide final cards/actions.
  - [ ] Keep buttons close to the task through local action rows or persistent footers.

- [ ] I. Add focused tests and update artifact record (AC: all)
  - [ ] Add tests for template selection routing to correct test pattern.
  - [ ] Add tests for loop test execution model and persistence path.
  - [ ] Add tests for standalone calculator apply-to-test flow.
  - [ ] Add tests for PV -> % and conversion unavailable reasons.
  - [ ] Add tests for compare point-selection projection.
  - [ ] Add PT-BR visible label mapping tests for active production flows where practical.
  - [ ] Add tests for pending-item navigation and nonblocking/true-blocker submit behavior.
  - [ ] Add tests for supervisor queue counter consistency.
  - [ ] Add tests for route scroll-to-top if feasible at component/helper level.
  - [ ] Add tests for sync/token error message mapping.
  - [ ] Update this story's Dev Agent Record after implementation.

## Dev Notes

### Architectural Guardrails

- Visual shell remains presentation-only in authenticated production flows.
- Do not create another execution/report/sync/review state machine in `VisualProductShell`.
- Use existing local-first/domain/application services:
  - `SharedExecutionShellService` for load/select/save calculation, guidance evidence, report draft, evidence attachment, and submit.
  - `LocalTagContextService` and downloaded package snapshots for tag context/range/tolerance/reference data.
  - `SyncStateService` / evidence upload orchestration for sync status, retry, and recovery.
  - `SupervisorReviewService` for review queue/detail/approve/return/escalate.
- Offline technician execution remains mandatory.
- Approval remains connected/server-authoritative.
- AI remains report-level, optional, and nonblocking.
- Missing data should be visible and justifiable, not disguised and not a dead end.

### Current Code Intelligence

- `mobile/src/shell/VisualProductShell.tsx` currently has local visual routes such as `detail`, `calculation`, `history`, `diagnosis`, `report`, `review`, `manual-intake`, `calculator`, and `reports`.
- `openRoute(nextRoute)` only sets route/message; it does not scroll to top.
- Template rows in the detail screen currently call `onSelectExecutionTemplate(template.id)` and stay on detail; the user then has to use another action to open calculation/history/report.
- `FieldCalculatorScreen` currently includes a full `Teste de loop` section. This story must move complete loop-test execution into selected instrument/test flow and leave the calculator as a helper.
- `mobile/src/features/visual-shell/fieldCalculator.ts` supports PV <-> mA, mA <-> %, % -> mA, and error helper, but PV -> % and error % need explicit support.
- `mobile/src/features/visual-shell/serviceBackedExecution.ts` conversion modes currently include process-to-mA, mA-to-process, mA-to-percent, and percent-to-mA. Add process/PV-to-percent where metadata permits.
- `mobile/src/features/visual-shell/serviceBackedReport.ts` currently gates `canSubmit` on service readiness. This story must improve the user-facing distinction between true minimum blockers and noncritical pending items without bypassing service validation.
- `mobile/src/features/execution/sharedExecutionShellService.ts` is the service boundary for save/submit. If submit logic needs to accept noncritical justifications, change that service intentionally with tests; do not merely enable a visual button.
- Several source fields from template/history/guidance/report services may be English or integration-shaped. Use presentation translation/mapping instead of mutating canonical stored data.

### Likely Files / Modules To Inspect

- `mobile/src/shell/VisualProductShell.tsx`
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/src/features/visual-shell/serviceBackedExecution.ts`
- `mobile/src/features/visual-shell/serviceBackedExecution.test.ts`
- `mobile/src/features/visual-shell/serviceBackedReport.ts`
- `mobile/src/features/visual-shell/serviceBackedReport.test.ts`
- `mobile/src/features/visual-shell/serviceBackedReview.ts`
- `mobile/src/features/visual-shell/serviceBackedReview.test.ts`
- `mobile/src/features/visual-shell/fieldCalculator.ts`
- `mobile/src/features/visual-shell/fieldCalculator.test.ts`
- `mobile/src/features/visual-shell/technicianReports.ts`
- `mobile/src/features/visual-shell/technicianReports.test.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `mobile/src/features/execution/localExecutionTemplateRegistry.ts`
- `mobile/src/features/work-packages/manualInstrumentService.ts`
- `mobile/src/features/sync/syncStateModel.ts`
- `mobile/src/features/sync/syncStateService.ts`
- `mobile/src/features/review/supervisorReviewService.ts`
- `mobile/src/features/review/supervisorReviewApiClient.ts`

### Data / Fixture Guidance

- If additional test data is needed, keep it integration-shaped and service-backed.
- Do not use screenshot/demo visual records as authenticated production truth.
- Seed/fixture additions should help exercise real states: draft, pending sync, submitted/pending review, returned, approved, escalated.
- If backend seed work becomes necessary, keep it small and run backend validation. Otherwise keep this story mobile-only.

### Risks

- This is a broad repair story because the live phone workflow still fails usability even after code QA. Keep changes disciplined by service boundary and acceptance area.
- The main product risk is delivering another set of screens that passes tests but still makes the technician hunt for the next action.
- The main architecture risk is moving business truth into visual components.
- The main workflow risk is weakening submission validation while trying to avoid hard-blocking. Preserve true minimum blockers and make noncritical gaps justifiable.
- The main demo risk is insufficient service-backed data for returned/approved/escalated states. If data is missing, document it and propose a seed-data follow-up instead of faking states.

## Validation

Run from repo root unless noted:

```powershell
cd mobile
npm run typecheck
npm test
npx expo-doctor
cd ..
git diff --check
```

If backend contracts, backend seed data, or backend API behavior are touched:

```powershell
cd backend
npm run typecheck
npm test
```

Recommended focused tests:

- Test selection routes to the correct test pattern immediately.
- Loop test point model defaults to 5 points and supports up to 10.
- Standalone calculator remains usable without a selected tag.
- Calculator result can be applied to a selected test/point/field.
- PV -> %, PV -> mA, mA -> PV, mA -> %, and % -> mA conversions work when metadata exists.
- Unsupported conversion returns PT-BR unavailable reason.
- Compare/history projection supports selected point/variable and insufficient-data state.
- PT-BR visible label mappings cover active production calculation, guidance, report, sync, review, and AI messages.
- Checklist/observation/risk save shows confirmation or recoverable error.
- Pending report items navigate to resolution/justification steps.
- Submission distinguishes true minimum blockers from justifiable noncritical pending items.
- AI Diagnosis unavailable message is user-friendly and nonblocking.
- Supervisor queue counters equal grouped list counts.
- Review decision success/failure feedback is explicit.
- Route transition scroll-to-top helper works where testable.
- Sync/token/network error mappings are PT-BR and recoverable.

## Manual Phone Smoke Checklist

Run after rebuilding and reinstalling the APK. Do not mark this story done from product QA without physical phone smoke.

1. Login as technician with backend reachable.
2. Open assigned package/tag.
3. Select each available test and confirm the correct flow opens immediately.
4. Run a loop test with 5 points.
5. Change loop test to 10 points.
6. Use mA input mode and PV input mode.
7. Use standalone calculator from dashboard without selected instrument.
8. Open calculator during execution and prefill selected tag range/unit.
9. Apply calculator result to a chosen test point/field.
10. Open compare, select 50% or another point, and verify timeline or `sem dados suficientes`.
11. Complete checklist in PT-BR.
12. Save checklist/observations and see confirmation plus next action.
13. Add photo/evidence from the report/evidence step.
14. Tap a pending item and confirm it navigates to the fix/justification step.
15. Submit report with noncritical pending items using justification.
16. Confirm queued/sync feedback appears without scrolling to top.
17. Change network, return to backend Wi-Fi, and retry sync.
18. Confirm token/network errors are PT-BR and do not lose local report/evidence.
19. Login as supervisor.
20. Verify queue counters match tab/list contents.
21. Return a report with comment and see explicit feedback.
22. Login as technician and see returned report needing correction.
23. Open manual instrument screen and confirm keyboard does not cover reason/notes fields.
24. Confirm Android bottom navigation does not cover final actions.

## Source References

- `docs/MVP/TagWise_Project_Instructions.txt`
- `docs/MVP/TagWise.pdf`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/story-map.md`
- `_bmad-output/planning-artifacts/visual-shell-service-backed-adapter-decision.md`
- `_bmad-output/implementation-artifacts/8-1-mobile-visual-product-shell-and-technician-demo-flow.md`
- `_bmad-output/implementation-artifacts/8-2-reconnect-visual-shell-to-real-instrument-catalog-qr-and-selection-state.md`
- `_bmad-output/implementation-artifacts/8-3-reconnect-visual-shell-to-real-technical-execution-flow.md`
- `_bmad-output/implementation-artifacts/8-4-reconnect-visual-shell-to-real-report-evidence-photos-ai-diagnosis.md`
- `_bmad-output/implementation-artifacts/8-5-reconnect-role-aware-supervisor-approval-queue-and-decisions.md`
- `_bmad-output/implementation-artifacts/epic-8-live-apk-product-blocking-ux-hotfix.md`

## Story Creation Notes

- This story intentionally groups the remaining live phone defects into one implementation story because they are tightly coupled in the same field workflow: test selection, execution pattern, compare semantics, checklist, evidence, report submission, sync feedback, and phone ergonomics.
- The story is broad, but splitting it before repairing the end-to-end phone path would risk another pass where every individual piece is "done" while the phone workflow still feels broken.
- The dev agent should implement the smallest service-backed version of each area, document partial/deferred items honestly, and avoid hiding gaps behind visual-only UI.
- Completion requires automated validation and real phone smoke after APK rebuild.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `cd mobile && npm run typecheck`
- `cd mobile && npm test`
- Focused tests:
  - `src/features/visual-shell/executionFlow.test.ts`
  - `src/features/visual-shell/fieldCalculator.test.ts`
  - `src/features/visual-shell/serviceBackedExecution.test.ts`
  - `src/features/visual-shell/serviceBackedReport.test.ts`
  - `src/features/visual-shell/serviceBackedReview.test.ts`

### Completion Notes List

- Implemented service-backed test-pattern routing with `executionFlow.ts`; selecting a template now loads `SharedExecutionShellService.loadShell` through `TagWiseApp` and routes directly to loop, single-point calculation, or checklist guidance.
- Moved the complete loop-test workflow into the selected instrument execution route (`loop-test`) with 5 default points, 1-10 point support, PV/mA modes, per-point conversion/error/pass-fail, summary, and local evidence-note save through existing guidance evidence persistence.
- Kept the standalone calculator as a general offline helper, added PV -> %, error-percent output, and an apply-to-test flow that asks the target field/point instead of assuming 50%.
- Reworked compare/history projection to support selectable loop points and explicit PT-BR insufficient-data states.
- Added staged execution navigation (`Contexto`, `Teste`, `Pontos/Medicoes`, `Comparar`, `Checklist`, `Evidencias`, `Relatorio`, `Enviar`) and route scroll-to-top behavior for the active dark shell.
- Improved PT-BR presentation mapping for calculation, history, guidance, report, sync, AI unavailable copy, and supervisor decision feedback without mutating source/integration data.
- Reworked report UX with vertical summary blocks, visible evidence/photo action guidance, pending-action cards that navigate to the resolving step, and explicit blocked-submit explanation.
- Supervisor queue tabs now use grouped count projections; approve/return/escalate success messages are PT-BR and queue refresh is attempted after accepted decisions.
- Added global `KeyboardAvoidingView` wrapping and larger bottom padding for long phone screens and Android navigation overlap.
- Deferred: physical APK/phone smoke was not executed in this environment.
- Deferred/partial: full backend manual-instrument reconciliation remains backlog; full returned-report revision/version workflow remains backlog; sync recovery still uses existing auth/session/sync services with clearer PT-BR messages rather than a new refresh-token flow.

### File List

- `mobile/src/features/visual-shell/executionFlow.ts`
- `mobile/src/features/visual-shell/executionFlow.test.ts`
- `mobile/src/features/visual-shell/fieldCalculator.ts`
- `mobile/src/features/visual-shell/fieldCalculator.test.ts`
- `mobile/src/features/visual-shell/serviceBackedExecution.ts`
- `mobile/src/features/visual-shell/serviceBackedExecution.test.ts`
- `mobile/src/features/visual-shell/serviceBackedReport.ts`
- `mobile/src/features/visual-shell/serviceBackedReport.test.ts`
- `mobile/src/features/visual-shell/serviceBackedReview.ts`
- `mobile/src/features/visual-shell/serviceBackedReview.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/src/shell/VisualProductShell.tsx`
- `_bmad-output/implementation-artifacts/8-6-live-phone-guided-workflow-test-pattern-pt-br-and-submission-ux-repair.md`
