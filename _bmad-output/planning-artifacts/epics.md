# TagWise Epics

Status: Approved epic baseline

Source of truth:
- `_bmad-output/planning-artifacts/product-brief.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `docs/MVP/TagWise_Project_Instructions.txt`
- `docs/MVP/TagWise.pdf`

## Epic Strategy Summary
This epic plan translates the approved TagWise product and architecture baseline into a small, delivery-ready sequence for v1. The sequence is designed to protect the hardest truths first: local-first mobile behavior, bounded offline work packages, deterministic sync, server-authoritative approval, and auditable per-tag reports.

The plan intentionally does **not** split work by instrument family into separate apps or separate epics. Instead, v1 instrument scope is delivered through one shared execution shell with a bounded set of supported templates:
- Pressure transmitters
- Temperature transmitters / RTD inputs
- Level transmitters
- Control valves with positioners
- Analog 4-20 mA loops

The first release should ship only when the field path is coherent end to end:

`download -> tag entry -> context -> execution -> evidence -> report -> submit -> sync -> review -> approval`

## Recommended Epic Sequence
1. **Epic 1 - Platform, Identity, and Local-First Foundation**
Reason: every later feature depends on the mobile runtime, SQLite data model, backend baseline, auth/session handling, object storage posture, audit scaffolding, and versioned contracts.

2. **Epic 2 - Offline Work Package and Tag Access**
Reason: technicians need assigned package preload, offline readiness, tag search/QR entry, and tag context before any execution workflow is credible.

3. **Epic 3 - Template-Driven Field Execution**
Reason: this establishes the shared shell for instrument-family workflows, deterministic calculations, history comparison, guided diagnosis, and lightweight checklist/guidance.

4. **Epic 4 - Evidence, Justification, and Per-Tag Report Drafting**
Reason: field evidence and report assembly must happen inline with execution, not as a second workflow, and must preserve the non-blocking submission philosophy.

5. **Epic 5 - Submission, Sync, and Pending Validation**
Reason: local completion is not enough; v1 needs deterministic queueing, evidence upload orchestration, visible sync states, server validation, and conflict handling.

6. **Epic 6 - Connected Review, Approval, and Audit Closure**
Reason: supervisor and manager review are core product behaviors, not back-office extras, and must remain server-authoritative and auditable.

7. **Epic 7 - Release Readiness, Deployment, and Optional AI Assist**
Reason: early production requires deployment, monitoring, backups, resilience, and a clean async AI boundary, but the AI capability itself must remain optional and non-blocking.

## Epic 1 - Platform, Identity, and Local-First Foundation
### Objective
Establish the production-minded runtime and security baseline for a local-first mobile field app with a simple cloud backend.

### Why It Exists
Without this epic, every later workflow would be built on unstable assumptions. TagWise needs the offline/mobile foundation, authenticated session model, backend contract shape, audit primitives, and cheap/simple deployment posture in place before feature delivery accelerates.

### Key Capabilities Included
- Mobile app shell with authenticated startup flow
- Local structured storage baseline using SQLite
- Local media storage baseline in app sandbox
- Repository/data-access pattern that reads local-first
- Backend modular monolith skeleton with versioned API contracts
- PostgreSQL canonical data baseline
- Object storage baseline for evidence/media
- Technician, Supervisor, and Manager role model baseline
- Connected login and offline session continuity baseline
- Basic audit event infrastructure
- Initial observability baseline for API, worker, and mobile error reporting
- Background worker skeleton for async jobs and validation tasks

### Dependencies / Sequencing Notes
- Must land before work-package preload, report sync, or approval flows
- Must define stable identifiers, object ownership, and versioned contract posture before instrument templates or report submission are built
- Should include only the minimum operational hardening needed to support downstream feature epics, not full release hardening

### Major Risks / Open Concerns
- Under-designing local data ownership early would create rework in sync and approval epics
- Overengineering auth/admin features would slow delivery without helping field usability
- Weak observability at this stage would make later sync and approval issues hard to diagnose

### Definition Of Done
- Mobile app can authenticate while connected and reopen into a valid offline-capable session
- Local SQLite storage and media storage are wired into the app shell
- API, worker, PostgreSQL, and object storage environments exist in development and staging form
- Simple RBAC roles exist end to end
- Versioned contract conventions and audit event conventions are documented and implemented at baseline level
- Core logs, error capture, and health checks exist for backend services

## Epic 2 - Offline Work Package and Tag Access
### Objective
Enable technicians to download assigned work packages, confirm offline readiness, and enter work through the tag as the operational anchor.

### Why It Exists
TagWise is only credible as a field tool if technicians can preload bounded work, enter by assigned list/search/QR, and trust that the cached tag context is usable when the network disappears.

### Key Capabilities Included
- Assigned work package list and download flow
- Package completeness and freshness indicators
- Local package refresh behavior
- Tag entry from assigned list
- Tag search across locally cached scope
- QR scan entry for locally cached tags
- Tag context screen with concise field-ready metadata
- Clear handling for uncached tags or missing context
- Work-package roll-up view driven by child tag/report state placeholders

### Dependencies / Sequencing Notes
- Depends on Epic 1 local storage, auth/session, and API foundations
- Should complete before detailed execution flows so the team can validate real field entry paths on device
- Tag context structure must align with the PRD object model and the future report payload shape

### Major Risks / Open Concerns
- Trying to preload too much plant data would weaken offline performance and deployment simplicity
- If tag context becomes overly dense, the app will feel like a desktop screen squeezed onto a phone
- QR entry can create confusion if cache-miss handling is unclear

### Definition Of Done
- Technician can download a bounded assigned work package and verify offline readiness
- Technician can open a locally available tag from assigned list, search, or QR
- Tag context loads from local storage without requiring live API calls
- Missing cache or missing context states are visible and understandable
- Work-package freshness and per-tag status are visible in the mobile UI

## Epic 3 - Template-Driven Field Execution
### Objective
Deliver one shared execution shell that supports the initial v1 instrument families and test patterns without turning each family into a separate app.

### Why It Exists
This epic is where TagWise becomes more than an offline form tool. It turns the approved product spine into a reusable execution model that supports multiple families through templates, deterministic calculations, history comparison, guided diagnosis, and lightweight guidance.

### Key Capabilities Included
- Shared mobile execution shell for:
- context
- calculation/test entry
- result interpretation
- history comparison
- guided diagnosis
- checklist / best-practice / normative reference display
- Template-driven support for the approved v1 families:
- Pressure transmitters
- Temperature transmitters / RTD inputs
- Level transmitters
- Control valves with positioners
- Analog 4-20 mA loops
- Template-driven support for the approved v1 test patterns and acceptance styles defined in the PRD
- Deterministic calculation and acceptance logic tied to family/test pattern
- Local history comparison using cached summaries
- Guided diagnosis prompts that work offline in baseline form
- Non-blocking risk flags for missing history, missing context, skipped checklist items, weak evidence expectations, and anomalous results

### Dependencies / Sequencing Notes
- Depends on Epic 2 tag context and local package/template availability
- Must use a shared execution contract before deeper family-specific polish is added
- Should avoid custom one-off flows that bypass the common template/report model

### Major Risks / Open Concerns
- Family-specific requests may pressure the product into five different mini-apps
- Overly rigid templates could block real field variation
- Overly loose templates could undermine report consistency and approval trust

### Definition Of Done
- Technician can execute at least one end-to-end test flow for each approved v1 family inside the shared shell
- Calculation and acceptance results are deterministic and persist locally
- Cached history is shown when available and clearly marked when stale or absent
- Checklist/guidance content is concise, in-flow, and traceable to a source reference
- Risk flags and justification triggers appear without hard-blocking normal field progress

## Epic 4 - Evidence, Justification, and Per-Tag Report Drafting
### Objective
Make evidence capture and report generation a natural consequence of field work, while enforcing the non-blocking but auditable submission philosophy.

### Why It Exists
The product promise fails if technicians must retype work after execution or if reviewers receive vague, inconsistent, unauditable submissions. This epic turns execution data into a reviewable per-tag report with explicit evidence and justification semantics.

### Key Capabilities Included
- Inline capture of readings, notes, checklist outcomes, and photos
- Evidence linkage to tag, execution step, and draft report
- Explicit justification capture for visible risks and skipped required elements
- Minimum versus expected evidence handling by template
- Structured per-tag report draft generation from captured work
- Report summary review screen for technicians
- Local draft save/resume behavior
- Returned-report rework support at draft level

### Dependencies / Sequencing Notes
- Depends on Epic 3 execution shell and template definitions
- Should be completed before final submission/sync flows so report payloads and evidence expectations are stable
- Must preserve the canonical per-tag report unit from PRD and architecture

### Major Risks / Open Concerns
- Evidence requirements can become burdensome and slow field work
- Weak linkage between execution and report structures would complicate sync and approval later
- Justification prompts can become bureaucratic if they are too frequent or too vague

### Definition Of Done
- Technician can capture evidence during execution without leaving the tag flow
- Draft per-tag reports assemble automatically from local execution data
- Minimum submission evidence and expected evidence states are visible on the report draft
- Missing expected evidence and other visible risks require justification but do not erase the draft or force workflow abandonment
- Returned reports can be reopened, updated, and re-prepared locally

## Epic 5 - Submission, Sync, and Pending Validation
### Objective
Provide deterministic local submission, background synchronization, evidence upload orchestration, and clear pending-validation behavior for per-tag reports.

### Why It Exists
Offline work only becomes operationally useful when the system can safely move local reports and evidence into the server-authoritative record without silent loss, hidden state changes, or merge ambiguity.

### Key Capabilities Included
- Local report submission into queued state while offline
- Outbound sync queue for report payloads, evidence metadata, and evidence binaries
- Dependency-aware ordering for report and evidence sync
- Visible per-item sync states:
- local only
- queued
- syncing
- pending validation
- synced
- sync issue
- Server-side submission validation against:
- role/scope
- lifecycle transition rules
- minimum submission evidence
- required justification
- required evidence arrival rules
- Background retry on connectivity regain, app reopen, and explicit retry
- Structured sync issue handling with user-visible reasons
- No silent merge of conflicting edits
- Post-sync status refresh into local state

### Dependencies / Sequencing Notes
- Depends on Epic 4 report and evidence model stability
- Must be in place before official reviewer actions can be trusted
- Sync queue item identity and idempotency rules must align with Epic 1 contract and audit foundations

### Major Risks / Open Concerns
- Hidden queue dependencies can create confusing partial sync behavior
- Weak sync state visibility will erode technician trust quickly
- Allowing silent merge or multi-writer behavior too early would undermine auditability

### Definition Of Done
- Technician can submit a per-tag report offline and see it enter a queued state
- Background sync can move reports and evidence through the defined sync states deterministically
- Server acceptance moves a report into review-ready state only after required validation passes
- Conflicts and validation failures land in a visible sync-issue state with actionable reasons
- Local records survive app restarts and network interruptions without losing drafts or queued submissions

## Epic 6 - Connected Review, Approval, and Audit Closure
### Objective
Implement the connected, auditable review lifecycle for supervisors and managers while preserving the technician’s offline-first experience.

### Why It Exists
Approval is a core control point in TagWise. It cannot remain an implied later phase. This epic delivers the official supervisor/manager decisions, return flow, escalation path, and audit closure that make reports operationally trustworthy.

### Key Capabilities Included
- Supervisor review queue for submitted per-tag reports
- Review screen showing execution summary, risk flags, evidence, and justifications
- Supervisor approve action for standard cases
- Supervisor return action with mandatory comments
- Supervisor escalation action with mandatory rationale
- Manager review queue for escalated cases
- Manager approve or return with auditable comments
- Work-package roll-up from child report outcomes
- Full approval history visible on the report
- Server-authoritative lifecycle transitions and audit event generation

### Dependencies / Sequencing Notes
- Depends on Epic 5 server-accepted reports and stable sync states
- Must keep reviewer actions connected/server-validated in v1; do not expand reviewer offline authority here
- Review UI should use the same per-tag report structure created in Epic 4 and validated in Epic 5

### Major Risks / Open Concerns
- If higher-risk escalation criteria are treated as fully automatic, the epic will conflict with the approved PRD
- If reviewers can edit field evidence directly, the report ownership model becomes muddled
- If approval comments are weakly enforced, audit value drops sharply

### Definition Of Done
- Supervisors can approve or return standard reports while connected
- Supervisors can escalate higher-risk reports with rationale
- Managers can approve or return escalated reports while connected
- Approval and return comments are stored as auditable decisions with actor, role, timestamp, and target report
- Returned reports re-enter the technician rework loop without losing history
- Work-package roll-up states reflect child report review outcomes

## Epic 7 - Release Readiness, Deployment, and Optional AI Assist
### Objective
Bring TagWise to an early-production-ready operational state and expose the clean async AI boundary without making AI a requirement for field completion.

### Why It Exists
The product is intended for real deployment, not a demo stack. This epic turns the feature-complete baseline into something that can be monitored, secured, backed up, and operated with confidence, while also preserving the future-ready AI integration seam.

### Key Capabilities Included
- Single-region staging and production deployment baseline
- Environment configuration, secrets, backups, and restore posture
- Operational dashboards, alerts, and error monitoring
- Audit and sync observability checks tied to real release health
- Evidence storage retention and access-policy baseline
- Worker hardening for retryable async jobs
- Provider-agnostic AI job boundary and artifact model
- Optional AI request queueing and async result attachment to reports
- Feature-flag or configuration control to ship without live AI if needed

### Dependencies / Sequencing Notes
- Minimal observability and security posture starts in Epic 1; this epic completes it to release quality
- AI boundary implementation must not reshape report, approval, or sync semantics already established in earlier epics
- Live AI provider enablement is optional for first release if the boundary and persistence model already exist

### Major Risks / Open Concerns
- Leaving operational hardening too late can hide release blockers until the end
- Shipping AI too early can distract from field reliability
- Under-specifying retention/access policies for evidence can create compliance and support pain

### Definition Of Done
- Staging and production environments support the approved architecture shape
- Backups, logging, metrics, error reporting, and basic alerting exist for real operations
- Evidence/media access is secured appropriately for v1
- Worker-driven async flows are resilient across restarts
- AI requests and results can be represented asynchronously without blocking reports, sync, or approvals
- The product can be released with AI disabled and still satisfy the approved PRD

## MVP Cut / First Release Recommendation
### Recommended First Release Cut
Ship **Epics 1 through 6 in full** plus the release-critical operational slices of **Epic 7**:
- staging and production deployment baseline
- backups and secrets management
- logging, metrics, and error monitoring
- evidence storage security baseline
- worker resiliency for validation and media finalization
- AI boundary present but live AI assistance allowed to remain off by default

### Why This Is The Right Cut
This cut preserves the complete field value loop:
- technician can preload work
- execute offline
- capture evidence
- generate per-tag reports
- submit and sync later
- supervisor can review standard cases
- manager can review escalations
- operations can run the system safely in early production

### What Should Explicitly Stay Out Of Early Implementation
- Deep SAP / Maximo / TOTVS integration beyond stable contracts and export-ready boundaries
- Reviewer offline approval authority
- Template builder/admin studio for business users
- Desktop-first dashboards or heavy manager analytics
- Advanced AI diagnosis that tries to override deterministic calculations or approval decisions
- Broad expansion beyond the approved v1 instrument families and test patterns
- Cross-tag bulk editing workflows that weaken per-tag report ownership

## Risks And Sequencing Cautions
### Architecture-Sensitive Dependencies That Must Be Respected
- Do not start family-specific UI variants before the shared template/execution shell contract exists
- Do not implement reviewer actions before server-authoritative report acceptance and sync states are stable
- Do not ship evidence upload flows without durable local metadata, local file retention, and retry-safe upload identity
- Do not allow silent merge or multi-writer edits on submitted reports
- Do not treat work-package roll-up as the primary review unit; per-tag report remains canonical in v1
- Do not bind AI results into required workflow transitions, review gating, or deterministic pass/fail logic

### Main Sequencing Cautions
- A tempting but risky shortcut is to build execution screens before work-package preload and tag context are stable; this usually causes rework in offline and reporting behavior
- Another risky shortcut is to build submission before report/evidence semantics are explicit; that creates sync ambiguity and review confusion
- Approval should not be treated as a late polish layer; the product model, audit trail, and return flow depend on it
- Release hardening should begin in baseline form early and finish in Epic 7; leaving all operations work to the end will create avoidable production risk

## Epics Handoff Statement
This epic structure preserves the approved Product Brief, PRD, and Architecture boundaries. It is small enough to be workable, sequenced for real delivery, and explicit about the offline-first, sync-later, per-tag-report, auditable-approval, and optional-AI constraints that define TagWise v1. It is ready for targeted review and then story decomposition.
