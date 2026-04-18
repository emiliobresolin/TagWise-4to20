# TagWise Story Map

Status: Aggregate story decomposition baseline

Source of truth:
- `_bmad-output/planning-artifacts/product-brief.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/epics.md`
- `docs/MVP/TagWise_Project_Instructions.txt`
- `docs/MVP/TagWise.pdf`

## Story Decomposition Strategy
This story plan decomposes the approved epic structure into implementation-ready work without reopening product or architecture decisions. The decomposition follows four rules:

- Build the local-first and server-authoritative foundations before feature breadth.
- Keep the tag as the operational anchor and the per-tag report as the canonical submission/review/sync unit.
- Deliver multi-instrument support through one shared execution shell and bounded template packs, not one app track per family.
- Keep AI out of the first-release critical path; only the release-hardening slices of Epic 7 are decomposed here.

This file remains the planning-level aggregate view. The execution-facing one-file-per-story handoff now lives in `_bmad-output/implementation-artifacts`.

The first release story cut includes:
- Epics 1 through 6 in full
- Release-hardening stories from Epic 7 only

The first release does not include:
- reviewer offline approval
- deep SAP / Maximo / TOTVS integration
- business-user template builder/admin studio
- AI-dependent workflow behavior

## Recommended Implementation Order
### Phase 1 - Platform and local-first baseline
1. `E1-S1` Mobile app shell and SQLite bootstrap
2. `E1-S2` Backend, worker, PostgreSQL, and object storage bootstrap
3. `E1-S3` Connected authentication, offline session continuity, and role cache
4. `E1-S4` User-partitioned local repositories and media sandbox
5. `E1-S5` Audit, logging, and error capture baseline

### Phase 2 - Offline work package and tag entry
6. `E2-S1` Assigned work package list and download
7. `E2-S2` Offline readiness and package freshness states
8. `E2-S3` Tag entry by assigned list and local search
9. `E2-S4` QR scan entry and cache-miss handling
10. `E2-S5` Tag context screen

### Phase 3 - Shared execution shell and v1 template support
11. `E3-S1` Shared execution shell and template contract
12. `E3-S2` Deterministic calculation and acceptance engine
13. `E3-S3` Pressure, temperature/RTD, and level transmitter template pack
14. `E3-S4` Analog 4-20 mA loop template pack
15. `E3-S5` Control valve with positioner template pack
16. `E3-S6` History comparison and freshness cues
17. `E3-S7` Guided diagnosis, checklist, and lightweight guidance flow

### Phase 4 - Evidence, risk, and report assembly
18. `E4-S1` Structured execution evidence capture
19. `E4-S2` Photo capture and local media attachment
20. `E4-S3` Justification triggers and non-blocking risk UX
21. `E4-S4` Per-tag report draft generation and review

### Phase 5 - Submission and sync
22. `E5-S1` Local submission and outbound sync queue
23. `E5-S2` Evidence upload orchestration and binary finalization
24. `E5-S3` Sync state UI, retry, and resume behavior
25. `E5-S4` Server validation, conflict rejection, and post-sync refresh

### Phase 6 - Review and approval
26. `E6-S1` Supervisor review queue and report detail
27. `E6-S2` Supervisor approve and return for standard cases
28. `E6-S3` Supervisor escalation for higher-risk cases
29. `E6-S4` Manager review and decision for escalated cases
30. `E6-S5` Approval history, work-package roll-up, and returned-report re-entry

### Phase 7 - Release hardening only
31. `E7-S1` Staging/production deployment, secrets, and backups
32. `E7-S2` Monitoring, alerting, and release observability hardening
33. `E7-S3` Evidence access control and retention baseline
34. `E7-S4` Worker resilience and operational recovery runbook

## Epic 1 Stories
### E1-S1 Mobile App Shell and SQLite Bootstrap
- User story: As a technician, I want the mobile app to open into a reliable local-first shell so field work can continue even when connectivity is poor.
- Scope: mobile navigation shell, app startup flow, SQLite initialization, local migration handling, offline-capable screen placeholders, basic repository wiring.
- Key functional requirements covered: PRD platform baseline, Offline/Sync "must work fully offline", Architecture local-first mobile architecture.
- Technical notes / implementation approach: use the approved mobile-first stack; initialize SQLite on app launch; establish a repository layer that reads local state first; persist app shell state across restart.
- Dependencies: none.
- Risks: startup migration failures can strand users; a network-first screen pattern here will create rework later.
- Acceptance criteria:
- App launches without requiring an active network call to render the signed-out shell.
- SQLite initializes successfully on first launch and app restart.
- Local-first repositories can read and write a seeded record without live API dependency.
- App restart preserves local seeded data and navigation state where appropriate.
- Validation / test notes: mobile smoke tests on iOS/Android simulators, SQLite migration tests, kill-and-restart persistence test.

### E1-S2 Backend, Worker, PostgreSQL, and Object Storage Bootstrap
- User story: As an operations owner, I want the core backend runtime in place so TagWise has a production-minded home for reports, approvals, and evidence.
- Scope: modular monolith API bootstrap, worker bootstrap, PostgreSQL schema/migration baseline, object storage wiring, environment configuration, health endpoints.
- Key functional requirements covered: FR-13 enablement, FR-14 enablement, Architecture runtime shape and deployment baseline.
- Technical notes / implementation approach: create one codebase with separate API and worker entry points; wire PostgreSQL migrations; configure private object storage buckets/containers; expose health and readiness checks.
- Dependencies: none.
- Risks: storage/environment drift can create early instability; skipping worker bootstrap now will complicate validation and media flows later.
- Acceptance criteria:
- API and worker processes boot independently from the same codebase.
- PostgreSQL migrations can be applied cleanly in dev/staging.
- Object storage connectivity is verified through a bootstrap smoke path.
- Health endpoints expose service readiness for API and worker.
- Validation / test notes: backend integration smoke tests, migration tests, object storage connectivity check, environment boot test.

### E1-S3 Connected Authentication, Offline Session Continuity, and Role Cache
- User story: As a technician, supervisor, or manager, I want to sign in while connected and keep a valid role-scoped session offline so I can use the product according to my responsibilities.
- Scope: connected login, token handling, secure local credential storage, offline session restore, role cache, one active user per device session.
- Key functional requirements covered: Approval/RBAC requirements, Offline identity/session boundary, Architecture identity architecture.
- Technical notes / implementation approach: store tokens in platform secure storage; cache user/role metadata separately from authoritative online review permissions; block offline user switching when unsynced work exists.
- Dependencies: `E1-S1`, `E1-S2`.
- Risks: role leakage across sessions; offline expiry handling can become confusing if not made explicit.
- Acceptance criteria:
- Connected users can authenticate and reopen the app offline in the same session.
- Role metadata is cached locally for technician experience and routing decisions.
- Offline user switching is blocked when unsynced local work exists.
- Review actions remain unavailable offline even if role metadata is cached.
- Validation / test notes: auth integration tests, secure storage tests, offline reopen scenario, role-based access tests for connected and offline states.

### E1-S4 User-Partitioned Local Repositories and Media Sandbox
- User story: As a technician, I want my local drafts, evidence, and queued work isolated to my authenticated session so device sharing cannot corrupt report ownership.
- Scope: user-partitioned local tables, user-partitioned media folders, repository identity binding, local cleanup rules.
- Key functional requirements covered: Offline identity/session boundary, FR-08 baseline enablement, Sync lifecycle groundwork.
- Technical notes / implementation approach: key local records by authenticated user plus business object id; isolate sandbox media paths by user/session; never reuse unsynced records across users.
- Dependencies: `E1-S1`, `E1-S3`.
- Risks: weak local partitioning will break sync ownership and auditability later.
- Acceptance criteria:
- Local drafts, evidence metadata, and queued items are stored under the authenticated user partition.
- Media files captured by one user are not visible in another user's local session.
- User logout/login does not reassign unsynced content to a different user.
- Local repositories can query by user and business object identity.
- Validation / test notes: multi-user device simulation, local data isolation test, media path ownership test.

### E1-S5 Audit, Logging, and Error Capture Baseline
- User story: As an operations owner, I want baseline audit and diagnostic visibility so sync, approval, and field failures can be understood early.
- Scope: structured logs, request/report correlation ids, baseline audit event plumbing, mobile/backend error capture, basic service metrics.
- Key functional requirements covered: FR-14 baseline, Architecture observability and auditability baseline.
- Technical notes / implementation approach: create a shared correlation-id pattern; log audit-worthy state changes through a consistent service boundary; capture mobile and backend runtime errors with environment context.
- Dependencies: `E1-S1`, `E1-S2`, `E1-S3`.
- Risks: missing correlation early will make later sync issues difficult to trace.
- Acceptance criteria:
- API and worker logs include correlation ids and structured severity fields.
- Mobile app errors can be captured with device/session context.
- Baseline audit events can be written for auth/session-level actions.
- Basic operational metrics exist for service uptime and error rate.
- Validation / test notes: log contract test, audit event persistence smoke test, forced-error capture check.

## Epic 2 Stories
### E2-S1 Assigned Work Package List and Download
- User story: As a technician, I want to see my assigned work packages and download them before entering the field so I can work offline on the right tags.
- Scope: assigned package list API, mobile list UI, package download action, local snapshot persistence for package payloads.
- Key functional requirements covered: FR-01, FR-02, Domain object `Assigned Work Package`.
- Technical notes / implementation approach: download a bounded snapshot containing tags, templates, cached history summary, and lightweight guidance; store version/freshness metadata locally.
- Dependencies: `E1-S2`, `E1-S3`, `E1-S4`.
- Risks: downloading unbounded payloads will hurt field performance.
- Acceptance criteria:
- Connected technician can view assigned packages in scope.
- Technician can download a package and store its snapshot locally.
- Downloaded package contains tag, template, guidance, and history-summary data needed for offline work.
- Download failure surfaces an actionable message without corrupting local data.
- Validation / test notes: API contract test, package download integration test, offline reopen after download.

### E2-S2 Offline Readiness and Package Freshness States
- User story: As a technician, I want to know whether a downloaded package is complete and current enough for field use so I can trust it before I leave connectivity.
- Scope: readiness indicators, freshness timestamp display, refresh action, stale/unknown freshness state handling.
- Key functional requirements covered: FR-01, FR-05 freshness behavior, Offline/Sync visibility requirements.
- Technical notes / implementation approach: compute readiness from local snapshot completeness; store refresh metadata and any upstream freshness indicator; display "age unknown" when needed.
- Dependencies: `E2-S1`.
- Risks: vague readiness language will reduce technician trust.
- Acceptance criteria:
- Downloaded packages show a clear offline-ready, incomplete, stale, or age-unknown state.
- Users can refresh a package while connected.
- Refresh updates stored freshness metadata without losing local drafts.
- Freshness states are visible before a user opens tag work.
- Validation / test notes: UI state tests, refresh regression test, stale/unknown state acceptance test.

### E2-S3 Tag Entry by Assigned List and Local Search
- User story: As a technician, I want to open a tag from the assigned list or by local search so I can start work quickly at the asset.
- Scope: tag list within package, local search/filter, open-tag action, tag identity confirmation.
- Key functional requirements covered: FR-02.
- Technical notes / implementation approach: search must operate entirely on local package scope; preserve tag as the primary object even when entered from a package.
- Dependencies: `E2-S1`.
- Risks: mixing package and tag identity can confuse later report ownership.
- Acceptance criteria:
- Technician can browse tags inside a downloaded package.
- Technician can search local tags by identifier or short description without a live API call.
- Opening a result lands on the selected tag, not a generic package page.
- Search results never imply access to uncached tags outside the local scope.
- Validation / test notes: local search tests, offline navigation tests, tag identity selection test.

### E2-S4 QR Scan Entry and Cache-Miss Handling
- User story: As a technician, I want to scan a tag QR code and know immediately whether it is available offline so I do not waste time at the asset.
- Scope: QR scan entry flow, tag resolution, cache-hit open behavior, cache-miss explanation.
- Key functional requirements covered: FR-02.
- Technical notes / implementation approach: resolve scan locally first; do not hide uncached tags behind silent failure; avoid any requirement for live lookup to continue.
- Dependencies: `E2-S1`, `E2-S3`.
- Risks: QR miss flows often become misleading if they imply live recovery while offline.
- Acceptance criteria:
- Scanning a cached tag opens the correct tag context.
- Scanning an uncached tag shows a clear not-cached state and next-step guidance.
- QR entry does not require live connectivity for cached tags.
- Invalid scan payloads fail gracefully.
- Validation / test notes: QR parsing tests, offline cache-hit and cache-miss tests, malformed payload test.

### E2-S5 Tag Context Screen
- User story: As a technician, I want concise tag context on mobile so I can understand what I am working on without digging through desktop-style screens.
- Scope: tag metadata view, range/unit/tolerance display, criticality/due indicators, recent history summary preview, reference pointers, missing-context markers.
- Key functional requirements covered: FR-03, FR-05 preview behavior, Domain object `Tag / Asset Context`.
- Technical notes / implementation approach: render only field-critical context first; visually distinguish missing context from unavailable history; prepare handoff into execution shell.
- Dependencies: `E2-S1`, `E2-S2`, `E2-S3`.
- Risks: overloading the screen will increase cognitive switching and slow field work.
- Acceptance criteria:
- Tag context loads entirely from local storage for downloaded packages.
- Screen shows the approved minimum field context where available.
- Missing context is explicitly marked and does not silently disappear.
- User can proceed from tag context into the execution shell.
- Validation / test notes: mobile UI regression tests, missing-context rendering test, offline load test.

## Epic 3 Stories
### E3-S1 Shared Execution Shell and Template Contract
- User story: As a technician, I want one consistent execution flow across supported instruments so I can learn the product once and trust it in the field.
- Scope: shared step shell, local template registry, template-to-UI binding, progress persistence, step navigation from context through checklist/guidance.
- Key functional requirements covered: FR-04, FR-06, FR-07, Domain objects `Instrument Family`, `Test Pattern`, `Procedure / Checklist Reference`.
- Technical notes / implementation approach: use a data-driven template contract that can render family/test-pattern variations inside one shell; persist in-progress step state locally.
- Dependencies: `E2-S5`.
- Risks: hard-coded family screens will create rework and break the approved modularity goal.
- Acceptance criteria:
- Execution shell can load and render a template from local package data.
- Shell supports ordered navigation across execution steps while preserving local progress.
- Template version and family/test-pattern identity remain visible to the system.
- Shell works offline without fetching remote configuration.
- Validation / test notes: template rendering tests, local progress persistence test, offline execution smoke test.

### E3-S2 Deterministic Calculation and Acceptance Engine
- User story: As a technician, I want calculation and acceptance results to be deterministic and local so I can trust the app when no network is available.
- Scope: calculation engine for raw input capture, deviation/error calculation, tolerance/pass-fail classification, persistence of raw and calculated values.
- Key functional requirements covered: FR-04, FR-09 input enablement.
- Technical notes / implementation approach: implement a deterministic rules layer separate from UI; preserve both raw inputs and derived outputs in the execution record.
- Dependencies: `E3-S1`.
- Risks: embedding formulas directly in screens will make template growth and test coverage difficult.
- Acceptance criteria:
- Engine computes deterministic outputs for supported template inputs offline.
- Raw observations and calculated results are both stored locally.
- Acceptance classification is reproducible for the same inputs.
- Calculation results survive app restart and resume.
- Validation / test notes: formula unit tests, persistence tests, deterministic repeat-run tests.

### E3-S3 Pressure, Temperature/RTD, and Level Transmitter Template Pack
- User story: As a technician, I want the core transmitter templates available in the shared shell so I can perform the approved v1 test patterns on common field instruments.
- Scope: pressure transmitter templates, temperature/RTD input templates, level transmitter templates, their approved test patterns, evidence expectations, and acceptance semantics.
- Key functional requirements covered: FR-04, FR-08 baseline, `Initial V1 Instrument Family / Template Scope`.
- Technical notes / implementation approach: implement only the approved v1 templates and acceptance styles from the PRD; reuse common transmitter input components where possible.
- Dependencies: `E3-S1`, `E3-S2`.
- Risks: trying to over-generalize beyond the approved v1 set will delay the first usable slice.
- Acceptance criteria:
- Pressure transmitter templates support approved v1 test patterns from the PRD.
- Temperature/RTD templates support approved v1 test patterns from the PRD.
- Level transmitter templates support approved v1 test patterns from the PRD.
- Each template declares minimum submission evidence and expected evidence hooks.
- Validation / test notes: template contract tests, family-specific acceptance tests, offline execution smoke tests for each family.

### E3-S4 Analog 4-20 mA Loop Template Pack
- User story: As a technician, I want analog loop templates available so I can perform loop integrity and signal validation inside the same execution model.
- Scope: analog 4-20 mA loop integrity templates, signal validation templates, expected current/value conversion basis, related evidence and checklist hooks.
- Key functional requirements covered: FR-04, FR-08 baseline, `Initial V1 Instrument Family / Template Scope`.
- Technical notes / implementation approach: support the approved v1 loop test patterns only; reuse common analog conversion and tolerance components from the calculation engine.
- Dependencies: `E3-S1`, `E3-S2`.
- Risks: mixing loop-level and transmitter-level semantics carelessly can blur report meaning.
- Acceptance criteria:
- Loop templates support the approved v1 test patterns from the PRD.
- Conversion basis and expected range are captured with the execution record.
- Loop deviation and tolerance outcomes are visible in the execution shell.
- Template data remains compatible with shared report and sync models.
- Validation / test notes: conversion tests, loop template contract tests, offline loop execution test.

### E3-S5 Control Valve With Positioner Template Pack
- User story: As a technician, I want control valve and positioner templates available so I can perform the approved v1 movement and feedback checks inside TagWise.
- Scope: stroke test template, position feedback verification template, movement checkpoints, evidence expectations, safety-aware checklist hooks.
- Key functional requirements covered: FR-04, FR-08 baseline, `Initial V1 Instrument Family / Template Scope`.
- Technical notes / implementation approach: keep v1 to commanded-versus-observed checks and approved checklist prompts; do not add advanced valve analytics.
- Dependencies: `E3-S1`, `E3-S2`.
- Risks: valve-specific requests can balloon into diagnostics outside the v1 boundary.
- Acceptance criteria:
- Control valve templates support stroke and position feedback checks defined in the PRD.
- Templates capture commanded points and observed responses.
- Template configuration remains compatible with the shared execution shell and calculation engine.
- Safety-aware checklist prompts are available in-flow.
- Validation / test notes: valve template contract tests, checkpoint acceptance tests, offline shell test.

### E3-S6 History Comparison and Freshness Cues
- User story: As a technician, I want current results compared to cached prior history so I can spot drift or recurrence without leaving the tag workflow.
- Scope: current-versus-history display, freshness/staleness labels, age-unknown handling, recurrence cues.
- Key functional requirements covered: FR-05.
- Technical notes / implementation approach: compare only locally cached summaries; do not depend on live history fetch; preserve family/test-pattern relevance where the PRD calls for it.
- Dependencies: `E2-S5`, `E3-S1`, `E3-S2`.
- Risks: ambiguous history freshness will weaken trust in diagnosis and approval.
- Acceptance criteria:
- Execution shell can show current values next to locally cached history.
- Missing, stale, or age-unknown history states are clearly distinguished.
- History comparison does not block execution when unavailable.
- Recurrence cues can be rendered when present in the snapshot.
- Validation / test notes: history rendering tests, stale/unknown state tests, offline comparison smoke test.

### E3-S7 Guided Diagnosis, Checklist, and Lightweight Guidance Flow
- User story: As a technician, I want practical next-step guidance and concise checklist context so I can keep moving without opening a manual.
- Scope: guided diagnosis prompts, checklist steps, why-it-matters messaging, source reference display, risk-flag hooks for skipped/incomplete items.
- Key functional requirements covered: FR-06, FR-07.
- Technical notes / implementation approach: keep guidance lightweight and template-linked; support offline baseline prompts; treat any future AI result as additive only.
- Dependencies: `E3-S1`, `E3-S2`, `E3-S6`.
- Risks: dumping too much normative content into the shell will hurt field usability.
- Acceptance criteria:
- Execution shell displays checklist steps and guidance in context.
- Prompts explain what to do, why it matters, and what it helps rule out.
- Skipped or incomplete checklist items generate visible risk state hooks.
- Flow works offline with cached guidance content.
- Validation / test notes: checklist completion tests, skip/incomplete risk tests, UX smoke tests for concise guidance display.

## Epic 4 Stories
### E4-S1 Structured Execution Evidence Capture
- User story: As a technician, I want readings, observations, and checklist outcomes captured in the flow so reports are built from real work instead of later re-entry.
- Scope: structured readings capture, free-text notes, checklist result capture, evidence linkage to execution steps and tag/report context.
- Key functional requirements covered: FR-08, FR-09 enablement, Domain object `Evidence Item`.
- Technical notes / implementation approach: store evidence metadata in SQLite linked to tag, step, and draft report ids; support edits while the report remains technician-owned.
- Dependencies: `E3-S1`, `E3-S2`, `E3-S7`.
- Risks: weak linkage between steps and evidence will complicate report generation and sync.
- Acceptance criteria:
- Technician can capture structured evidence during execution without leaving the tag flow.
- Evidence metadata is linked to tag, execution step, and draft report.
- Evidence remains editable while the report is still in technician-owned draft state.
- Structured evidence survives app restart.
- Validation / test notes: local evidence persistence tests, step-linkage tests, draft editing tests.

### E4-S2 Photo Capture and Local Media Attachment
- User story: As a technician, I want to attach photos locally during field work so visual evidence is preserved even before sync.
- Scope: mobile photo capture/select flow, local file storage, metadata linkage, attachment preview in draft report.
- Key functional requirements covered: FR-08, Evidence/media architecture local capture.
- Technical notes / implementation approach: store binaries in sandbox filesystem; keep metadata in SQLite; defer remote upload to Epic 5.
- Dependencies: `E1-S4`, `E4-S1`.
- Risks: large files and partial captures can create storage issues if not bounded.
- Acceptance criteria:
- Technician can capture or attach a photo while offline.
- Photo metadata is linked to the current tag/report context.
- Local attachment remains viewable in the draft report before sync.
- Removing a draft attachment updates metadata and local file state consistently.
- Validation / test notes: camera/gallery integration tests, local file lifecycle tests, attachment preview test.

### E4-S3 Justification Triggers and Non-Blocking Risk UX
- User story: As a technician, I want the app to warn me about missing or weak information without dead-ending my work so I can continue responsibly in messy field conditions.
- Scope: risk flag generation, mandatory justification prompts for visible risk conditions, minimum-versus-expected evidence distinction, submit-blocking rule hooks for missing minimum evidence or missing required justification.
- Key functional requirements covered: FR-07, FR-08, FR-10, Non-blocking behavior section.
- Technical notes / implementation approach: implement deterministic rule hooks from template and workflow state; separate "warn" from "submit-block" explicitly.
- Dependencies: `E3-S7`, `E4-S1`, `E4-S2`.
- Risks: if warning and blocking rules are blurred, technicians and reviewers will both lose trust.
- Acceptance criteria:
- Missing history, skipped checklist items, weak expected evidence, and missing context create visible risk state.
- Visible risks require justification capture where the PRD says they must.
- Missing expected evidence alone does not block draft completion.
- Missing minimum submission evidence or missing required justification can be surfaced as submit-blocking conditions.
- Validation / test notes: rule-engine tests for warn-versus-block behavior, justification UX tests, edge-case tests for partial evidence.

### E4-S4 Per-Tag Report Draft Generation and Review
- User story: As a technician, I want a per-tag report draft assembled from my work so I can review and submit it without retyping the field session.
- Scope: report draft assembly, summary screen, inclusion of evidence references/risk flags/justifications/history summary, local save and reopen.
- Key functional requirements covered: FR-09, Report lifecycle `In Progress` / `Ready to Submit`.
- Technical notes / implementation approach: create a local report projection from execution/evidence/justification tables; preserve editability until submission and after return.
- Dependencies: `E4-S1`, `E4-S2`, `E4-S3`.
- Risks: if report generation becomes a second data-entry flow, the product promise is broken.
- Acceptance criteria:
- Draft report is generated from captured local execution data.
- Draft shows tag context, execution summary, evidence references, risk flags, and justifications.
- Technician can review and save the draft locally for later completion.
- Draft can be reopened and updated without data loss.
- Validation / test notes: report projection tests, reopen/edit tests, offline draft review test.

## Epic 5 Stories
### E5-S1 Local Submission and Outbound Sync Queue
- User story: As a technician, I want to submit a completed per-tag report even while offline so field work is not blocked by connectivity.
- Scope: local submit action, report state transition to queued/pending sync, outbound queue item creation, queue dependency metadata.
- Key functional requirements covered: FR-10, FR-13, Sync lifecycle baseline.
- Technical notes / implementation approach: create queue items with idempotency keys and dependency metadata; lock technician ownership rules after submit according to the approved lifecycle.
- Dependencies: `E4-S4`.
- Risks: weak local queue identity will create duplicate submissions and hard-to-debug sync issues.
- Acceptance criteria:
- Technician can submit a report while offline.
- Submission moves the local report into `Submitted - Pending Sync`.
- Queue items are created for the report and its pending evidence.
- Submitted local records survive app restart.
- Validation / test notes: queue persistence tests, offline submit tests, duplicate-submit guard tests.

### E5-S2 Evidence Upload Orchestration and Binary Finalization
- User story: As a technician, I want my evidence attachments to sync safely after connectivity returns so the canonical report includes the right media without losing local files.
- Scope: evidence metadata sync, upload authorization flow, binary upload to object storage, server/worker finalization of evidence presence.
- Key functional requirements covered: FR-13, Evidence/media architecture upload flow, Pending validation flow.
- Technical notes / implementation approach: sync metadata first, then upload binaries using controlled authorization; worker verifies upload completion and finalizes evidence state.
- Dependencies: `E1-S2`, `E4-S2`, `E5-S1`.
- Risks: binary uploads can fail after metadata acceptance and create confusing partial state if not surfaced clearly.
- Acceptance criteria:
- Evidence metadata can sync independently of the binary upload.
- Client can upload evidence binaries using the approved storage flow.
- Server or worker records final evidence presence status.
- Local evidence is retained until the canonical upload outcome is known.
- Validation / test notes: upload integration tests, retry tests for transient failures, object storage finalization tests.

### E5-S3 Sync State UI, Retry, and Resume Behavior
- User story: As a technician, I want clear sync states and retry controls so I know whether my report is still local, queued, pending validation, or has an issue.
- Scope: per-report and per-package sync badges, sync detail state, explicit retry action, auto-retry on reconnect/reopen, resume after app restart.
- Key functional requirements covered: FR-10, FR-13, Offline/Sync "How the user sees sync state".
- Technical notes / implementation approach: drive UI from explicit local sync state machine; separate report business state from sync transport state.
- Dependencies: `E5-S1`, `E5-S2`.
- Risks: if sync transport state and approval state are mixed, users will misread report status.
- Acceptance criteria:
- Reports and packages show the approved sync states in the UI.
- Auto-retry occurs on reconnect and app reopen for eligible items.
- Users can manually retry failed sync items.
- Sync status survives app restart and remains consistent with local queue records.
- Validation / test notes: state-machine tests, reconnect/reopen retry tests, UI regression tests for state display.

### E5-S4 Server Validation, Conflict Rejection, and Post-Sync Refresh
- User story: As a supervisor or technician, I want the server to authoritatively accept or reject submissions so review queues and local devices stay consistent.
- Scope: server-side submission validation, pending-validation state, conflict rejection, structured sync issue reasons, local status refresh after server outcome.
- Key functional requirements covered: FR-10, FR-13, Authoritative state mapping, Reviewer connectivity boundary enablement.
- Technical notes / implementation approach: validate scope, lifecycle transition, minimum evidence, required justification, and evidence-arrival rules; reject conflicting edits rather than merging silently.
- Dependencies: `E5-S1`, `E5-S2`, `E5-S3`.
- Risks: vague sync-issue reasons will slow field recovery and support diagnosis.
- Acceptance criteria:
- Server accepts only valid submissions into `Submitted - Pending Supervisor Review`.
- Invalid submissions move into `sync issue` with a structured reason.
- Conflicting updates are rejected without silent merge.
- Local report state refreshes to the server-authoritative outcome after sync.
- Validation / test notes: API validation tests, conflict tests, post-sync state reconciliation tests.

## Epic 6 Stories
### E6-S1 Supervisor Review Queue and Report Detail
- User story: As a supervisor, I want a connected review queue and report detail view so I can assess submitted field work efficiently.
- Scope: supervisor queue, report detail screen, display of execution summary, evidence references, risk flags, justifications, and approval history placeholders.
- Key functional requirements covered: FR-11, Approval / RBAC requirements.
- Technical notes / implementation approach: queue should show only server-accepted reports within supervisor scope; detail view reads canonical backend state.
- Dependencies: `E5-S4`.
- Risks: showing local-only or pending-validation reports in the review queue will create confusion and premature decisions.
- Acceptance criteria:
- Supervisor sees only reviewable reports in assigned scope.
- Detail view shows the approved report data needed for review.
- Report detail distinguishes current state, risk flags, and pending evidence status clearly.
- Review screens require connectivity for official actions.
- Validation / test notes: role/scope API tests, queue filtering tests, connected-only action gating test.

### E6-S2 Supervisor Approve and Return for Standard Cases
- User story: As a supervisor, I want to approve standard cases quickly or return them with comments so technicians get clear and auditable outcomes.
- Scope: approve action, return action, mandatory return comments, state transitions, audit event creation for standard cases.
- Key functional requirements covered: FR-11, Approval lifecycle standard path.
- Technical notes / implementation approach: enforce connected server-side command validation; keep supervisors from editing technician evidence directly.
- Dependencies: `E6-S1`.
- Risks: if return comments are optional or weakly captured, technician rework will be ambiguous.
- Acceptance criteria:
- Supervisor can approve a standard report while connected.
- Supervisor can return a report only with a mandatory comment.
- Server records auditable approval or return decisions.
- Returned reports leave a clear state for technician rework.
- Validation / test notes: approval/return API tests, audit persistence tests, returned-state regression tests.

### E6-S3 Supervisor Escalation for Higher-Risk Cases
- User story: As a supervisor, I want to escalate higher-risk cases with rationale so manager review is reserved for the right submissions.
- Scope: escalation command, mandatory escalation rationale, higher-risk routing to manager queue, audit event persistence.
- Key functional requirements covered: FR-11, FR-12, Approval lifecycle escalation path.
- Technical notes / implementation approach: support supervisor judgment aided by product signals; do not auto-route purely from a rules engine.
- Dependencies: `E6-S1`.
- Risks: over-automating escalation will conflict with the approved PRD.
- Acceptance criteria:
- Supervisor can escalate a report while connected with mandatory rationale.
- Escalated report leaves supervisor standard queue and enters manager queue.
- Escalation decision is auditable and visible in report history.
- Escalation does not modify technician evidence or calculations.
- Validation / test notes: escalation command tests, queue-routing tests, history visibility tests.

### E6-S4 Manager Review and Decision for Escalated Cases
- User story: As a manager, I want to review escalated reports and approve or return them with traceable rationale so higher-risk decisions are controlled.
- Scope: manager queue, escalated report detail, approve action, return action with comments, connected-only validation.
- Key functional requirements covered: FR-12, Approval lifecycle manager path.
- Technical notes / implementation approach: show supervisor rationale alongside canonical report content; keep manager actions server-authoritative only.
- Dependencies: `E6-S3`.
- Risks: if manager screens diverge from supervisor report semantics, audit trails and rework loops will fragment.
- Acceptance criteria:
- Manager sees only escalated reports in scope.
- Manager can approve or return an escalated report while connected.
- Manager return requires a comment.
- Decision is stored as a distinct auditable action linked to the report.
- Validation / test notes: manager queue tests, approve/return API tests, audit trace tests.

### E6-S5 Approval History, Work-Package Roll-Up, and Returned-Report Re-entry
- User story: As a technician or reviewer, I want approval history and work-package status to stay coherent so I can understand where each tag report stands and what needs rework.
- Scope: approval history timeline, work-package roll-up calculation, returned-report re-entry for technician edits/resubmission, visible comment history.
- Key functional requirements covered: FR-09 approval history, Work package roll-up rule, FR-14.
- Technical notes / implementation approach: derive work-package status from child report states; preserve immutable decision history; re-open returned report into technician-owned editable state only.
- Dependencies: `E6-S2`, `E6-S3`, `E6-S4`.
- Risks: treating the work package as the review unit will violate the approved per-tag lifecycle model.
- Acceptance criteria:
- Report detail shows full approval/return/escalation history.
- Work-package status rolls up correctly from child per-tag report outcomes.
- Returned reports can be reopened by the technician for rework and later resubmission.
- Prior approval decisions remain visible after resubmission.
- Validation / test notes: lifecycle transition tests, roll-up calculation tests, rework/resubmit regression tests.

## Epic 7 Release-Hardening Stories Only
### E7-S1 Staging/Production Deployment, Secrets, and Backups
- User story: As an operations owner, I want staging and production environments with safe configuration and backups so TagWise can run as a real service.
- Scope: staging/prod environment setup, secrets management, backup scheduling, restore verification baseline, deployment pipeline basics.
- Key functional requirements covered: Architecture deployment baseline, production readiness objective.
- Technical notes / implementation approach: single-region managed deployment, managed PostgreSQL backups, managed object storage policy, environment-scoped secrets.
- Dependencies: `E1-S2`, `E5-S4`, `E6-S5`.
- Risks: late environment setup can hide release blockers until the end.
- Acceptance criteria:
- Staging and production environments exist and match the approved runtime shape.
- Secrets/configuration are environment-scoped and not embedded in code.
- Database backup and restore baseline is verified.
- Deployment process can promote a tested build into staging and production.
- Validation / test notes: environment smoke tests, backup/restore drill, deployment checklist verification.

### E7-S2 Monitoring, Alerting, and Release Observability Hardening
- User story: As an operations owner, I want release-grade monitoring so sync, approval, and evidence failures are visible before they become field incidents.
- Scope: production metrics, dashboards, alert thresholds, release error monitoring, audit/sync observability checks.
- Key functional requirements covered: Architecture observability and auditability, FR-14 operational traceability.
- Technical notes / implementation approach: build on `E1-S5`; add dashboards for queue depth, sync success/failure, approval latency, evidence upload failures, worker failures.
- Dependencies: `E1-S5`, `E5-S4`, `E6-S5`.
- Risks: missing release dashboards will make field rollout support reactive instead of controlled.
- Acceptance criteria:
- Production metrics exist for queue depth, sync failures, approval latency, and worker failures.
- Alerts exist for severe sync/approval/evidence processing failure conditions.
- Operational dashboards can be used to confirm release health.
- Error monitoring captures backend and mobile crash trends.
- Validation / test notes: alert dry-run, dashboard data verification, synthetic failure test.

### E7-S3 Evidence Access Control and Retention Baseline
- User story: As an operations owner, I want evidence files protected and retained predictably so report media remains secure and supportable in early production.
- Scope: private object storage posture, signed/authenticated access strategy, file-type/size rules, retention baseline, cleanup rules for rejected local uploads.
- Key functional requirements covered: Evidence/media architecture secure handling, Security baseline.
- Technical notes / implementation approach: keep object storage private by default; expose only controlled download/access; document v1 retention rules.
- Dependencies: `E5-S2`, `E7-S1`.
- Risks: weak media access policy can create security and support issues quickly.
- Acceptance criteria:
- Evidence binaries are not publicly accessible by default.
- Download/access path requires authenticated or signed access.
- File-type and size guardrails are enforced.
- Retention and cleanup rules are documented and applied for first release.
- Validation / test notes: access-control tests, upload rule tests, retention policy verification.

### E7-S4 Worker Resilience and Operational Recovery Runbook
- User story: As an operations owner, I want background jobs and recovery steps to be resilient so evidence finalization and validation flows survive restarts and outages.
- Scope: worker retry hardening, restart-safe job handling, dead-letter/failed-job visibility, recovery runbook for sync/media/validation incidents.
- Key functional requirements covered: Architecture worker resiliency, pending validation reliability.
- Technical notes / implementation approach: persist retryable jobs durably; ensure job handlers are idempotent; document recovery steps for stuck queues and failed finalization.
- Dependencies: `E1-S2`, `E5-S2`, `E5-S4`, `E7-S2`.
- Risks: restart-unsafe jobs can create hidden data loss or repeated side effects.
- Acceptance criteria:
- Worker can resume retryable jobs after restart without duplicating side effects.
- Failed jobs are visible for operational follow-up.
- Recovery guidance exists for common sync/media/validation failure modes.
- Release environment can prove worker restart resilience through a controlled drill.
- Validation / test notes: worker restart test, idempotency tests, operational drill checklist.

## First Vertical Slice Recommendation
Use a single technician flow around one approved transmitter-style template first, ideally a pressure transmitter as-found calibration check, because it exercises the core product spine without requiring the full approval ladder.

Critical stories for the first usable vertical slice:
- `E1-S1`
- `E1-S2`
- `E1-S3`
- `E1-S4`
- `E2-S1`
- `E2-S3`
- `E2-S5`
- `E3-S1`
- `E3-S2`
- `E3-S3`
- `E3-S6`
- `E3-S7`
- `E4-S1`
- `E4-S3`
- `E4-S4`
- `E5-S1`
- `E5-S3`

What this slice proves:
- local-first mobile startup
- bounded work-package preload
- tag entry and context
- one real template-driven field execution path
- risk/justification behavior
- per-tag report draft and offline submission queue

## First End-To-End Demo Cut
The first end-to-end demo should prove a standard case from technician execution through connected supervisor approval.

Required stories before the first end-to-end demo:
- All first vertical slice stories
- `E2-S2`
- `E4-S2`
- `E5-S2`
- `E5-S4`
- `E6-S1`
- `E6-S2`

Recommended demo narrative:
- Technician downloads a package while connected
- Technician opens a tag offline and executes a supported template
- Technician captures evidence, adds a justification, generates a per-tag report, and submits
- Connectivity returns and the report syncs into supervisor review
- Supervisor reviews and approves the standard case

## First Release Story Cut
The first release cut includes every story in Epics 1 through 6 and the release-hardening stories in Epic 7:
- `E1-S1` through `E1-S5`
- `E2-S1` through `E2-S5`
- `E3-S1` through `E3-S7`
- `E4-S1` through `E4-S4`
- `E5-S1` through `E5-S4`
- `E6-S1` through `E6-S5`
- `E7-S1` through `E7-S4`

Release-hardening-only stories:
- `E7-S1`
- `E7-S2`
- `E7-S3`
- `E7-S4`

AI note:
- The AI boundary stays defined by the architecture, but no live AI provider integration story is required for the first release cut.

## Story Sequencing Cautions
- Do not build family-specific execution screens before `E3-S1`; the shared shell and template contract must exist first.
- Do not treat `E5-S1` as sufficient for review; reviewable state begins only after `E5-S4` server acceptance.
- Do not allow reviewer actions to start before `E6-S1`; official review remains connected/server-validated in v1.
- Do not ship photo capture without the local file ownership rules from `E1-S4` and the upload/finalization path from `E5-S2`.
- Do not blur warning-level risk with submit-blocking conditions; `E4-S3` must keep those boundaries explicit.
- Do not use work-package status as the approval authority; per-tag report lifecycle remains canonical.
- Do not pull AI into any story on the first release critical path.

## Stories Handoff Statement
This story decomposition stays inside the approved Product Brief, PRD, Architecture, and current Epics boundaries. The stories are intentionally small enough for real execution and review, explicit about offline-first and sync behavior, and structured for Codex or Claude execution in VS Code without major reinterpretation.
