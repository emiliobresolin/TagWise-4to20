# Live Phone Story 8.6 Regression — Root-Cause Analysis

- **Date:** 2026-05-11
- **Author:** Winston (System Architect)
- **Status:** Architect analysis. No runtime code, no implementation story yet.
- **Predecessor analysis:** [`visual-shell-functional-regression-analysis.md`](visual-shell-functional-regression-analysis.md) (2026-05-09)
- **Source evidence:**
  - Story 8.6 spec [`_bmad-output/implementation-artifacts/8-6-...repair.md`](../implementation-artifacts/8-6-live-phone-guided-workflow-test-pattern-pt-br-and-submission-ux-repair.md)
  - Live APK hotfix [`epic-8-live-apk-product-blocking-ux-hotfix.md`](../implementation-artifacts/epic-8-live-apk-product-blocking-ux-hotfix.md)
  - 2026-05-11 regression results [`tests/test-summary.md`](../implementation-artifacts/tests/test-summary.md)
  - Code: `mobile/src/shell/VisualProductShell.tsx`, `mobile/src/shell/TagWiseApp.tsx`, `mobile/src/features/visual-shell/*`, `mobile/src/features/execution/sharedExecutionShellService.ts`, `mobile/src/features/auth/authApiClient.ts`
  - User manual phone findings #1–#12 after Story 8.6.

---

## 1. Executive Summary

Story 8.6 is implemented correctly **at the projection/service layer** but still fails the real phone workflow. Automated tests pass (267 green, 174 mobile + 92 backend + 1 env-gated skip), code review found no blocking defects in the projection logic, yet on-device usability is product-blocking.

**The root cause is structural, not feature-by-feature.** Four overlapping causes — in order of impact:

1. **Touch wiring lives where there are no tests.** Every Story 8.6 AC was satisfied by adding/correcting a *projection function* (`executionFlow.ts`, `fieldCalculator.ts`, `serviceBackedExecution.ts`, `serviceBackedReport.ts`, `serviceBackedReview.ts`). All five projection modules have rigorous unit tests. But the **button labels, the touch targets, and the per-screen navigation** live in `VisualProductShell.tsx` (6,169 lines) which has **zero tests**. The result is mechanical mismatches like "Calcular" wired to the measurement screen, "Template" leaking as a tile label, and a calculator with no Calcular button — none of which are catchable at the projection layer.
2. **In-app navigation is a flat `route` string, not a stage/history model.** The shell stores `route: VisualRoute` as a single `useState` value. There is no navigation history stack, no `BackHandler` registration anywhere in `mobile/src`, no `goHome()`, no logo Pressable. Android hardware back therefore minimizes the app (OS default). "Back" inside the app means whatever each screen's `onBack={() => openRoute('detail')}` literal chose — usually one hop, not history.
3. **Submission rule is wrong at the service boundary.** [`sharedExecutionShellService.ts:1288–1300`](../../mobile/src/features/execution/sharedExecutionShellService.ts#L1288-L1300) treats *every* `justificationRequired` item without text as a hard-block hook, which makes `submitReadiness === 'blocked'` and causes `submitReport()` to throw at [line 612](../../mobile/src/features/execution/sharedExecutionShellService.ts#L612). This contradicts the product rule "never hard-block on noncritical pending items; collect justification and continue."
4. **Mobile API base URL defaults to loopback.** [`authApiClient.ts:21`](../../mobile/src/features/auth/authApiClient.ts#L21) defaults to `http://127.0.0.1:4100`. On a physical phone `127.0.0.1` is the phone itself. Unless the APK was built with `EXPO_PUBLIC_TAGWISE_API_BASE_URL` pointed at a LAN-reachable backend, the device cannot talk to the API — reports queue locally forever and supervisor sees nothing. This is environment/build config, not application code.

The four causes compound. Cause 1 makes every UX repair attempt land in untested territory. Cause 2 makes the resulting screens hard to navigate even when wired correctly. Cause 3 makes the report screen feel "stuck" even when the user did everything right. Cause 4 makes the entire connected half of the workflow look broken even on a device with working software.

**Test/code QA cannot catch any of these without on-device E2E or RN component-tree tests.** Both are currently absent. The user's manual phone findings must therefore be treated as the primary acceptance evidence for the next repair, not as polish.

---

## 2. Current Failure Map

For each finding the user reported after Story 8.6, with observed behavior, expected behavior, code location, root cause, classification, fix direction, and severity.

### Finding #1 — No way back to home; logo not tappable

| Field | Detail |
|---|---|
| Observed | App has no obvious "home" affordance. Tapping the TagWise logo does nothing. |
| Expected | Tap logo → return to dashboard. Logo is the universal home affordance. |
| Code location | [`VisualProductShell.tsx:3947–3952`](../../mobile/src/shell/VisualProductShell.tsx#L3947-L3952) — `TagWiseLogo` is a plain `<Text>`, no `<Pressable>`. |
| Root cause | UX/navigation design flaw. The logo component was never wrapped in a Pressable with `onPress={() => openRoute('dashboard')}`. |
| Classification | UX/navigation design flaw + missing implementation. |
| Fix direction | Wrap `TagWiseLogo` in a Pressable; pass an optional `onPressHome` from the shell; never default to no-op. |
| Severity | **Major.** Field workflow assumes a recoverable home. |

### Finding #2 — Bottom "Calcular" opens the measurement screen, not the calculator

| Field | Detail |
|---|---|
| Observed | Tapping "Calcular" on the instrument detail screen opens the Medições/test page, not a standalone calculator. |
| Expected | "Calcular" opens the standalone calculator (field helper). The measurement/test action should be a different, more semantic label. |
| Code location | [`VisualProductShell.tsx:2271`](../../mobile/src/shell/VisualProductShell.tsx#L2271) — `<ActionTile icon="▦" label="Calcular" onPress={onOpenCalculation} />`. `onOpenCalculation` opens `route='calculation'` (the measurement screen `ServiceCalculationScreen`), not `route='calculator'` (the standalone `FieldCalculatorScreen`). |
| Root cause | Implementation bug — wrong handler wired to the label. The naming collision between "calcular" (verb) and "calculation" (route name) hid the bug. |
| Classification | Implementation bug + label/semantics design flaw. |
| Fix direction | Rename the action: bottom action tiles should be `Medir` / `Iniciar teste` / `Executar` (route → `calculation` or `loop-test` depending on template pattern). A separate `Calculadora` action tile (or quick-access toolbar) opens the standalone helper (route → `calculator`). After a calculation, optionally prompt "Aplicar resultado a um teste?" — the apply-to-test plumbing already exists. |
| Severity | **Blocker.** The bottom action is the primary technician CTA on the instrument page. |

### Finding #3 — Calculator does not behave like a calculator

| Field | Detail |
|---|---|
| Observed | User enters parameters but cannot find a "Calcular" / "Resultado" action. The reactive auto-recompute is unintuitive on phone. |
| Expected | Clear inputs, explicit "Calcular" CTA, prominent visible "Resultado" panel. Loop/error helpers available but not confused with instrument execution. |
| Code location | [`VisualProductShell.tsx:1661–1808`](../../mobile/src/shell/VisualProductShell.tsx#L1661-L1808) — `FieldCalculatorScreen`. The result is computed via `const result = calculateFieldValue(draft)` on every render (line 1686). There is no `Calcular` button, no result-section heading, no celebratory affordance. The result is in a `pendingCard` (line 1776) which visually looks like a *pending warning*, not a result. |
| Root cause | UX/navigation design flaw. Reactive auto-compute is correct internally but does not match a field user's mental model of a calculator. The "result" element is styled as a `pendingCard` which signals "to-do" not "answer." |
| Classification | UX design flaw + visual semantics mismatch. |
| Fix direction | Add an explicit `Calcular` primary button. Replace the `pendingCard` style for the result with a dedicated `resultCard` style — large value, mode label, unit label, copy-to-clipboard optional. Keep the reactive recompute internally but only reveal/highlight on tap. Apply-to-test stays gated behind a clear secondary CTA. |
| Severity | **Major.** Calculator is a high-trust tool; the technician must feel certain of what they computed. |

### Finding #4 — "Template" / "pass-with-note" leak as production UI

| Field | Detail |
|---|---|
| Observed | The instrument page shows tiles/labels with internal terms ("Template" / "necessario") that don't read as PT-BR action words. |
| Expected | All visible labels should be technician-facing PT-BR. Cards should declare what they do, not what their internal id is. |
| Code location | [`VisualProductShell.tsx:2257–2260`](../../mobile/src/shell/VisualProductShell.tsx#L2257-L2260) literally renders `Template` / `necessario` as a result-tile. `pass-with-note` and similar lifecycle enums likely leak via [`SummaryLine`](../../mobile/src/shell/VisualProductShell.tsx#L4443) in the report screen when `report.lifecycleStateLabel` is the raw service string. |
| Root cause | UX design flaw + missing presentation translation at the last mile. The projection layer (`translateVisibleText`, `translateOperationalMessage`) handles most service strings but lifecycle/checklist-outcome enums slip through directly. |
| Classification | UX design flaw + missing label mapping. |
| Fix direction | Replace the "Template/necessario" tile with a guidance card whose label depends on actual state: `Selecione um teste para iniciar` (no template) → `Pronto para medir: <test name>` (template selected). For lifecycle/checklist-outcome enums, add an explicit PT-BR mapper at the projection edge, never let raw `'pass-with-note'` reach UI. |
| Severity | **Major.** Erodes trust ("does the app know what I'm doing?"). |

### Finding #5 — Hard-block before sending report to queue

| Field | Detail |
|---|---|
| Observed | Submit fails for normal missing items (notes, justifications). User cannot get the report into the local queue. |
| Expected | Submit accepts the report into the local queue for any noncritical pending state; only minimum-evidence true blockers should hard-stop and they must say where to fix. |
| Code location | [`sharedExecutionShellService.ts:612`](../../mobile/src/features/execution/sharedExecutionShellService.ts#L612) throws when `submitReadiness === 'blocked'`. That state is built at [line 1288–1299](../../mobile/src/features/execution/sharedExecutionShellService.ts#L1288-L1299) — `buildSubmitBlockingHooks` treats `severity === 'submit-block'` **and** any `justificationRequired && empty justification` as blocking. The latter is the bug. |
| Root cause | Service-layer rule defect. Missing justification should generate an actionable *pending item*, not a hard block on submit. The rule was written when the team treated all `justificationRequired` items as critical; the product later clarified the "never hard-block on noncritical items" rule but the service rule was not updated. |
| Classification | Service-layer implementation bug contradicting product rule. |
| Fix direction | Change `buildSubmitBlockingHooks` so it only adds to blocking-hooks list when `item.severity === 'submit-block'`. Missing justifications on non-`submit-block` items continue to surface as `pendingActions` but **do not** flip `submitReadiness` to `'blocked'`. Add an explicit minimum-evidence blocker only for evidence with `requirementLevel === 'minimum'`. Add unit tests for both: a non-critical risk without justification *should be submittable*; a minimum-evidence gap *should be blocked with a clear pending action*. |
| Severity | **Blocker.** This is the workflow's exit door. Hard-blocking it is the worst single defect in Epic 8 today. |

### Finding #6 — Pending items not clickable

| Field | Detail |
|---|---|
| Observed | Pending/constraint cards look informational, not interactive. User does not realize they can be tapped. |
| Expected | Every pending item is a clickable affordance that navigates to the resolve/justify screen. Applies to checklist, history, report, evidence, sync. |
| Code location | On the report screen, [`VisualProductShell.tsx:3163–3184`](../../mobile/src/shell/VisualProductShell.tsx#L3163-L3184) does correctly wrap pending actions in `<Pressable onPress={() => onNavigatePending(action.route)} />`. **But** pending items on other screens (calculation, history, diagnosis, checklist) are rendered as informational text or as `pendingCard` views with no `onPress`. The data model also limits `VisualReportPendingActionRoute` to `'calculation' | 'diagnosis' | 'report'` — there is no route for "open evidence area" or "open checklist item N." |
| Root cause | Half-implemented model. Pending actions exist for the report screen only and the route enum is too coarse to point at a specific evidence card or checklist row. |
| Classification | UX design flaw + missing model expansion. |
| Fix direction | Generalize "pending action" into a `VisualPendingAction` model with `{ id, label, detail, target: { route, anchorId? }, severity, kind }`. Render it everywhere (calculation, history, diagnosis, report). Visually style as Pressable with a chevron and a "Resolver agora" affordance. On press, route to target + scroll-to-anchor. Add tests that every projection's `pendingActions` array is actionable on the UI side (component test or render test). |
| Severity | **Blocker.** The user is currently being shown problems they can't act on — a navigation dead end. |

### Finding #7 — Cannot attach photos during a test

| Field | Detail |
|---|---|
| Observed | Photo attachment is only reachable from the report screen. During a loop test point or single-point calculation the camera/gallery actions are not present. |
| Expected | Attach evidence at any execution step, especially during loop test points where abnormalities happen mid-test. Report-level photo also remains. |
| Code location | `onAttachCamera` / `onAttachLibrary` props are only consumed inside `ServiceReportScreen` ([`VisualProductShell.tsx:3221–3236`](../../mobile/src/shell/VisualProductShell.tsx#L3221-L3236)). `LoopExecutionScreen` ([`2452–2622`](../../mobile/src/shell/VisualProductShell.tsx#L2452-L2622)) and `ServiceCalculationScreen` ([`2280–2477`](../../mobile/src/shell/VisualProductShell.tsx#L2280-L2477)) do not render the photo actions. The underlying `executionShellService.attachPhotoEvidence` is generic and would accept an attachment with an `executionStepId` other than `guidance`. |
| Root cause | Missing UI integration. The service supports per-step evidence; the shell doesn't surface the buttons in non-report screens. |
| Classification | Missing service integration in the UI layer (the service has the capability; the screen doesn't expose it). |
| Fix direction | Add a compact `EvidencePhotoBar` component (Camera / Galeria + thumbnail list) and render it as a section on `LoopExecutionScreen` and `ServiceCalculationScreen`, plus the checklist screen. The photo is associated with the current execution step. The existing report-level evidence area shows all attachments. Add tests that an attached photo from inside a loop test point is visible in the report screen. |
| Severity | **Major.** Real field evidence capture pattern. |

### Finding #8 — Android hardware back minimizes the app

| Field | Detail |
|---|---|
| Observed | Hardware back puts the app to background instead of stepping back through the in-app route history. |
| Expected | Hardware back navigates the in-app history first; only exits at root. |
| Code location | `grep -n "BackHandler" mobile/src/**` returns **zero matches**. There is no `BackHandler.addEventListener('hardwareBackPress', ...)` anywhere in the app. Therefore Android falls through to the OS default (minimize). |
| Root cause | Missing implementation. The shell uses a single `route` `useState` with no history tracking; no `BackHandler` is registered. |
| Classification | Missing implementation + missing navigation history model. |
| Fix direction | Introduce a route history stack (small `useRef<VisualRoute[]>([])` + push on `openRoute` + pop on back). Register a `BackHandler` listener that pops the stack and returns `true` while the stack has frames; return `false` (let OS handle = minimize) only at root. This is ~30 lines of code; no library needed. |
| Severity | **Blocker on Android.** Hardware back is universal user expectation. |

### Finding #9 — Next/back/proceed hard to find

| Field | Detail |
|---|---|
| Observed | Each screen has different navigation paradigms and the user cannot quickly identify next/back/home. |
| Expected | Every screen exposes current stage, back, next, home in consistent positions. |
| Code location | Stage stepper exists (`ExecutionStageStepper` rendered per execution screen) but: the stepper at the top is fine; the *bottom* of each screen mixes "Salvar X" primaries with "Comparar" / "Calculadora" ghosts in varying orders. Some screens have a `ScreenHeader onBack` only; the bottom has no "Proximo" affordance. Home affordance is absent (see #1). |
| Root cause | UX/navigation design flaw — inconsistent footer pattern across screens. |
| Classification | UX design flaw. |
| Fix direction | Define a single `StageFooter` component: `[← Voltar] [Inicio]  [center: Salvar / primary CTA]  [Proximo →]`. The "Próximo" target is derived from the current stage in `buildExecutionStages(pattern)` — pure function, easy to test. Render `StageFooter` at the bottom of every execution screen. Hide it on dashboard/login. |
| Severity | **Major.** The pattern is fixable cheaply and pays off in every later UX change. |

### Finding #10 — Pending items must always be resolvable

| Field | Detail |
|---|---|
| Observed | Pending states sometimes show as dead text with no path forward. Same root issue as #6 but extended to checklist, evidence section, sync, and risk justification. |
| Expected | Every pending card exposes at minimum: *Resolver agora*, *Adicionar justificativa*, *Adicionar evidência*, *Continuar com justificativa* (where allowed). |
| Code location | Same model gap as #6 — see fix direction there. Specifically: checklist outcome rows show `prompt` + `outcome` + `sourceReference` but no Pressable to mark/justify in-place when outcome is `incomplete` or `skipped`. Sync state rows are pure text. Evidence references are read-only cards. |
| Root cause | Pending items modelled as *passive information* instead of *actionable tasks*. |
| Classification | Architecture/product model gap. |
| Fix direction | Same as #6 plus: extend each projection (`buildVisualExecutionGuidance`, `buildVisualReportProjection`, sync-state badge model) to emit a `pendingActions` array of `VisualPendingAction`. Render uniformly. |
| Severity | **Blocker.** Together with #6 these are the structural shape of "pending = actionable task," which the product rule demands. |

### Finding #11 — Reports never reach supervisor

| Field | Detail |
|---|---|
| Observed | Reports go to local queue but supervisor never sees them. |
| Expected | Queued reports sync to backend; supervisor sees them in the appropriate group with correct counters. |
| Code locations | <ul><li>[`authApiClient.ts:21`](../../mobile/src/features/auth/authApiClient.ts#L21) — `apiBaseUrl` defaults to `http://127.0.0.1:4100` on the device.</li><li>[`TagWiseApp.tsx:1854–1873`](../../mobile/src/shell/TagWiseApp.tsx#L1854-L1873) — evidence sync only runs when `session.connectionMode === 'connected'`. If the phone never reaches the backend, `connectionMode` stays in offline-fallback and sync never fires.</li><li>[`supervisorReviewService.ts`](../../mobile/src/features/review/supervisorReviewService.ts) — `refreshQueue` requires connected session.</li></ul> |
| Root cause | **Most likely:** environment/build config — APK built without `EXPO_PUBLIC_TAGWISE_API_BASE_URL` pointing at the LAN-reachable backend, so the phone resolves `127.0.0.1` to itself and silently can never reach the API. Secondary contributing factors: (a) no in-app diagnostic to show "the API URL I'm using is X and the last health check at Y was Z"; (b) sync error messages collapse all backend-unreachable cases under generic "Falha de rede." |
| Classification | Backend/sync environment issue (primary) + sync transparency UX gap (secondary). |
| Fix direction | <ol><li>**Surface the configured `apiBaseUrl`** in a diagnostics panel on the dashboard (`Conectado a: http://192.168.x.x:4100 — Última verificação: 09:42`), with a manual *Testar conexão* button that hits `/health/ready`.</li><li>**Build-time check:** add a `mobile/scripts/check-env.ts` that fails the EAS build if `EXPO_PUBLIC_TAGWISE_API_BASE_URL` is unset or uses loopback for a non-emulator profile.</li><li>**Lifecycle separation in projection:** confirm `serviceBackedReport.ts` and supervisor queue distinguish: `local-only` / `queued` / `syncing` / `pending-validation` / `synced` / `sync-issue` (model exists at [`syncStateModel.ts:3–10`](../../mobile/src/features/sync/syncStateModel.ts#L3-L10), but the UI rolls them up). Show the raw state on the report card.</li><li>**Reconnaissance step before any UX change:** verify the running phone-side `apiBaseUrl`, manually hit `/health/ready` from the phone's browser, confirm the backend is running and reachable, and only then declare it a code issue.</li></ol> |
| Severity | **Blocker for demo.** Without this the technician→supervisor handshake is invisible regardless of UX polish. |

### Finding #12 — Sync/network errors not clear

| Field | Detail |
|---|---|
| Observed | Errors don't differentiate no-internet / backend unreachable / token expired / API URL wrong / evidence upload failed / report validation failed. |
| Expected | Distinct PT-BR copy + actionable next step for each class. |
| Code location | [`serviceBackedReport.ts:379–396`](../../mobile/src/features/visual-shell/serviceBackedReport.ts#L379-L396) — `translateOperationalMessage` maps `Access token expired → Sessao expirada` and `Network request failed → Falha de rede`. That's two cases. There is no model for "backend reachable but wrong API URL" or "evidence binary upload failed but report metadata OK." All errors collapse to one of two strings. |
| Root cause | Error model too coarse. The mobile sync layer surfaces `Error.message` strings from the underlying fetch and the projection just regex-matches a few. |
| Classification | Sync transparency UX + thin error classification model. |
| Fix direction | Introduce a `SyncFailureClass` enum at the projection edge: `no-internet`, `backend-unreachable`, `session-expired`, `evidence-upload-failed`, `report-validation-failed`, `unknown`. Each emits PT-BR copy + suggested action chip: `Tentar de novo`, `Fazer login`, `Ver fila local`, `Ver detalhes`. The mobile layer can detect classes via `navigator.onLine` (if available), HTTP status family, and message inspection. Add unit tests for each class → copy mapping. |
| Severity | **Major.** Today the user cannot distinguish "the phone is offline" from "the backend is down" from "your session expired" — three completely different remedies. |

### Severity roll-up

| Severity | Findings |
|---|---|
| **Blocker** | #2, #5, #6, #8, #10, #11 |
| **Major** | #1, #3, #4, #7, #9, #12 |
| **Minor** | — |

---

## 3. Prior Finding Regression Check

The hotfix doc (2026-05-10 addendum) tracked 20 manual findings; Story 8.6 promised to close the remaining gaps in 9 AC areas (A–I). Mapping prior items against current code + current phone findings:

| Prior topic | Story 8.6 dev claim | Current code reality | Status |
|---|---|---|---|
| Loop test placement / behavior | Fixed (moved out of calculator) | `LoopExecutionScreen` exists, 5 default / 1–10 / PV-mA / pass-fail summary — verified | **Fixed** |
| Test selection opens correct flow immediately | Fixed via `handleSelectTemplateAndOpen` | `VisualProductShell.tsx:525–541` does open the matching route — verified | **Fixed in code** |
| Different tests must not open same generic screen | Fixed via `resolveVisualExecutionPattern` | `executionFlow.ts` routes loop / single-point / checklist correctly — verified | **Fixed in code** |
| Conversion PV → % | Fixed | `fieldCalculator.ts` and `serviceBackedExecution.ts` both support it — verified | **Fixed** |
| Save guides next step | Fixed (`Calculo salvo localmente. Proximo: ...`) | Shell sets `setShellMessage` after save — verified | **Fixed** |
| Diagnostic/checklist/guidance English text | Fixed via `translateVisibleText` | Coverage broad in projection — verified | **Mostly fixed**, except lifecycle/checklist-outcome enums like `pass-with-note` (current finding #4) |
| Checklist first-class near test selection | Fixed (checklist is a stage; route → `diagnosis`) | Stage stepper + `ServiceGuidanceScreen` available — verified | **Fixed** |
| Compare page focuses on point/variable history | Fixed | Selector chips at 0/25/50/75/100% with PT-BR empty state — verified | **Fixed** |
| Route transitions scroll to top | Fixed | `useEffect` in [`VisualProductShell.tsx:456–458`](../../mobile/src/shell/VisualProductShell.tsx#L456-L458) — verified | **Fixed** |
| Save checklist/observations shows feedback | Fixed | Shell sets `setShellMessage('Checklist salvo localmente...')` — verified | **Fixed** |
| Photo/evidence discoverable during tests | Claimed improved | Only present on report screen — **not on loop/calculation/checklist** | **Not fixed** (current finding #7) |
| Submit not silently disabled | Fixed (with "Envio ainda bloqueado" card) | Shell shows the card when blocked — but the *underlying block rule* hard-blocks on missing justification (current finding #5) | **Partial.** UI behaviour fixed; service rule still wrong. |
| AI Diagnosis nonblocking, PT-BR | Fixed | `buildVisualAiDiagnosisProjection` returns proper copy, `blocking: false` everywhere — verified | **Fixed** |
| Report summary vertical/readable | Fixed | `ReportSummaryBlock` (vertical) vs `SummaryLine` (two-column for short pairs) — verified | **Fixed** |
| Supervisor counters match queues | Fixed | `count: items.length` derived from same array — verified | **Fixed in code.** Real phone test depends on backend reachability (#11). |
| Keyboard does not cover inputs | Claimed fixed | `KeyboardAvoidingView` is iOS-only behavior; Android relies on bottom padding. Long-form inputs (justification, supervisor comments) may still get covered on some Android keyboards | **Unknown without device smoke** |
| Navigation must be obvious | Claimed improved | Stage stepper top, footer mix, no home, no hardware back, no consistent "Proximo" | **Not fixed** (current findings #1, #8, #9) |
| Sync after network change works or explains | Claimed improved with PT-BR copy | Only two classes mapped; loopback URL default likely means it never even tried (#11, #12) | **Not fixed** |
| Pending items clickable | Claimed (report screen) | Report screen yes; other screens no; model too coarse | **Partial** (current findings #6, #10) |
| Sync queue lifecycle states | Model exists in `syncStateModel.ts` | UI rolls them up; user cannot see `local-only` vs `queued` vs `pending-validation` distinctly | **Partial** |

**Pattern:** Every item with a pure-projection fix is closed. Every item that requires *touch-target wiring*, *cross-screen consistency*, or *device/environment integration* is still open. This is consistent with the structural cause in §1.

**Mismatch between projection tests and real UI:** the projection tests assert *the model is correct*; the UI assertions don't exist, so the rendered shell can wire the wrong handler to the right label (#2) or render a result inside a "pending warning" card (#3) and tests still pass.

---

## 4. Architecture Diagnosis

### 4.1 `VisualProductShell.tsx` is too large and route-state-heavy

6,169 lines, a single component with ~30 internal sub-components, a single `route: VisualRoute` state, and most screens inlined. Editing one screen forces re-reading the whole file. There is no per-screen ownership boundary and no test surface. This is the structural defect that produced the cycle: "code passes review for each AC in isolation, then a different screen breaks because nothing enforces the shared contracts."

### 4.2 New adapters are correct but not sufficient

`executionFlow.ts`, `fieldCalculator.ts`, `serviceBackedExecution.ts`, `serviceBackedReport.ts`, `serviceBackedReview.ts` are well-designed and well-tested. They are presentation projections. They produce data correctly. **They do not enforce that the data is consumed correctly.** The shell can render a `Pressable` with the wrong `onPress` and the projection will never complain.

### 4.3 `TagWiseApp.tsx` as mega-orchestrator

5,040 lines, single component holding session, work-packages, execution shell, review queue, sync detail, manual instrument, photo acquisition, returned-report awareness. Every handler is wired by literal lambda in the JSX prop list. Adding a new handler (e.g., `onAttachPhotoToExecutionStep(stepId, source)`) means editing both `TagWiseApp.tsx` and `VisualProductShell.tsx` and threading the prop down ~5 component layers. The friction is enough that developers choose to *not* surface a new affordance (which is why photo attachment never made it to the loop test screen).

### 4.4 No internal navigation/stage model for mobile flow

The shell has `route: VisualRoute` as a single string. There is:
- no history stack
- no `goBack()` that respects the user's actual prior screen
- no `goHome()`
- no `BackHandler` registration
- no consistent footer with `Voltar / Inicio / Proximo`

This is the structural cause of findings #1, #8, #9. A small `useNavigationStack` hook (push on openRoute, pop on back, register `BackHandler` to pop until empty) would close it.

### 4.5 Pending items modelled as passive messages

`VisualReportPendingAction` is the only place where pending state exists as an *action*. Everywhere else (calculation, history, diagnosis, sync, evidence references) pending shows up as a styled card with text. The product rule "every pending item must be tappable to resolve / justify / add evidence / continue with justification" requires lifting this concept up. A `VisualPendingAction` union shared across projections is a small, high-leverage change.

### 4.6 Report submission too tightly blocked by evidence validation

[`buildSubmitBlockingHooks`](../../mobile/src/features/execution/sharedExecutionShellService.ts#L1288-L1300) treats missing justification on **any** `justificationRequired` item as a hard block. The product rule says only `severity === 'submit-block'` and `requirementLevel === 'minimum'` evidence gaps should hard-block. This is a service-level rule miswrite, not a UI defect — and it cannot be papered over from the shell.

### 4.7 Sync state is too opaque

The `SharedExecutionSyncState` union has six states; the user is shown a single badge label. There is no diagnostics view that tells the technician: which API URL the device is using, the time of the last health check, whether the last report submission queued/failed, and which class of failure. A small "Sincronização" diagnostic card on the dashboard would unblock #11 + #12 troubleshooting today and remain useful in production.

### 4.8 Technician and supervisor flows do not share state today

Good. `serviceBackedReview.ts` has a clean RBAC projection that returns `hidden` for technician sessions. Supervisor counters derive from the same items array. No shared mutable state, no leakage. This is **not** a defect; it is one of the cleaner parts of the codebase.

### 4.9 Phone-level E2E harness is now required before further large UX changes

The team has now had three rounds of "code green, phone red" (Story 8.1 → live APK hotfix → Story 8.6). Continuing without a device-level smoke is a structural risk that the next implementation pass will repeat the pattern. The cost of installing Maestro (zero code, YAML flows, free, runs on a USB-tethered Android) is ~half a day. The cost of *not* installing it is another full review cycle if the next story regresses on the phone.

---

## 5. Recommended Repair Strategy

### Option A — Patch `VisualProductShell.tsx` and `TagWiseApp.tsx` directly

| | |
|---|---|
| Pros | Fastest mechanical fixes for findings #1, #2, #4, #7, #8 (each is <50 lines). No new abstractions. |
| Cons | Reinforces the 6,169-line monolith. Each future repair lands in untested territory again. Findings #5, #6, #10, #12 need service-layer changes that the patch approach cannot reach. |
| Risk | Medium-high — likely to introduce a new round of inconsistency between screens, because the team is editing one section of a giant component without coverage. |
| Speed | Fast for the listed mechanical bugs, slow overall because deeper issues still need a second pass. |
| Fits deadline/demo | Only partially — addresses surface bugs but not #5/#11 which are demo blockers. |

### Option B — Introduce a small service-backed flow controller / view-model layer

| | |
|---|---|
| Pros | Solves the structural cause. A `useNavigationStack` hook + a `usePendingActions` projection + a `useSyncDiagnostics` view-model close findings #1, #6, #8, #9, #10, #12 with one set of changes. Service-level changes for #5 and #11 fit naturally. Future stories become small. |
| Cons | More moving parts than option A. Requires discipline to keep the controller small (under ~300 lines total) and not re-invent React Navigation. |
| Risk | Medium — manageable if scoped. The biggest risk is over-engineering; the architect (me) should write explicit boundaries before dev starts. |
| Speed | Slower for week 1, much faster for every later UX story. |
| Fits deadline/demo | Yes for the demo if scoped tightly. The controller/view-model layer is **not** a rewrite; it is a small layer between `TagWiseApp` and `VisualProductShell`. |

### Option C — Add Maestro/device E2E first, then patch

| | |
|---|---|
| Pros | Closes the "code green, phone red" loop permanently. Every future change is verified on a real Android emulator/device. The smoke flow becomes the contract. |
| Cons | Delays the actual phone-blocking fixes by ~half a day. Maestro alone fixes nothing the user reported. |
| Risk | Low. Maestro is a stable, well-supported, YAML-driven harness. |
| Speed | Half a day setup, then fast forever. |
| Fits deadline/demo | Yes if combined with B. Adds <1 day to a 3–5 day repair. |

### Recommendation: **Hybrid — B + C, with the mechanical patches from A folded into B.**

Specifically:

1. **First day:** install Maestro, write one "golden path" YAML flow (login → open work package → select a loop template → run 5-point loop → save → submit → see "Enviar para fila local" feedback). This becomes the gate for the rest of the work. **No code shipped without it green.**
2. **Days 2–4:** implement the flow controller / view-model layer (navigation stack + `BackHandler`, `goHome()`, `usePendingActions`, sync diagnostics view-model, `StageFooter` component). Apply mechanical fixes from option A on top of the new layer.
3. **Day 5:** service-level fix for the hard-block rule (#5) and the build-time check for `EXPO_PUBLIC_TAGWISE_API_BASE_URL` (#11).
4. **Day 5–6:** phone smoke + Maestro re-run + supervisor flow verification with backend up and reachable on LAN.

This is the path that converges on the target architecture (Option A from the prior 2026-05-09 analysis — service-backed adapter layer) while staying small enough to fit the demo window.

---

## 6. Proposed Next Story/Stories

### Recommended split: **one focused repair story + one tiny test-harness story, in parallel**

#### Story 8.7 (repair) — "Live Phone Field Workflow Repair: Navigation, Calculator, Pending Actions, Submit Rule, and Sync Transparency"

One story because the findings are tightly coupled: the navigation stack is the substrate, the pending-action model is the recurring UX primitive, the submit rule is the exit door, and the sync diagnostics are how the demo proves itself.

Splitting it across two stories would force the team to thread the same primitives through twice. The story is broad but tight in scope — no rewrites, no new screens, all changes attach to existing routes/components.

#### Story 8.7-T (test harness, in parallel) — "Maestro Golden-Path Harness for Live Phone Smoke"

Separate because it has no product surface change and a different ownership (test/CI). Should land **before** 8.7 merges, so 8.7 cannot land without smoke proof.

**No hotfix path recommended.** A 1–2 day hotfix would leave the structural cause in place. The next "phone red" round is more expensive than spending five days on the proper repair.

---

## 7. Acceptance Criteria Proposal — Story 8.7

These are the architect's proposed ACs. The PM/dev story creation should refine wording. ACs are grouped by user-visible behavior, each tied to the finding(s) it closes.

### A. In-app navigation

1. Tapping the TagWise logo in any authenticated screen returns to `dashboard`. (Closes #1.)
2. Android hardware back navigates to the previous in-app route while history exists; only exits/minimizes when at `dashboard` or `login`. (Closes #8.)
3. A consistent `StageFooter` is present on every execution-phase screen (`detail`, `calculation`, `loop-test`, `history`, `diagnosis`, `report`). It exposes `Voltar`, `Início`, current primary CTA, and `Próximo`. (Closes #9.)
4. Route transitions still scroll to top (regression check on existing 8.6 behavior).

### B. Button semantics and label clean-up

5. The bottom action grid on the instrument detail screen reads `Medir`/`Iniciar teste` (route → matching execution route by template pattern), `Comparar`, `Diagnosticar`, `Registrar`. (Partial close of #2.)
6. A separate, visually distinct `Calculadora` quick action is reachable from the dashboard quick bar and from inside any execution screen. (Closes the rest of #2.)
7. No tile or card renders the raw word `Template`, the raw enum `pass-with-note`, or any other internal lifecycle/outcome id. All such values map through a PT-BR presentation function. (Closes #4.)

### C. Calculator as a calculator

8. `FieldCalculatorScreen` has an explicit primary `Calcular` button. Tapping it reveals or highlights a `Resultado` panel styled distinctly from a pending/warning card. (Closes #3.)
9. After calculation, the `Aplicar resultado a um teste` flow remains available (existing 8.6 behavior preserved).

### D. Actionable pending items everywhere

10. A shared `VisualPendingAction` model exists in the visual-shell projections and is consumed by all execution screens (calculation, history, diagnosis, report) and by the sync diagnostic card. (Closes #6 + #10.)
11. Every pending card is a `Pressable` with a visible "Resolver agora" or "Adicionar justificativa" affordance. Tapping routes to the resolving screen and scrolls to the relevant anchor where applicable.
12. Checklist outcome rows expose a per-row Pressable to add justification when the outcome is `incomplete` or `skipped`.

### E. Evidence/photos during test

13. Loop test screen renders a compact `EvidencePhotoBar` (Camera, Galeria, thumbnail list) that attaches photos to the current loop test point. (Closes #7.)
14. Single-point/calculation screen renders the same `EvidencePhotoBar` attached to the calculation step.
15. Report screen continues to show *all* attached evidence regardless of step.

### F. Nonblocking report submission

16. `submitReport` no longer throws when a `justificationRequired` item without text is present, unless that item has `severity === 'submit-block'`. (Closes #5.)
17. Missing justifications surface as `pendingActions` of severity `Justificar` (clickable, navigates to the diagnosis/justification step), but **do not** block submission.
18. True minimum-evidence blockers (`evidenceReferences[].requirementLevel === 'minimum'` not satisfied) continue to block submission. The block card explains why and links to the evidence area. (Closes the rest of #5.)
19. Service-level unit tests assert both: a non-`submit-block` risk without justification *can* submit; a missing minimum evidence *cannot*.

### G. Sync transparency

20. The dashboard exposes a `Sincronização` diagnostic card showing: configured `apiBaseUrl`, last health-check timestamp + result, a manual `Testar conexão` button, and the count of `queued`, `pending-validation`, `sync-issue` reports. (Closes #11 environment-visibility half + supports #12.)
21. Sync errors classify into `no-internet`, `backend-unreachable`, `session-expired`, `evidence-upload-failed`, `report-validation-failed`, `unknown`, each with PT-BR copy and a primary action chip. (Closes #12.)
22. A build-time check (Node script invoked by EAS) fails the build if `EXPO_PUBLIC_TAGWISE_API_BASE_URL` is unset or resolves to loopback for the `preview`/`production` profile. (Closes the env half of #11.)

### H. Supervisor flow consistency (regression guard, not new behavior)

23. Supervisor counters continue to derive from the same item arrays (regression check on existing 8.6 behavior).
24. After approve/return/escalate, the queue continues to refresh and the PT-BR success message continues to display (regression check).

### I. Architecture guardrails

25. `VisualProductShell.tsx` does not grow further. Any net-new screen-level behavior in this story is added in a separate file under `mobile/src/features/visual-shell/` (controller, view-model, or small screen module).
26. A `useNavigationStack` hook (or equivalent) owns: route push, route pop, `BackHandler` registration, `goHome()`. It is a single source of in-app navigation truth.
27. A `usePendingActions` hook or projection produces the `VisualPendingAction` arrays consumed by execution screens.
28. A `useSyncDiagnostics` view-model surfaces the dashboard diagnostic card data.

---

## 8. Test Strategy Recommendation

### What must be added before/with Story 8.7

| Test type | Scope | Tooling | Mandatory? |
|---|---|---|---|
| Service-level unit tests | New: `buildSubmitBlockingHooks` correctly excludes missing-justification on non-`submit-block` items; minimum-evidence still blocks. | vitest (existing) | **Yes.** |
| Projection unit tests | New: `VisualPendingAction` projection across calculation/history/diagnosis/report. Sync failure classification. PT-BR enum mappers for `pass-with-note` and lifecycle states. | vitest (existing) | **Yes.** |
| React Native renderer tests | `useNavigationStack` and `BackHandler` behavior; `TagWiseLogo` press routes to dashboard; `Calcular` tile press routes to `calculator`; pending cards rendered as `Pressable`. | `@testing-library/react-native` — **new dev dependency** | **Yes for the navigation/touch-target items.** This is the gap the user has been hitting. |
| Maestro device golden-path flow | Login → open work package → select loop template → run 5-point loop → attach photo at point 3 → save → submit → see "Enviar para fila local" feedback. Second flow: supervisor login → see report → approve → PT-BR success. | Maestro — **new dev dependency** | **Yes.** Without it the next round will regress on device again. |
| Live backend smoke | `cd backend && $env:TAGWISE_LIVE_API_BASE_URL='http://<lan-ip>:4100'; npm test -- tagWiseLiveApiSmoke` against a running local backend on the LAN. | existing | **Yes for the demo gate.** |
| Manual phone smoke | The 24-step checklist from Story 8.6 spec + new items for navigation/back/home, calculator Calcular button, photo during loop point, submit with pending items. | manual | **Yes.** Maestro covers the golden path; manual covers permutations. |

### Issues that the **existing** automated test suite cannot catch even after Story 8.7

- Camera/Galeria permission prompts on physical Android.
- Real keyboard overlap on the variety of Android keyboards in the wild.
- Real backend reachability from the device LAN (only Maestro + manual can prove).
- Touch target ergonomics (size, spacing, double-tap mishits).
- Font scaling at Android accessibility levels.
- SQLite migration on production-shaped data.

These remain in the manual phone smoke checklist. None of them block the architectural decision; they only mean the manual step is permanently part of the release gate.

---

## 9. Output Summary

### Status of Story 8.6
**Should change from `ready-for-review` to `Needs fixes — phone-blocking UX gaps confirmed at code level, distinct from anything claimed fixed in 8.6.**

Story 8.6 implemented its acceptance criteria correctly at the projection layer and passed automated tests. The phone-blocking issues found by the user are real defects but **belong to a different layer** (touch wiring, navigation stack, submit rule, environment config) than the AC areas 8.6 scoped. Leaving 8.6 as `ready-for-review` would imply the workflow is field-ready; closing it as `Needs fixes` is more honest and frames Story 8.7 as the next slice.

### Status of Epic 8
**Not release/demo ready.** Recommend keeping Epic 8 as `in-flight` with one repair story (8.7) and one test-harness story (8.7-T) gated before any demo.

### Recommended next BMAD action
1. **First:** the PM or you (Emilio) reviews this artefact and decides whether to accept the recommended hybrid (B+C) repair strategy and the proposed Story 8.7 + 8.7-T split.
2. **Then:** call `bmad-create-story` for Story 8.7-T (Maestro golden path) first, because it is small, parallelizable, and provides the gate for 8.7.
3. **In parallel:** call `bmad-create-story` for Story 8.7 (repair). The acceptance criteria in §7 of this document are the source material.
4. **After dev:** call `bmad-dev` for each story; require both `npm run typecheck` + `npm test` + Maestro green + manual phone smoke before marking done.
5. **After story 8.7 done:** call `bmad-tea` (Murat) for a proper test-architecture pass: risk matrix, NFR assessment, and a trace matrix linking each AC to its proof (unit / renderer / Maestro / manual).

**Do not call `bmad-dev` directly.** The previous cycle has shown that without a story spec grounded in this analysis the dev pass lands in the wrong layer again.

### Artefacts created/updated by this analysis
- **Created:** [`_bmad-output/planning-artifacts/live-phone-story-8-6-regression-root-cause-analysis.md`](live-phone-story-8-6-regression-root-cause-analysis.md) (this document).
- **Should be updated next (separate action, not in this turn):**
  - Story 8.6 spec status field → `Needs fixes`.
  - `story-map.md` → add Story 8.7 and 8.7-T placeholders pointing at this analysis.
  - `architecture.md` → record the "visual shell view-model layer + navigation stack" rule as a non-negotiable for future Epic 8+ work.

---

## Architect's Note

Three rounds of "code green, phone red" is a structural signal. The team is producing correct projection code that lands in an untested rendering surface. The repair is not another UX pass — it is a small, disciplined view-model layer plus a device-level smoke that prevents the cycle from repeating. Everything else in Story 8.7 is mechanical.

The hard-block submit rule (finding #5) and the loopback API URL (finding #11) are the two findings I'd promote loudest in the next planning conversation: they are demo-blockers and they are not in the layer Story 8.6 was authored in. Fix them at the service and build levels respectively, not at the UI.

Keep the dark shell. Keep the projections. Stop growing `VisualProductShell.tsx`. Add the controller. Add Maestro. Demo.

— Winston
