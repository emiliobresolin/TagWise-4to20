# Visual Shell Functional Regression Analysis

Date: 2026-05-09
Status: Architect analysis, no implementation
Scope: Functional regressions introduced or exposed by the latest dark visual product shell story.

## 1. Executive summary

The latest visual shell change appears to have made a parallel, screenshot-shaped front-end flow the primary mobile experience. The app still initializes and retains many of the real local-first services, but the new `VisualProductShell` owns its own route state, hardcoded selected instrument model, static calculation/report/approval data, and demo-only actions. As a result, production product flows that previously existed in the white technical shell are now disconnected or unreachable.

This is mainly a UI wiring regression, duplicated mock-data regression, navigation/state regression, and domain-service bypass. It is not primarily a deep backend architecture failure. The backend approval, evidence, report submission, seed work-package data, role model, and local-first mobile services still exist. The deeper architecture issue is that the visual shell was allowed to become a second application surface without a mandatory adapter/view-model contract to the existing application services.

Conceptually, the regression is:

- The visual shell replaced service-backed execution screens instead of skinning or adapting them.
- Instrument identity is not carried through visual navigation, causing PT-204 fallback behavior.
- Screenshot seed data in `mobile/src/features/visual-shell/model.ts` competes with project-shaped local/downloaded catalog data.
- Calculator, checklist, report, evidence, and approval actions render as visual placeholders instead of invoking domain/application services.
- AI-style diagnosis copy appears inside the deterministic local diagnosis screen, blurring the required boundary between offline guidance and optional AI/report intelligence.
- Role-aware supervisor workflows exist in backend/mobile services, but the visual approval screen is not gated by session role and does not use the connected review service.

The safest repair direction is a hybrid path: keep the useful dark visual shell components, but route critical flows back through the existing service-backed execution/report/approval services immediately, then introduce a thin visual adapter/view-model layer. This preserves the visual improvement while restoring offline-first product behavior.

## 2. Current vs expected flow map

Expected product flow:

`tag / QR / list -> instrument context -> calculation -> history comparison -> deterministic guided diagnosis / checklist / reference -> report / evidence -> submit / sync -> supervisor approval`

| Flow step | Expected owner | Current visual-shell behavior | Regression class |
| --- | --- | --- | --- |
| Tag, QR, or list entry | `LocalQrScanService`, `LocalTagEntryService`, `LocalTagContextService`, downloaded package snapshots | QR demo routes to the detail screen with a PT-204 message; list item presses do not pass a tag id | Navigation/state handoff and service bypass |
| Instrument context | Local package snapshot plus tag context service | `buildTechnicianVisualWorkflow` selects a visual model tag, preferring PT-204 | Duplicate mock data and hardcoded fallback |
| Calculation | `SharedExecutionShellService.saveCalculation`, `DeterministicCalculationEngine`, local SQLite progress | Calculation screen is static; mA/% controls are display pills; no input/save/domain command path | Domain-service bypass |
| History comparison | Cached package history and execution shell report fields | Static visual history rows from the visual model | Duplicate mock data |
| Guided diagnosis, checklist, references | Local execution template registry, cached guidance references, persisted checklist/risk state | Static `DiagnosisScreen` copy with local symptom state only; AI-like hypothesis fields always shown | Domain-service bypass and AI boundary confusion |
| Report and evidence | `SharedExecutionShellService.saveGuidanceEvidence`, `attachPhotoEvidence`, `saveReportDraft`, `submitReport` | Static summary and attachment rows; only justification text input; submit routes locally to approval | Report/evidence workflow bypass |
| Submit and sync | Local report queue, `EvidenceUploadOrchestrator`, backend report validation | No local report lifecycle or evidence sync state in visual submit path | Offline/sync bypass |
| Supervisor approval | Session/RBAC, `SupervisorReviewService`, backend review queue/detail/decision endpoints | Demo approval screen is reachable from technician flow, no role gate, no queue/tabs, no confirmation, no backend decision | RBAC and connected approval bypass |

Observed bug mapping:

| Observed regression | Broken step | Existing owner/module that should own it |
| --- | --- | --- |
| QR scan always opens PT-204 | Tag entry and navigation | `mobile/src/features/work-packages/localQrScanService.ts`, `TagWiseApp.handleResolveQrPayload` |
| Instrument mock/catalog mismatch | Catalog projection | `AssignedWorkPackageCatalogService`, local package snapshots, backend seed work-package data |
| Selecting any instrument opens PT-204 | Tag identity handoff | `LocalTagEntryService.selectPackageTag`, route state carrying selected tag id |
| Calculator and conversion buttons do not work | Calculation execution | `DeterministicCalculationEngine`, `SharedExecutionShellService.saveCalculation`, template calculation metadata |
| AI-style hypothesis appears during local diagnosis | Diagnosis/report boundary | Deterministic guidance in execution shell; backend AI provider boundary and future report-level AI diagnosis job |
| Checklist, next step, norms, best practices do not work | Guidance/checklist/reference | `LocalExecutionTemplateRegistry`, `LocalTagContextService`, package `guidanceReferences` |
| Report cannot edit intended summary fields; attachments/photos do not work | Report/evidence | `SharedExecutionShellService.saveReportDraft`, `attachPhotoEvidence`, evidence queue/orchestrator |
| Only one practical user appears in app | Auth/session/role projection | `SessionController`, `ActiveUserSession`, backend seeded users and RBAC |
| Supervisor approval lacks confirmations/tabs/lists | Review workflow | `SupervisorReviewService`, backend review service, visual supervisor queue UI |

## 3. Root-cause hypotheses with code references

### 3.1 Visual shell became the primary app surface

`TagWiseApp` initializes real local-first services and state, but the active render path returns only `VisualProductShell`.

- `mobile/src/shell/TagWiseApp.tsx:16` imports real service modules.
- `mobile/src/shell/TagWiseApp.tsx:168` initializes local runtime/session/repository services.
- `mobile/src/shell/TagWiseApp.tsx:1953` returns `<VisualProductShell ...>`.
- `mobile/src/shell/TagWiseApp.tsx:1973` begins the old technical shell inside a block comment, making the older functional flow unreachable.

This validates the user observation: the new dark layout was not applied as a skin over the existing service-backed flow. It became a parallel front-end flow.

### 3.2 Hardcoded PT-204 behavior

Likely hardcoded PT-204 paths are concentrated in the visual shell model and QR/list route handlers:

- `mobile/src/shell/VisualProductShell.tsx:93` has `handleQrDemo`, which sets the message to "abrindo PT-204" and routes to `detail`.
- `mobile/src/features/visual-shell/model.ts:212` selects `PT-204` first: `dedupedTags.find((tag) => tag.code === 'PT-204') ?? pendingTags[0] ?? seededTags[0]`.
- `mobile/src/features/visual-shell/model.ts:313` falls back to `seededTags[0]`, which is PT-204.
- `mobile/src/shell/VisualProductShell.tsx:118` passes `onOpenDetail={() => openRoute('detail')}` without any tag identity.
- `mobile/src/shell/VisualProductShell.tsx:942` to `968` renders every list item with the same no-argument open-detail callback.

Existing non-visual QR and tag entry paths already preserve identity:

- `mobile/src/shell/TagWiseApp.tsx:728` `handleOpenTag(tagId)` selects the exact local package tag.
- `mobile/src/shell/TagWiseApp.tsx:1181` `handleResolveQrPayload(rawPayload)` resolves the scanned payload through `LocalQrScanService`, loads the matching package tag, and sets `selectedTag`.
- `mobile/src/features/work-packages/localQrScanService.ts:41` resolves local QR payloads against cached package snapshots.
- `mobile/src/features/work-packages/localTagEntryService.ts:44` selects a tag by id from the local package snapshot.

### 3.3 Duplicate screenshot mock data

The visual shell carries its own seeded catalog:

- `mobile/src/features/visual-shell/model.ts:100` to `179` defines visual `seededTags` such as PT-204, TT-211, FT-078, LT-090, IT-443, and PT-156.
- `mobile/src/features/visual-shell/model.ts:204` to `276` builds dashboard, detail, calculation, history, diagnosis, and report data from this visual model.

The project-shaped catalog already exists elsewhere:

- `backend/src/modules/work-packages/seedData.ts:327` to `390` defines realistic seed tags such as PT-101, TT-205, and AI-330 with family, subtype, measured variable, signal type, range, tolerance, templates, guidance references, and history.
- `backend/src/modules/work-packages/seedData.ts:393` to `561` defines execution templates, including analog-loop conversion basis and expected evidence.
- `backend/src/modules/work-packages/seedData.ts:563` to `617` defines guidance/best-practice references.
- `mobile/src/features/work-packages/assignedWorkPackageCatalogService.ts:29` loads local package catalog summaries from the local repository.
- `mobile/src/features/work-packages/localTagContextService.ts:29` builds instrument context from the local package snapshot.

This mismatch is a product architecture regression because the visual shell is not consuming the same contract that future SAP/Maximo/TOTVS-style integration would populate.

### 3.4 Calculator functionality exists but is bypassed

The visual calculator screen is not wired to the calculation engine:

- `mobile/src/shell/VisualProductShell.tsx:527` to `570` renders static calculation values.
- `mobile/src/shell/VisualProductShell.tsx:542` to `550` renders mode/mA/% UI as display labels, not inputs or actions.
- `mobile/src/features/visual-shell/model.ts:181` to `202` calculates a visual-only expected/observed error from hardcoded values.

Existing execution calculation functionality remains present:

- `mobile/src/features/execution/deterministicCalculationEngine.ts:79` computes deterministic expected/observed deviation, absolute deviation, percent-of-span, tolerance, and pass/fail state.
- `mobile/src/features/execution/localExecutionTemplateRegistry.ts:17` resolves calculation metadata from the selected tag/template/local package snapshot.
- `mobile/src/features/execution/sharedExecutionShellService.ts:274` `saveCalculation` computes and persists the calculation through the deterministic engine.
- `mobile/src/shell/TagWiseApp.tsx:865` to `1001` contains handlers that previously accepted calculation inputs and saved calculation state through the execution shell service.

The likely repair is not a new calculator engine. The visual calculator needs to invoke the existing calculation service and expose template-driven conversion helpers for loop instruments.

### 3.5 Checklist, guidance, norms, and "next step" are visual-only

The visual diagnosis screen uses local component state and static text:

- `mobile/src/shell/VisualProductShell.tsx:646` to `713` renders local symptom selection, "HIPOTESE PROVAVEL", "Por que isso?", and static checklist rows.
- `mobile/src/features/visual-shell/model.ts:246` to `274` provides static history/diagnosis/report text.

Existing project guidance functionality is local-first and template-driven:

- `mobile/src/features/execution/localExecutionTemplateRegistry.ts:9` to `15` defines shared execution steps including context, calculation, history, guidance, and report.
- `mobile/src/features/execution/localExecutionTemplateRegistry.ts:17` to `63` resolves checklist prompts, guidance references, evidence requirements, conversion basis, and expected range summaries from the selected local tag/template.
- `mobile/src/features/execution/sharedExecutionShellService.ts:343` to `394` saves guidance evidence, checklist outcomes, observation notes, and risk justifications.
- `mobile/src/features/work-packages/localTagContextService.ts:182` to `224` maps template and guidance reference context for the selected tag.

### 3.6 Report and evidence functionality exists but is bypassed

The visual report screen is a static summary with placeholder attachments:

- `mobile/src/shell/VisualProductShell.tsx:717` to `780` renders static report fields.
- `mobile/src/shell/VisualProductShell.tsx:735` to `747` displays summary lines without the existing report draft edit contract.
- `mobile/src/shell/VisualProductShell.tsx:749` to `756` renders attachment labels from the visual model, not evidence records.
- `mobile/src/shell/VisualProductShell.tsx:776` to `778` routes directly to visual approval instead of submitting a local report through the offline queue.

Existing offline-first report/evidence functionality remains present:

- `mobile/src/features/execution/sharedExecutionShellService.ts:396` to `452` attaches photo evidence into a local sandbox and persists metadata.
- `mobile/src/features/execution/sharedExecutionShellService.ts:560` to `591` saves report draft data.
- `mobile/src/features/execution/sharedExecutionShellService.ts:593` to `722` submits local report and evidence queue items transactionally.
- `mobile/src/features/execution/sharedExecutionShellService.ts:1320` to `1398` derives report state from calculation, guidance, evidence, risk, review notes, and lifecycle state.
- `mobile/src/features/sync/evidenceUploadOrchestrator.ts:52` to `70` syncs submitted report evidence when connected.
- `mobile/src/features/sync/evidenceUploadOrchestrator.ts:95` to `162` submits report metadata for server validation.
- `backend/src/api/createApiRequestHandler.ts:217` to `435` handles evidence metadata, upload, access, and finalization.
- `backend/src/api/createApiRequestHandler.ts:437` to `507` handles report submission and status.

### 3.7 Role and supervisor approval boundaries exist but are not represented in the visual shell

The role model and connected review services exist:

- `mobile/src/features/auth/model.ts:1` defines `technician`, `supervisor`, and `manager` roles.
- `mobile/src/features/auth/model.ts:47` to `52` exposes review capability only for connected supervisor/manager sessions.
- `mobile/src/features/auth/sessionController.ts:29` to `70` restores/signs in a session with cached role information.
- `mobile/src/features/auth/sessionController.ts:132` to `137` disables review actions for offline restored sessions.
- `backend/src/config/env.ts:145` to `172` seeds technician, supervisor, and manager users.
- `mobile/src/features/review/supervisorReviewService.ts:20` to `76` gates review operations by connected supervisor role.
- `backend/src/modules/review/supervisorReviewService.ts:48` to `73` exposes supervisor queue/detail only for review-capable roles.
- `backend/src/modules/review/supervisorReviewService.ts:76` to `180` implements approve, return, and escalate decisions with audit records and required comments where appropriate.

The visual approval screen bypasses these boundaries:

- `mobile/src/shell/VisualProductShell.tsx:783` to `843` renders local approval buttons without session role gating, queue status tabs, backend service calls, or confirmation prompts.
- `mobile/src/shell/VisualProductShell.tsx:172` to `180` makes approve/return local toast-style state transitions only.
- `mobile/src/shell/TagWiseApp.tsx:1636` to `1938` contains older connected review handlers that call `SupervisorReviewService`, but the old UI is no longer reachable from the primary render path.

### 3.8 AI diagnosis boundary is incomplete and visually misplaced

Product clarification requires local guided diagnosis/checklist to remain deterministic and offline-capable. AI diagnosis must be optional, assistive, provider/backend-bound, and report-level/pending-safe.

Current visual shell issue:

- `mobile/src/shell/VisualProductShell.tsx:682` to `698` shows "probable hypothesis" and "why this?" during local diagnosis as if they are deterministic local diagnosis fields.

Existing AI provider boundary:

- `_bmad-output/implementation-artifacts/7-5-ai-provider-readiness-boundary.md` records that provider readiness exists but actual mobile/report integration remains follow-up work.
- `backend/src/config/env.ts:99` to `129` configures AI provider flags.
- `backend/src/modules/ai-diagnosis/model.ts:1` to `28` defines provider-agnostic diagnosis input/output with assistive AI disclaimer.
- `backend/src/modules/ai-diagnosis/aiDiagnosisProviderFactory.ts:12` to `30` returns mock/disabled/OpenAI providers according to configuration.
- `backend/src/modules/ai-diagnosis/openAiDiagnosisProvider.ts:40` to `78` generates AI diagnosis while instructing the provider not to override deterministic calculations or review decisions.

Root-cause assessment: this is partly a visual placement bug and partly an incomplete product integration. The backend/provider boundary exists, but the report lifecycle does not yet have a complete mobile queue/job/result section for "AI Diagnosis". The repair should not put AI into the local checklist path. It should add a report-level AI diagnosis projection with states such as `not_requested`, `queued`, `pending`, `available`, `unavailable`, or `failed_non_blocking`.

### 3.9 Tests currently protect the demo behavior instead of the product behavior

The visual workflow tests assert PT-204 fallback behavior:

- `mobile/src/features/visual-shell/visualWorkflow.test.ts:10` to `19` verifies PT-204 as the selected visual tag.
- `mobile/src/features/visual-shell/visualWorkflow.test.ts:21` to `61` verifies local tags are merged while PT-204 remains selected.

These tests should be replaced or supplemented with regression tests that assert selected tag identity is preserved and visual components consume service-backed state.

## 4. Repair strategy options

### Option A: Keep the dark visual shell and reconnect it through thin adapters

Description:

Keep `VisualProductShell` as the primary user experience, but remove business truth from the visual model. Introduce thin screen-specific adapters/view-models that map existing local-first service state into visual props and expose existing service commands as callbacks.

Examples:

- `VisualInstrumentListViewModel` from `AssignedWorkPackageCatalogService` and local package snapshots.
- `VisualTagContextViewModel` from `LocalTagContextService`.
- `VisualExecutionViewModel` from `SharedExecutionShellService.loadShell`.
- `VisualCalculationCommands` wrapping `saveCalculation`.
- `VisualReportCommands` wrapping `saveReportDraft`, `attachPhotoEvidence`, and `submitReport`.
- `VisualSupervisorReviewViewModel` wrapping `SupervisorReviewService` and session role state.

Benefits:

- Preserves the visual improvement.
- Aligns with architecture guidance that visual screens should be presentation screens backed by local-first services.
- Restores production behavior without duplicating domain logic.
- Creates a testable contract that prevents future visual-only regressions.

Risks:

- Medium implementation complexity because several screens must be rewired carefully.
- Requires disciplined state ownership: visual components should not silently fall back to PT-204 or static report data in authenticated flows.
- May expose UI gaps where the dark layout lacks controls for real execution states.

Expected implementation cost: Medium. Safest as a sequence of focused stories.

### Option B: Partially revert to the working service-backed shell and restyle incrementally

Description:

Make the older white technical shell reachable again for critical flows, then reapply the dark visual styling incrementally on top of the service-backed screens.

Benefits:

- Fastest way to restore known working paths for QR, execution, report/evidence, sync, and approval.
- Lower immediate risk to offline-first workflows.
- Lets QA validate existing services before visual migration resumes.

Risks:

- Temporarily loses the visual progress that motivated Story 8.1.
- Can lead to two competing UI systems if not time-boxed.
- May delay product screenshot/experience alignment.

Expected implementation cost: Low to medium for immediate recovery, but higher total cost if visual migration restarts without adapters.

### Option C: Hybrid recovery path

Description:

Keep dark visual components where they can consume real service-backed state now, and temporarily route critical flows back to existing functional components or service-backed wrappers where the visual shell is not yet wired. Treat Option A as the target architecture and Option C as the recovery sequence.

Benefits:

- Restores product safety fastest without discarding the visual direction.
- Allows phased QA by flow: identity/QR first, execution second, report/evidence third, approval fourth.
- Avoids a big-bang rewrite of every dark screen.
- Makes it acceptable to leave purely visual components only where they are clearly non-authoritative.

Risks:

- Temporary UI inconsistency between dark shell and legacy/service-backed flow.
- Requires explicit routing rules so technicians are never sent into demo approval/report paths.
- Needs regression tests to ensure demo data cannot leak into authenticated execution.

Expected implementation cost: Medium-low for the first recovery story, medium overall.

## 5. Recommended architecture direction

Recommended option: Option C immediately, converging to Option A.

The product should keep the dark visual shell as the direction, but the next implementation work should reconnect the shell to the existing offline-first domain/application services instead of adding new fake state. The repair should use a thin adapter/view-model layer, not new domain logic inside React components.

Architecture rules for the repair:

- Visual components may format and present data, but they must not own instrument identity, report lifecycle, evidence lifecycle, approval state, or calculation truth.
- In authenticated/production flows, no visual screen may fall back to PT-204, `seededTags[0]`, or screenshot-only data unless the user explicitly selected/scanned that tag.
- QR/list selection must pass tag identity through route state and resolve context through local repositories/services.
- Calculation must call the deterministic execution service and work offline.
- Guidance/checklist/norm references must come from the selected tag/template/local package snapshot and remain nonblocking.
- Report/evidence must use the existing local draft, photo/evidence, queue, and sync lifecycle.
- Supervisor approval must be session/role gated and backend-connected. Technician execution must not expose the approval queue.
- AI diagnosis must be separated from deterministic guidance and represented in reports as an optional "AI Diagnosis" section with pending/unavailable states that never block the technician.
- Backend-connected testing is required for login, package download, report submission, evidence sync, approval decisions, and AI provider-bound report behavior.

This is not an overengineering recommendation. It is a guardrail: the existing services already hold most of the behavior. The missing piece is a reliable presentation adapter boundary that the visual shell must use.

## 6. Story slicing recommendation

Recommended split: four repair stories plus one small architecture/story-map update before implementation.

### Pre-story architecture/story-map update

Before creating implementation stories, update the architecture/story-map artifacts to record the "visual shell must consume service-backed state" rule and the phased repair sequence. This prevents the next story from being interpreted as another visual-only pass.

### Story A: Reconnect visual shell to real instrument catalog, QR, and selection state

Goal: restore identity correctness and local catalog ownership.

Scope:

- Replace visual-shell selected-tag fallback in authenticated flows.
- Use local/downloaded package tags as the catalog source.
- Pass selected tag id through visual navigation.
- Call local QR resolver for scan payloads.
- Open the matching tag context and execution shell for the selected/scanned tag.
- Keep screenshot seed data only as explicit offline demo or empty-state data, not production flow data.

This should be the immediate next implementation story because every other flow depends on correct selected instrument identity.

### Story B: Reconnect calculator, history, checklist, and guidance

Goal: restore offline execution behavior.

Scope:

- Wire visual calculation inputs to deterministic calculation service.
- Add template-driven conversion helpers, especially PV <-> mA <-> percent where the local template provides conversion basis.
- Render history comparison from selected tag context/report state.
- Render checklist, guidance, best practices, and references from local template/guidance data.
- Keep steps nonblocking with explicit risk/justification capture.

### Story C: Reconnect report, evidence, photos, and AI diagnosis report projection

Goal: restore local-first report lifecycle.

Scope:

- Render report summary from execution shell report projection.
- Preserve intended editability for final notes/corrections/observations.
- Wire photo/attachment actions to local evidence capture and queue.
- Submit through the local report/evidence queue.
- Add or prepare the "AI Diagnosis" report section as available/pending/unavailable without blocking technician execution.

### Story D: Reconnect role-aware supervisor approval queue and decisions

Goal: restore connected review lifecycle and RBAC.

Scope:

- Hide approval queue/actions from technicians.
- Add supervisor queue tabs/lists by report status.
- Load queue/detail from `SupervisorReviewService`.
- Require confirmation before approve/return/escalate.
- Capture comments/return reasons/escalation rationale.
- Show auditable decision trail and connected/offline constraints.

### Best split for safety and QA

Use the four-story split. Do not combine all repairs into one large story. The identity/QR/catalog repair is the critical first slice because it prevents every later service call from operating against the wrong instrument. Calculator/guidance, report/evidence, and approval each touch different service boundaries and need separate regression checks.

## 7. Acceptance criteria proposal

For the immediate next implementation story, the minimum acceptance criteria should be:

- QR scan resolves the scanned local tag/instrument and opens the matching tag context; it opens PT-204 only if PT-204 was scanned and exists in local data.
- Selecting each listed instrument opens that exact instrument, preserving tag id, work package id, and template context through navigation.
- The visual UI uses the project's local/downloaded instrument catalog data in authenticated flows, not screenshot-only visual seed data.
- If no local package data exists, the app shows a clear download/cache state and does not silently substitute PT-204.
- The selected tag context uses existing local repositories/services and remains available offline after download.
- Visual tests fail if the authenticated shell hardcodes PT-204, `seededTags[0]`, or no-argument instrument detail navigation.

For the full repair sequence, acceptance criteria should include:

- Calculator conversions and deterministic calculations work offline for supported templates, including PV <-> mA <-> percent where conversion metadata exists.
- Absolute error, percent error/deviation, tolerance, expected vs measured, pass/fail, and unit display use the existing calculation/domain logic.
- Checklist, guidance, norm/reference, best-practice, and next-step content comes from cached project/template/reference data for the selected instrument/test.
- The deterministic local diagnosis/checklist remains usable offline and never hard-blocks the technician.
- AI diagnosis is represented in the report as "AI Diagnosis" when available, queued, pending, unavailable, or failed nonblocking; it is not required to proceed with field execution.
- Report summary is generated from the real execution flow and technician-editable only where intended.
- Photos and attachments can be added offline, persisted locally, linked to report/tag/template/step, and queued/synced later.
- Submit uses the local report/evidence queue and backend report validation when connected.
- Technician cannot access supervisor approval queues or approval actions in the normal execution path.
- Supervisor can see report queues grouped by status such as pending review, returned, approved, and escalated where appropriate.
- Supervisor approve/return/escalate actions require confirmation and comments/reasons where required by the workflow.
- Supervisor decisions are sent through connected backend review APIs and produce an auditable decision trail.
- Backend-connected validation is included for login, package download, sync, report validation, evidence upload/finalization, approval, and AI-related report behavior.

## 8. Validation plan

### Unit tests

- Visual adapter tests for catalog projection from local package snapshots.
- QR resolver tests for tagwise URI, JSON, raw tag id, cache-hit, and cache-miss payloads.
- Navigation/state tests proving selected tag id is passed from dashboard/list/QR into detail and execution.
- Regression tests that authenticated visual shell does not hardcode PT-204 or fall back to `seededTags[0]`.
- Deterministic calculation tests for expected vs observed, absolute deviation, percent-of-span deviation, tolerance, unavailable values, and template-driven units.
- Conversion helper tests for PV <-> mA <-> percent where conversion basis exists.
- Guidance/checklist projection tests from local templates and guidance references.
- Report draft/evidence projection tests for editable fields, photo attachments, evidence status, and queued report state.
- Role gating tests for technician vs supervisor/manager approval visibility.
- Supervisor decision command tests for confirmation/comment requirements and service invocation.
- AI diagnosis report projection tests for pending/available/unavailable/failed-nonblocking states.

### Mobile integration tests

- Start with a downloaded local package, render the visual shell, select at least three different instruments, and assert each detail screen shows the selected instrument's actual context.
- Simulate QR payloads for multiple cached tags and assert the matching tag opens.
- Enter calculation values offline and assert the persisted report/execution state updates.
- Complete checklist/guidance notes and assert local persistence.
- Attach a photo/evidence item and assert local evidence metadata/report projection updates.
- Submit offline and assert queued lifecycle state rather than visual-only approval routing.
- Restore app state and verify selected work/report/evidence remains available offline.
- Sign in as technician and assert approval queue is hidden.
- Sign in as supervisor while connected and assert review queue/detail/actions are available.

### Manual APK smoke test

1. Sign in as technician with backend reachable.
2. Download a work package.
3. Disable network.
4. Open instruments by list and QR for at least two non-PT-204 tags.
5. Confirm the exact selected tag context opens each time.
6. Run calculator inputs and conversions offline.
7. Fill checklist/guidance/risk notes.
8. Add a photo and attachment/evidence item offline.
9. Generate/edit intended report notes.
10. Submit report while offline and verify queued state.
11. Re-enable network and verify evidence/report sync and backend validation.
12. Sign in as supervisor and verify the submitted report appears in the appropriate review queue.
13. Approve, return, and escalate separate test reports only after confirmation and comments where required.

### Connected backend smoke test

- Verify technician login, supervisor login, and role-specific capabilities against the local backend.
- Verify work-package list/download from backend seed data.
- Verify evidence metadata creation, binary upload, and finalization.
- Verify report submission reaches server validation and becomes review-ready only after acceptance.
- Verify supervisor queue/detail endpoints return only eligible reports.
- Verify approve/return/escalate decisions update status and append audit history.
- Verify returned reports can re-enter technician workflow according to existing lifecycle rules.
- Verify AI provider disabled/mock/openai configuration does not block report submission; report output shows "AI Diagnosis" pending/unavailable/available according to result state.

### Offline mode smoke test

- With a package downloaded, disable network before opening the app.
- Restore technician session and verify cached work packages/tags are available.
- Resolve cached QR/list entries offline.
- Run calculation, guidance/checklist, report draft, and photo/evidence capture offline.
- Submit offline and verify queued state.
- Confirm the app never hard-blocks technician execution due to missing AI, missing network, or pending sync.
- Confirm approval actions are unavailable offline because official approvals are connected/server-authoritative.

### Regression checks against visual-only bypass

- Add a test or static check that authenticated visual flow cannot import or select visual screenshot seed data as the source of truth.
- Add visual shell contract tests proving each screen receives a domain id and command handlers rather than constructing business state locally.
- Add a test that report submit calls the local execution/report service and does not navigate directly to approval.
- Add a test that technician sessions cannot reach approval queue/actions by visual route changes.
- Add a test that AI diagnosis text is absent from deterministic local checklist output unless it is explicitly represented as report-level AI diagnosis state.

## Final recommendation

Recommended option: Option C, the hybrid recovery path, with Option A as the target architecture. Preserve the dark visual direction, but immediately reconnect critical flows to existing local-first services and temporarily route any not-yet-wired critical screen back to service-backed components.

Recommended next BMAD agent/action: first update the architecture/story-map artifacts with this visual-shell service-backed adapter rule and the four-story repair sequence. Then call `bmad-create-story` for Story A, "Reconnect Visual Shell to Real Instrument Catalog, QR, and Selection State."

Do not create the implementation story before the architecture/story-map update unless speed is prioritized over governance. The project is production-minded and offline-first, so the next story should be grounded in this regression analysis rather than another visual-only pass.
