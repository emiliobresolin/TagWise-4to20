# Story 8.4: Reconnect Visual Shell to Real Report, Evidence, Photos, and AI Diagnosis Projection

Status: done

## Metadata
- Story key: 8-4-reconnect-visual-shell-to-real-report-evidence-photos-ai-diagnosis
- Story map ID: Visual Shell Regression Repair Story C
- Epic: Post-8.1 Mobile Visual Shell Repair
- Release phase: Visual Shell Regression Repair
- Created: 2026-05-09
- Source decision: `_bmad-output/planning-artifacts/visual-shell-service-backed-adapter-decision.md`
- Predecessors:
  - `_bmad-output/implementation-artifacts/8-2-reconnect-visual-shell-to-real-instrument-catalog-qr-and-selection-state.md`
  - `_bmad-output/implementation-artifacts/8-3-reconnect-visual-shell-to-real-technical-execution-flow.md`

## User Story
As a technician using the dark TagWise mobile shell,
I want the report, evidence, photo, submission, sync, and report-level AI Diagnosis areas to use the real local-first report lifecycle,
so that my per-tag report is generated from executed work, editable where intended, preserved offline, and submitted through the proper queue instead of jumping into visual approval.

## Context
Story 8.2 restored selected tag identity. Story 8.3 should reconnect technical execution screens to the real `SharedExecutionShell`. The dark report screen still renders static visual summary rows, placeholder attachments, and a submit action that routes directly to visual approval. That bypasses the production per-tag report lifecycle, evidence metadata, local media sandbox, outbound sync queue, and server validation.

Existing services already support report draft generation, technician review notes, photo capture/attachment, local evidence metadata, offline submission queueing, evidence upload orchestration, report validation, sync state, and returned-report re-entry. This story wires the visual report surface to those services. It also adds the report-level "AI Diagnosis" projection required by the visual-shell decision, while keeping AI optional, backend/provider-bound, pending-safe, and nonblocking.

## Scope
In scope:
- Mobile visual shell report/evidence/photo/submission wiring.
- Render the report summary from `SharedExecutionShell.report` and related execution/evidence state.
- Preserve intended technician editability for final notes/corrections/review notes while the report is technician-owned draft.
- Wire photo capture/library attachment/removal to existing local evidence/photo handlers and local sandbox metadata.
- Render evidence references, minimum/expected evidence status, photo attachment status, risk flags, justifications, lifecycle state, and sync state from existing local report/evidence/sync models.
- Save report drafts through `SharedExecutionShellService.saveReportDraft`.
- Submit through `SharedExecutionShellService.submitReport` and existing outbound report/evidence queue behavior.
- Ensure submit does not navigate the technician directly into supervisor approval.
- Trigger or expose existing sync retry/refresh controls where already available from `SyncStateService` / `EvidenceUploadOrchestrator`.
- Add or prepare a report-level "AI Diagnosis" section with states: available, pending, unavailable, failed-nonblocking.
- Ensure AI diagnosis content is never required to complete technician execution or submit a report.

## Out of Scope
- Do not implement supervisor approval queue/actions/RBAC screens. That is Story 8.5.
- Do not add reviewer offline approval authority.
- Do not change backend report/evidence/review contracts unless an existing mobile caller cannot reach already-implemented behavior without a tiny adapter.
- Do not build a new AI job persistence system if no existing service boundary supports it. The minimum acceptable AI work in this story is a report-level projection that safely shows unavailable/pending/available/failure state without fake diagnosis content.
- Do not put AI diagnosis back into the local deterministic guidance/checklist screen.
- Do not duplicate evidence upload, report submission, or sync state machines inside visual components.

## Acceptance Criteria
1. Report summary is generated from real local execution state.
   - Authenticated visual report screen renders `SharedExecutionShell.report` projection for selected tag/template.
   - Execution summary, history summary, draft diagnosis summary, checklist outcomes, evidence references, risk flags, justifications, lifecycle state, and sync state come from local service state.
   - Static `model.report` summary and placeholder attachment arrays are not production truth.

2. Technician report editability is preserved and bounded.
   - Technician can edit only intended report-review fields such as final notes/corrections/review notes while report state is `technician-owned-draft`.
   - Saving invokes `SharedExecutionShellService.saveReportDraft`.
   - Submitted, synced, approved, or non-technician-owned report states are displayed read-only unless existing returned-report re-entry state allows technician edits.

3. Photos and attachments use local-first evidence services.
   - Camera and library actions call existing photo acquisition and `SharedExecutionShellService.attachPhotoEvidence` paths.
   - Remove action calls existing photo removal behavior.
   - Attachments persist locally, link to report/tag/template/step context, and remain visible offline.
   - Camera denial/cancel is nonblocking and leaves report state recoverable.

4. Evidence requirements and risk state are visible.
   - Minimum submission evidence and expected evidence states are shown from the report/evidence projection.
   - Missing expected evidence can require visible justification but does not erase the draft or force abandonment.
   - Missing minimum submission evidence is surfaced before submit according to existing service behavior.
   - Risk flags and justifications are displayed from local shell state.

5. Submit uses the real local report/evidence queue.
   - Submit invokes `SharedExecutionShellService.submitReport`.
   - Offline submit moves the local report into `Submitted - Pending Sync` / queued state.
   - Connected submit/sync uses existing queue/orchestrator behavior and server validation when reachable.
   - Submit never routes directly to visual approval and never marks a report review-ready without server acceptance.

6. Sync state and retry/refresh are service-backed.
   - Report and evidence sync badges/statuses come from `SyncStateService` / shell report state.
   - Retry/refresh actions reuse existing sync state service/orchestrator behavior where already present.
   - Sync issue messages remain structured and actionable.

7. AI Diagnosis is report-level and nonblocking.
   - Report screen includes a clearly labelled "AI Diagnosis" section.
   - States include available, pending, unavailable, and failed-nonblocking.
   - If no persisted/provider result exists, the UI shows unavailable or pending-safe state; it must not invent probable cause text.
   - AI content is never required for calculation, checklist, report draft save, submit, sync, or approval.
   - AI diagnosis is not shown as deterministic local guidance/checklist output.

8. Offline-first behavior is preserved.
   - After package download, technician can review/edit draft report fields, attach photos, save evidence, and submit to local queue offline.
   - Local reports/evidence remain available after app restart.
   - The app never hard-blocks field completion due to missing network, missing AI, missing expected evidence, or pending sync, except where existing minimum-submission evidence rules require a blocking validation.

9. Regression tests protect against visual-only bypass.
   - Tests fail if authenticated report screen uses static visual model report/attachment data.
   - Tests fail if visual submit navigates directly to approval instead of local report submission.
   - Tests fail if photo/attachment actions bypass local evidence services.
   - Tests fail if AI diagnosis appears in deterministic guidance rather than report-level projection.

10. Validation commands pass.
    - `cd mobile && npm run typecheck`
    - `cd mobile && npm test`
    - `cd mobile && npx expo-doctor`
    - If backend contracts or API tests are touched: `cd backend && npm run typecheck` and `cd backend && npm test`
    - `cd .. && git diff --check`

11. Manual APK/backend smoke validates report/evidence lifecycle.
    - Backend reachable for technician login and package download.
    - Technician downloads package, opens cached tag/template, completes minimal execution path, saves report draft, attaches photo, and submits.
    - With network disabled, report enters queued/pending-sync state and evidence remains locally visible.
    - With network restored and backend reachable, evidence/report sync progresses through existing validation states.
    - AI Diagnosis section shows available/pending/unavailable/failed-nonblocking according to configured/provided state and does not block submit.

## Tasks / Subtasks
- [x] Confirm prerequisites and current visual report bypass (AC: 1, 5, 9)
  - [x] Verify Story 8.2 identity and Story 8.3 execution shell state are available in `VisualProductShell`.
  - [x] Inspect current `ReportScreen` and remove authenticated reliance on `model.report`.
  - [x] Confirm current visual submit route to approval is removed or guarded out of technician flow.

- [x] Build report/evidence visual projection (AC: 1, 4, 6, 9)
  - [x] Project `SharedExecutionShell.report`, `guidance`, `evidence`, and sync detail into visual props.
  - [x] Keep projection thin and side-effect free.
  - [x] Distinguish technician-owned draft, submitted pending sync, pending validation, submitted pending review, returned, approved, and sync issue states where existing models expose them.

- [x] Wire report edit/save behavior (AC: 2, 8)
  - [x] Pass report-review note state and change handlers from `TagWiseApp`.
  - [x] Save draft through `SharedExecutionShellService.saveReportDraft`.
  - [x] Keep non-editable states read-only.

- [x] Wire photo and attachment actions (AC: 3, 4, 8)
  - [x] Reuse `handleAttachExecutionPhoto('camera' | 'library')` or equivalent existing handlers.
  - [x] Reuse `handleRemoveExecutionPhoto(evidenceId)`.
  - [x] Render local attachment preview/status from shell evidence state.
  - [x] Preserve camera denial/cancel as nonblocking.

- [x] Wire submit/sync behavior (AC: 5, 6, 8)
  - [x] Submit through `SharedExecutionShellService.submitReport`.
  - [x] Display local queued, syncing, pending-validation, synced, and sync-issue states from existing sync services.
  - [x] Reuse retry/refresh behavior where already implemented in `TagWiseApp`.
  - [x] Ensure no technician submit path opens approval.

- [x] Add report-level AI Diagnosis projection (AC: 7)
  - [x] Add a small projection type/state if needed under visual-shell or execution report projection.
  - [x] Use available persisted/provider state if one exists; otherwise show unavailable/pending-safe state without generated content.
  - [x] Ensure AI state is labelled assistive and nonblocking.
  - [x] Do not expose OpenAI keys or provider details in mobile.

- [x] Add focused tests (AC: 1-9)
  - [x] Adapter/view-model tests for report, evidence, sync, editable/read-only states, and AI Diagnosis states.
  - [x] Interaction tests for save draft, attach/remove photo callbacks, and submit callback.
  - [x] Regression test that technician submit does not route to approval.
  - [x] Regression test that authenticated report/evidence does not use static visual mock data.

- [x] Validate and update Dev Agent Record (AC: 10, 11)
  - [x] Run required validation commands.
  - [x] Document manual APK/backend smoke path and whether physically executed.
  - [x] Confirm no supervisor approval work was added.

## Dev Notes

### Architectural Guardrails
- Per-tag report is the canonical sync/review unit.
- Report and evidence lifecycle state belongs to existing local repositories/services and sync orchestration, not visual route state.
- Report submit is not approval. A technician's submit path moves through local queue/server validation and then review-ready state only after backend acceptance.
- Evidence binaries stay in the app sandbox until sync/finalization outcomes are known.
- AI diagnosis is optional, assistive, report-level, provider/backend-bound, and never a blocker.

### Previous Story Intelligence
- Story 8.2 gave the visual shell a correct selected local tag and template identity.
- Story 8.3 should provide real calculation/history/guidance state; this story should consume that shell/report state rather than reconstruct execution data.
- Stories 4.1, 4.2, 4.4, 5.1, 5.2, 5.3, 5.4, and 6.5 already built the local report/evidence/sync/re-entry lifecycle. Reuse those.

### Existing Services / Modules To Reuse
- `mobile/src/features/execution/sharedExecutionShellService.ts`
  - `saveGuidanceEvidence`
  - `attachPhotoEvidence`
  - `removePhotoEvidence`
  - `saveReportDraft`
  - `submitReport`
  - report/evidence projection loading through `loadShell`
- `mobile/src/platform/media/photoAcquisitionBoundary.ts`
  - camera/library acquisition seam
- `mobile/src/platform/files/appSandboxBoundary.ts`
  - local sandbox file storage
- `mobile/src/features/sync/evidenceUploadOrchestrator.ts`
  - `syncSubmittedReportEvidence`
  - `refreshReportServerStatus`
- `mobile/src/features/sync/syncStateService.ts`
  - report/package sync summaries
  - retry and refresh behavior
- `mobile/src/features/sync/syncStateModel.ts`
  - approved sync state labels/tones
- `mobile/src/features/review/model.ts`
  - report review status types only as display/reference, not approval commands
- `backend/src/modules/ai-diagnosis/*`
  - provider boundary reference only; do not move secrets or provider calls to mobile

### Likely Files / Modules To Inspect
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/src/shell/VisualProductShell.tsx`
- `mobile/src/features/visual-shell/model.ts`
- `mobile/src/features/visual-shell/visualWorkflow.test.ts`
- `mobile/src/features/execution/model.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `mobile/src/features/sync/evidenceUploadOrchestrator.ts`
- `mobile/src/features/sync/evidenceUploadOrchestrator.test.ts`
- `mobile/src/features/sync/syncStateService.ts`
- `mobile/src/features/sync/syncStateService.test.ts`
- `mobile/src/platform/media/photoAcquisitionBoundary.ts`
- `backend/src/modules/ai-diagnosis/model.ts`
- `backend/src/modules/ai-diagnosis/aiDiagnosisProvider.ts`

### Validation / Test Plan
- Unit tests for report/evidence/sync/AI visual projections.
- Interaction tests for edit/save, attach/remove, submit, retry/refresh callbacks.
- Existing shared execution and sync tests must remain green.
- Manual APK smoke must include connected backend for login/package download and later sync/report validation.
- Once package is downloaded, draft review, photo attachment, and offline submit must work without backend connectivity.
- If AI provider is disabled or unavailable, report displays nonblocking unavailable/pending-safe state.

### Risks
- Routing technician submit directly to approval would violate the production lifecycle.
- Faking AI diagnosis content would blur deterministic guidance and optional AI report intelligence.
- Allowing report edits after submit/server acceptance would break ownership and conflict rules.
- Combining supervisor approval into this story would make QA too broad; keep approval for Story 8.5.

### Dependencies
- Story 8.2 done from QA perspective.
- Story 8.3 should be implemented first or this story must preserve any still-static technical sections without treating them as report truth.
- Existing Epic 4 and Epic 5 report/evidence/sync services.
- Backend must be reachable for connected login, package download, evidence sync, report submission, and any provider-bound AI smoke.

### References
- `_bmad-output/planning-artifacts/visual-shell-functional-regression-analysis.md`
- `_bmad-output/planning-artifacts/visual-shell-service-backed-adapter-decision.md`
- `_bmad-output/planning-artifacts/architecture.md#Offline / Mobile Architecture`
- `_bmad-output/planning-artifacts/architecture.md#Sync Architecture`
- `_bmad-output/planning-artifacts/architecture.md#AI Boundary Architecture`
- `_bmad-output/planning-artifacts/story-map.md#Visual Shell Regression Repair Addendum`
- `_bmad-output/implementation-artifacts/4-1-structured-execution-evidence-capture.md`
- `_bmad-output/implementation-artifacts/4-2-photo-capture-and-local-media-attachment.md`
- `_bmad-output/implementation-artifacts/4-4-per-tag-report-draft-generation-and-review.md`
- `_bmad-output/implementation-artifacts/5-1-local-submission-and-outbound-sync-queue.md`
- `_bmad-output/implementation-artifacts/5-2-evidence-upload-orchestration-and-binary-finalization.md`
- `_bmad-output/implementation-artifacts/5-3-sync-state-ui-retry-and-resume-behavior.md`
- `_bmad-output/implementation-artifacts/5-4-server-validation-conflict-rejection-and-post-sync-refresh.md`
- `_bmad-output/implementation-artifacts/7-5-ai-provider-readiness-boundary.md`
- `_bmad-output/implementation-artifacts/8-2-reconnect-visual-shell-to-real-instrument-catalog-qr-and-selection-state.md`

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Debug Log References
- `cd mobile; npm run typecheck` - passed.
- `cd mobile; npm test -- --run src/features/visual-shell/serviceBackedReport.test.ts src/features/visual-shell/serviceBackedExecution.test.ts src/features/visual-shell/visualWorkflow.test.ts` - passed, 3 files / 19 tests.
- `cd mobile; npm test` - passed, 26 files / 147 tests.
- `cd mobile; npx expo-doctor` - passed, 17/17 checks.
- `cd ..; git diff --check` - passed with existing CRLF normalization warnings for `mobile/src/shell/TagWiseApp.tsx` and `mobile/src/shell/VisualProductShell.tsx`.

### Completion Notes List
- Added `serviceBackedReport` as a thin, side-effect-free visual report/evidence/sync/AI Diagnosis projection over `SharedExecutionShell` and `ReportSyncDetail`.
- Authenticated dark-shell report rendering now uses service-backed report summary, checklist outcomes, evidence references, photo attachments, risk flags, review notes, lifecycle state, and sync state.
- Kept signed-out visual report/approval behavior as explicit demo-only. Authenticated technician submit no longer routes to approval and stays on the report lifecycle.
- Wired visual report actions to existing `TagWiseApp` handlers for draft note edits, draft save, camera/library photo attachment, photo removal, submit, sync retry, and server-status refresh.
- Updated report/evidence/save/photo handlers to refresh `reportSyncDetail` and package sync summaries after local report/evidence changes.
- Added a report-level `AI Diagnosis` projection with available, pending, unavailable, and failed-nonblocking states. The default mobile projection shows unavailable without invented diagnostic content.
- No supervisor approval queue/actions/RBAC implementation was added; that remains for Story 8.5.
- Manual APK/backend smoke path was documented but not physically executed in this environment:
  - Backend reachable for technician login and package download.
  - Technician downloads package, opens cached tag/template, completes minimal execution path, saves report draft, attaches photo, and submits.
  - With network disabled, report enters queued/pending-sync state and evidence remains locally visible.
  - With network restored and backend reachable, evidence/report sync progresses through existing validation states.
  - AI Diagnosis section shows available/pending/unavailable/failed-nonblocking according to configured/provided state and does not block submit.

### File List
- `mobile/src/features/visual-shell/serviceBackedReport.ts`
- `mobile/src/features/visual-shell/serviceBackedReport.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/src/shell/VisualProductShell.tsx`
- `_bmad-output/implementation-artifacts/8-4-reconnect-visual-shell-to-real-report-evidence-photos-ai-diagnosis.md`

## Final Epic 8 QA Update

Final story status: done / pass.

Final Epic 8 verdict: Pass with minor concerns.

Review date: 2026-05-10

QA confirmed Story 8.4 reconnected the authenticated report/evidence/photo/submission/sync area to the existing local-first report lifecycle: report projection reads from `SharedExecutionShell.report` and related sync/evidence state, photo actions route through existing acquisition/evidence services, technician submit calls the report lifecycle instead of supervisor approval, sync retry/refresh remains service-backed, and report-level AI Diagnosis is optional, nonblocking, and does not invent provider content.

Blocking findings for final Epic 8 QA: none.

Residual concern: real APK/backend end-to-end smoke was not physically executed in this environment. Before release/demo confidence, validate offline report draft edits, photo attachment/removal, offline submit to pending sync, reconnect sync/server validation, and AI Diagnosis unavailable/pending/available display behavior where backend/provider state exists.
