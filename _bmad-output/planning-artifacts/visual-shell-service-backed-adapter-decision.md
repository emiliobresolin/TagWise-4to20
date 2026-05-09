# Visual Shell Service-Backed Adapter Decision

Date: 2026-05-09
Status: Approved planning decision for next-story creation
Related analysis: [`visual-shell-functional-regression-analysis.md`](visual-shell-functional-regression-analysis.md)

## Decision

The dark visual shell remains the primary visual direction for TagWise, but it must be service-backed in authenticated/production flows. Visual components are presentation components only. They may format, group, and display state, but they must not own production business truth.

Visual components must not own:
- instrument/tag identity
- selected work package identity
- execution template identity
- calculation truth
- report lifecycle state
- evidence lifecycle state
- sync lifecycle state
- approval state
- AI diagnosis state

Authenticated visual screens must consume state from existing local-first/domain/application services through thin adapters or view models.

## Prohibited authenticated fallbacks

The visual shell must not silently fall back to:
- `PT-204`
- `seededTags[0]`
- screenshot-only visual mock data
- no-argument navigation that loses selected tag identity

Screenshot/demo seed data may exist only as explicit demo or empty-state data. It is not the source of truth for authenticated execution.

## Required production flow ownership

Expected flow:

`tag / QR / list -> instrument context -> calculation -> history comparison -> deterministic guided diagnosis / checklist / normative reference -> report / evidence -> submit / sync -> supervisor approval`

Ownership:
- QR/list/tag opening resolves through local package/tag services.
- Instrument context comes from downloaded/local package snapshots.
- Calculation calls the deterministic calculation/execution service and works offline.
- Checklist, guidance, best-practice, and normative references come from selected tag/template/local cached reference data.
- Report and evidence use existing local draft/evidence/queue/sync services.
- Supervisor approval is role-gated and backend-connected.
- Technician flow does not route directly into approval.
- AI diagnosis remains assistive, backend/provider-bound when needed, and report-level. It is represented as available, pending, unavailable, or failed nonblocking. It does not block technician execution and does not replace deterministic offline guidance.

## Repair sequence

### Story A - Reconnect Visual Shell to Real Instrument Catalog, QR, and Selection State

Goal: Restore identity correctness and local catalog ownership.

Scope:
- Replace visual-shell selected-tag fallback in authenticated flows.
- Use local/downloaded package tags as catalog source.
- Pass selected tag id, work package id, and template context through visual navigation.
- Call the existing local QR resolver for scan payloads.
- Open the matching tag context and execution shell for the selected/scanned tag.
- Keep screenshot seed data only as explicit demo or empty-state data.
- Add tests that fail on PT-204 hardcoding, `seededTags[0]` fallback, or no-argument detail navigation.

### Story B - Reconnect Calculator, History, Checklist, and Guidance

Goal: Restore offline execution behavior.

Scope:
- Wire visual calculation inputs to deterministic calculation service.
- Add template-driven conversion helpers, especially PV <-> mA <-> percent where metadata exists.
- Render history from selected tag context/report state.
- Render checklist, best practices, next step, and normative references from local template/guidance data.
- Keep all missing-data conditions nonblocking with explicit risk/justification capture.

### Story C - Reconnect Report, Evidence, Photos, and AI Diagnosis Report Projection

Goal: Restore local-first report/evidence lifecycle.

Scope:
- Render report summary from execution shell report projection.
- Preserve intended editability for technician observations/final notes.
- Wire photo/attachment actions to local evidence capture and queue.
- Submit through local report/evidence queue.
- Add or prepare report-level "AI Diagnosis" section with available, pending, unavailable, and failed-nonblocking states.

### Story D - Reconnect Role-Aware Supervisor Approval Queue and Decisions

Goal: Restore connected review lifecycle and RBAC.

Scope:
- Hide approval queue/actions from technician users.
- Add supervisor queue tabs/lists by report status.
- Load queue/detail from `SupervisorReviewService`.
- Require confirmation before approve/return/escalate.
- Capture comments, return reasons, and escalation rationale.
- Show auditable decision trail and connected/offline constraints.

## Validation requirements

- Unit tests for visual adapters/view models.
- QR resolver and selected-tag identity tests.
- Regression tests that authenticated visual shell cannot hardcode PT-204 or use `seededTags[0]`.
- Tests proving selected tag id flows from dashboard/list/QR into detail/execution.
- Offline smoke test after package download.
- Connected backend smoke test for login, package download, report submission, evidence sync, approval, and AI-related report behavior.
- APK manual smoke must consider whether the backend is currently running/reachable. APK testing must not be treated as isolated when login/sync/approval/evidence/AI are involved.

## Next planning action

Use this decision and the regression analysis as source material for the next story. The next implementation story should be Story A: "Reconnect Visual Shell to Real Instrument Catalog, QR, and Selection State."
