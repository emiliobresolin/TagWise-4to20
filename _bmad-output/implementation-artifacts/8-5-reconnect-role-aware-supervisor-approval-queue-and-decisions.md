# Story 8.5: Reconnect Role-Aware Supervisor Approval Queue and Decisions

Status: ready-for-dev

## Metadata
- Story key: 8-5-reconnect-role-aware-supervisor-approval-queue-and-decisions
- Story map ID: Visual Shell Regression Repair Story D
- Epic: Post-8.1 Mobile Visual Shell Repair
- Release phase: Visual Shell Regression Repair
- Created: 2026-05-09
- Source decision: `_bmad-output/planning-artifacts/visual-shell-service-backed-adapter-decision.md`
- Predecessors:
  - `_bmad-output/implementation-artifacts/8-2-reconnect-visual-shell-to-real-instrument-catalog-qr-and-selection-state.md`
  - `_bmad-output/implementation-artifacts/8-4-reconnect-visual-shell-to-real-report-evidence-photos-ai-diagnosis.md`

## User Story
As a supervisor using the dark TagWise mobile shell,
I want a role-gated connected review queue with report detail, confirmation prompts, comments/reasons, and auditable approve/return/escalate decisions,
so that approval remains server-authoritative while technicians stay out of reviewer-only workflows.

## Context
The visual shell currently contains an approval-looking screen that behaves like local demo UI. It is reachable from technician report flow, has no role-aware queue/tabs, uses no connected backend review service, and lacks confirmations before state-changing actions.

Existing mobile/backend review services already support connected supervisor and manager review queues, report detail, approve, return, escalate, mandatory comments/rationales, audit history, returned-report re-entry, and work-package roll-up. This story reconnects the dark shell to those services and restores the role boundary. Official review actions remain connected/server-authoritative only.

## Scope
In scope:
- Mobile visual shell role-aware review/approval UI.
- Hide supervisor review queues/actions from technician sessions.
- Show a supervisor review entry point only for connected supervisor sessions.
- If manager role support is already present and easy to preserve, keep manager queue/detail/action behavior service-backed; do not expand manager scope beyond existing services.
- Add review queue tabs/lists grouped by status where service data supports it, such as pending review, returned, approved, escalated, or empty/unavailable groups.
- Load queue and detail from `SupervisorReviewService`.
- Show report detail with execution summary, evidence references/status, risk flags, justifications, AI Diagnosis section if available from report detail/projection, and approval history.
- Require confirmation before approve, return, or escalate actions.
- Require comments for return and escalation rationale for escalation, using existing service validation.
- Dispatch approve/return/escalate through existing connected backend service methods.
- Show auditable decision trail and connected/offline constraints.
- Ensure technician report submit path never routes directly into approval.

## Out of Scope
- Do not implement technician report/evidence/photo/AI lifecycle. That is Story 8.4.
- Do not implement reviewer offline approval authority.
- Do not let reviewers edit technician calculations, evidence, or report content.
- Do not add new backend review contracts unless an existing contract is unreachable from the visual shell without a tiny adapter.
- Do not implement deep manager workflow expansion beyond already-existing manager review services.
- Do not build new approval state machines in visual components.

## Acceptance Criteria
1. Technician cannot access approval queue/actions in normal flow.
   - Technician sessions do not see supervisor review queue entry points.
   - Technician submit/report screens do not navigate to approval.
   - Direct visual route attempts or stale state cannot expose approve/return/escalate controls for technician sessions.

2. Supervisor review is role-gated and connected.
   - Connected supervisor sessions can load the review area.
   - Offline supervisor sessions or restored offline sessions see a clear connected-required state for official actions.
   - Non-supervisor/non-manager roles do not call review APIs.

3. Queue tabs/lists are service-backed.
   - Queue data is loaded through `SupervisorReviewService.refreshQueue`.
   - Items are grouped by `reportState` / lifecycle status from service data.
   - Empty tabs show empty/unavailable states, not demo reports.
   - Queue/list content does not include visual mock reports.

4. Report detail is service-backed.
   - Detail loads through `SupervisorReviewService.loadReportDetail`.
   - Detail shows execution summary, history summary, draft diagnosis summary, evidence references, evidence status, photo attachment state, risk flags, justifications, lifecycle state, sync state, and approval history from backend/mobile review models.
   - Detail does not let reviewer edit technician evidence/calculations.

5. Approve requires confirmation and connected service dispatch.
   - Pressing approve opens a confirmation prompt/modal before command dispatch.
   - Confirmed approve calls `SupervisorReviewService.approveReport`.
   - Successful approve removes or updates the item in queue/detail state and shows audit/decision feedback.
   - Failed approve keeps the report visible and shows recoverable error guidance.

6. Return requires confirmation and comment.
   - Return action requires non-empty comment/reason before dispatch.
   - Confirmation occurs before command dispatch.
   - Confirmed return calls `SupervisorReviewService.returnReport`.
   - Service-side blank-comment validation is preserved.
   - Decision feedback makes returned state/comment audit visible where available.

7. Escalate requires confirmation and rationale.
   - Escalation action requires non-empty rationale before dispatch.
   - Confirmation occurs before command dispatch.
   - Confirmed escalation calls `SupervisorReviewService.escalateReport`.
   - Service-side blank-rationale validation is preserved.
   - Escalated report leaves the standard supervisor queue according to existing service behavior.

8. Approval history is auditable.
   - Approval history items render actor role, action type, timestamp, prior/next state, comment/rationale, and correlation id where provided.
   - Empty history shows the existing placeholder.
   - New decisions refresh queue/detail or show enough feedback that the user can trust server acceptance.

9. Connected backend validation is respected.
   - Official decisions require backend reachability and a connected reviewer session.
   - Network/server errors do not mutate local approval UI into a fake success state.
   - Backend-connected APK smoke is documented because approval cannot be validated in APK isolation.

10. Regression tests protect RBAC and visual-only bypass.
    - Tests fail if technician can see approval actions.
    - Tests fail if visual approval buttons mutate local demo state without calling review service.
    - Tests fail if return/escalate dispatch without required comments/rationales.
    - Tests fail if queue/detail uses mock approval data in authenticated flow.

11. Validation commands pass.
    - `cd mobile && npm run typecheck`
    - `cd mobile && npm test`
    - `cd mobile && npx expo-doctor`
    - If backend contracts or API tests are touched: `cd backend && npm run typecheck` and `cd backend && npm test`
    - `cd .. && git diff --check`

12. Manual APK/backend smoke validates connected approval.
    - Backend reachable for supervisor login and review API calls.
    - Technician can submit/sync a report through Story 8.4 path until server-accepted/pending review.
    - Supervisor signs in while connected and sees pending review queue/list.
    - Supervisor opens report detail and sees evidence/risk/history/approval history.
    - Supervisor approve, return, and escalate each require confirmation.
    - Return requires comment; escalation requires rationale.
    - Decision appears in audit/history or queue/detail state after backend acceptance.
    - Technician role cannot see supervisor queue/actions.

## Tasks / Subtasks
- [ ] Confirm existing review service boundary (AC: 2-4, 9)
  - [ ] Inspect `SupervisorReviewService`, API client, model types, and current `TagWiseApp` review handlers.
  - [ ] Confirm backend review APIs already cover queue/detail/approve/return/escalate.
  - [ ] Do not add backend work unless a tiny existing-contract adapter is unavoidable.

- [ ] Add role-aware visual review routing (AC: 1, 2, 10)
  - [ ] Gate review entry by `session.role` and `session.connectionMode`.
  - [ ] Hide reviewer-only UI from technician sessions.
  - [ ] Prevent visual route state from exposing approval controls to technicians.

- [ ] Wire queue tabs/lists (AC: 3, 9)
  - [ ] Pass supervisor review queue state and refresh handler into `VisualProductShell`.
  - [ ] Group items by service-provided status/lifecycle.
  - [ ] Render empty/unavailable states without mock approval data.

- [ ] Wire service-backed report detail (AC: 4, 8)
  - [ ] Pass selected review detail state and open/close handlers into visual shell.
  - [ ] Render execution/evidence/risk/justification/approval-history data from `SupervisorReviewReportDetail`.
  - [ ] Keep reviewer detail read-only for field evidence/calculations.

- [ ] Add confirmations and decision actions (AC: 5-7, 9)
  - [ ] Use React Native primitives or existing visual modal patterns for confirmation.
  - [ ] Confirm before approve, return, and escalate.
  - [ ] Require return comment and escalation rationale before dispatch.
  - [ ] Reuse existing `TagWiseApp` decision handlers or thin adapted callbacks.

- [ ] Add focused tests (AC: 1-10)
  - [ ] Role-gating tests for technician, supervisor, manager if preserved, and offline reviewer sessions.
  - [ ] Queue/detail adapter tests proving service data is displayed.
  - [ ] Confirmation/comment/rationale tests for decision actions.
  - [ ] Regression tests that authenticated review UI cannot use demo approval data.

- [ ] Validate and update Dev Agent Record (AC: 11, 12)
  - [ ] Run required validation commands.
  - [ ] Document backend-connected APK smoke path and whether physically executed.
  - [ ] Confirm no technician report/evidence implementation was added.

## Dev Notes

### Architectural Guardrails
- Supervisor approval is backend-connected and server-authoritative.
- Official review actions are online-only in v1.
- Reviewers create decisions; they do not edit technician report content, evidence, or deterministic calculations.
- Technician flow must not route directly into approval.
- Do not treat work package as the primary review unit; per-tag report remains canonical.

### Previous Story Intelligence
- Story 8.2 removed authenticated PT-204/demo fallback and preserved selected tag identity.
- Story 8.4 should restore technician report/evidence/submit/sync. This story starts after server-accepted review-ready reports exist.
- Existing Epic 6 stories already built backend/mobile review services. Reuse them.

### Existing Services / Modules To Reuse
- `mobile/src/features/auth/model.ts`
  - user roles
  - `canReviewReports`
- `mobile/src/features/review/supervisorReviewService.ts`
  - `refreshQueue`
  - `loadReportDetail`
  - `approveReport`
  - `returnReport`
  - `escalateReport`
  - manager methods if preserved
- `mobile/src/features/review/supervisorReviewApiClient.ts`
  - connected API calls
- `mobile/src/features/review/model.ts`
  - queue/detail/decision/approval history types
- `mobile/src/shell/TagWiseApp.tsx`
  - existing review state and handlers
- `backend/src/modules/review/supervisorReviewService.ts`
  - server-authoritative validation reference
- `backend/src/modules/report-submissions/reportSubmissionService.ts`
  - accepted report/review lifecycle reference

### Likely Files / Modules To Inspect
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/src/shell/VisualProductShell.tsx`
- `mobile/src/features/visual-shell/model.ts`
- `mobile/src/features/visual-shell/visualWorkflow.test.ts`
- `mobile/src/features/auth/model.ts`
- `mobile/src/features/auth/sessionController.ts`
- `mobile/src/features/review/model.ts`
- `mobile/src/features/review/supervisorReviewService.ts`
- `mobile/src/features/review/supervisorReviewService.test.ts`
- `mobile/src/features/review/supervisorReviewApiClient.ts`
- `backend/src/api/createApiRequestHandler.ts`
- `backend/src/api/createApiRequestHandler.test.ts`
- `backend/src/modules/review/supervisorReviewService.ts`

### Validation / Test Plan
- Unit tests for role-gated visual review adapter/view-models.
- Unit or component-level tests for queue grouping and detail projection.
- Interaction tests for approve/return/escalate confirmation flow.
- Service tests should remain green for supervisor review behavior.
- Backend tests required only if backend contracts are touched.
- Manual APK smoke must use a reachable backend for login, report sync/acceptance, queue loading, and decisions.

### Risks
- Letting technician sessions access approval would violate RBAC and product flow.
- Simulating approval locally would break auditability and server-authoritative lifecycle.
- Combining report/evidence repair and approval repair in one story would blur technician and reviewer ownership.
- Backend unreachability in APK smoke is a real blocker for approval validation; do not claim isolated APK approval success without backend.

### Dependencies
- Story 8.2 done from QA perspective.
- Story 8.4 should provide service-backed technician report submission/sync path.
- Existing Epic 6 review services and backend APIs.
- Backend must be running/reachable for connected supervisor login, queue/detail, and decisions.

### References
- `_bmad-output/planning-artifacts/visual-shell-functional-regression-analysis.md`
- `_bmad-output/planning-artifacts/visual-shell-service-backed-adapter-decision.md`
- `_bmad-output/planning-artifacts/architecture.md#Approval and Audit Architecture`
- `_bmad-output/planning-artifacts/architecture.md#Offline / Mobile Architecture`
- `_bmad-output/planning-artifacts/story-map.md#Visual Shell Regression Repair Addendum`
- `_bmad-output/implementation-artifacts/6-1-supervisor-review-queue-and-report-detail.md`
- `_bmad-output/implementation-artifacts/6-2-supervisor-approve-and-return-for-standard-cases.md`
- `_bmad-output/implementation-artifacts/6-3-supervisor-escalation-for-higher-risk-cases.md`
- `_bmad-output/implementation-artifacts/6-5-approval-history-work-package-roll-up-and-returned-report-re-entry.md`
- `_bmad-output/implementation-artifacts/8-2-reconnect-visual-shell-to-real-instrument-catalog-qr-and-selection-state.md`
- `_bmad-output/implementation-artifacts/8-4-reconnect-visual-shell-to-real-report-evidence-photos-ai-diagnosis.md`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
