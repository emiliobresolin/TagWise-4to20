# TagWise PRD

Status: Approved PRD baseline

Source of truth:
- `_bmad-output/planning-artifacts/product-brief.md`
- `docs/MVP/TagWise_Project_Instructions.txt`
- `docs/MVP/TagWise.pdf`

## Executive Summary
TagWise is a mobile-first, offline-first field execution, evidence, reporting, and approval product for industrial instrumentation work. The tag or instrument remains the operational anchor. Assigned work packages provide bounded context around one or more tags, but TagWise is not a CMMS, scheduler, or planning system.

The v1 product is organized around this core field spine:

`tag -> context -> calculation -> history comparison -> guided diagnosis -> checklist / best practice / normative reference -> report -> approval -> sync`

The product exists to help technicians complete real field work with less friction in low-connectivity environments, while giving supervisors and managers auditable review and approval. v1 must be production-minded, cheap and simple to deploy, resilient offline, non-blocking in messy field conditions, and ready for future enterprise integration through stable contracts rather than deep v1 integrations.

In v1, the canonical review, approval, and sync unit is the **per-tag report**. A single assigned work package may contain multiple tags and therefore may produce multiple reports. Work package status rolls up from the status of its child tag reports.

## Product Goals / Non-Goals
### Product Goals
- Enable technicians to complete assigned tag-centered field work end to end on mobile devices, even with unstable or no connectivity.
- Reduce cognitive switching by combining context, calculations, history comparison, guided diagnosis, checklist support, evidence capture, reporting, and approval into a single field flow.
- Make reports a byproduct of work already performed, not a second clerical workflow.
- Support non-blocking completion: missing data, missing history, incomplete checklists, weak evidence, and pending justifications must surface visible risk without hard-stopping technician progress.
- Provide a simple, auditable approval lifecycle for standard and higher-risk cases.
- Establish a product model that supports multiple instrument families and test patterns without hard-coding the app to only one instrument type.
- Keep deployment and operations simple enough for real early production use while preserving clean seams for future ERP/EAM/CMMS integration.

### Non-Goals
- Replace CMMS, EAM, scheduler, dispatcher, or permit-to-work systems in v1.
- Provide plant-wide planning, workforce allocation, inventory, procurement, or asset master governance.
- Depend on live connectivity for technician task completion.
- Use AI as a required step for diagnosis, reporting, approval, or auditability.
- Deliver exhaustive coverage for all instrument families in v1.
- Build a full standards/compliance management system or document repository.
- Optimize primarily for desktop-first administration or reviewer workflows.

## Personas And User Goals
### Technician
Primary context:
- Works in industrial plants with poor or intermittent connectivity.
- Needs fast access to assigned tag work, clear context, practical guidance, and a way to finish the task without jumping across tools.

Goals:
- Open an assigned work package and quickly find the correct tag by assigned list, search, or QR code.
- Understand the tag context and expected test method with minimal friction.
- Record readings, calculations, observations, checklist results, photos, and justifications in one mobile flow.
- Continue working without network access.
- Submit a reviewable package even when some data is missing, while making risk and justification explicit.

### Supervisor
Primary context:
- Reviews technician submissions and is accountable for the quality of standard cases.
- Needs clear evidence, visible missing elements, and low-friction return/escalation paths.

Goals:
- Review technician submissions with traceability and enough context to trust the result.
- Approve standard cases quickly.
- Return submissions with comments when evidence, reasoning, or completeness is insufficient.
- Escalate higher-risk cases to a manager with visible rationale.

### Manager
Primary context:
- Handles escalated higher-risk submissions rather than all submissions.
- Needs auditable decisions and visibility into why a case was escalated.

Goals:
- Review escalated cases with full evidence, approval history, and stated risk.
- Approve or return escalated work with auditable comments.
- Maintain control over higher-risk operational decisions without entering day-to-day field execution.

## V1 Scope / Out Of Scope
### V1 Scope
- Mobile-first execution of assigned work packages centered on one or more tags.
- Offline local access to assigned packages, cached tag context, cached history summary, checklist references, and lightweight best-practice / normative guidance.
- Tag entry through assigned work list, text search, and QR scan.
- Tag context view including core metadata, instrument family, expected range/signal/tolerance, due indicators, recent history summary, and recurrence markers where available.
- Guided calculations and test execution for the initial v1 instrument families and test patterns defined in `Initial V1 Instrument Family / Template Scope`.
- History comparison between current readings/results and relevant prior records when available.
- Guided diagnosis prompts that assist the technician after comparison/test results.
- Checklist usage with concise operational guidance, why it matters, and reference source.
- Evidence capture including structured readings, notes, photos, timestamps, user attribution, and justifications.
- Automatic report generation from captured work data.
- Technician submission, supervisor approval/return, supervisor escalation, and manager approval/return.
- Deferred synchronization, visible sync state, and post-sync status updates.
- Product-level auditability and traceability across execution, submission, review, return, escalation, and approval.
- Optional, asynchronous, pluggable AI assistance that never blocks core workflows.
- Per-tag review and approval even when a single assigned work package contains multiple tags.

### Out Of Scope
- Work order planning, scheduling, dispatch, or technician route optimization.
- Spare parts, stock, warehouse, or procurement workflows.
- Full asset hierarchy administration and master data stewardship.
- Real-time collaborative field editing as a requirement for task completion.
- Deep historian ingestion, analytics suites, or predictive maintenance in v1.
- Broad custom workflow builder or highly configurable admin studio in v1.
- Fully autonomous diagnosis or AI-driven approval.
- Hard dependencies on SAP, Maximo, TOTVS, or other enterprise systems to make v1 usable.

## Initial V1 Instrument Family / Template Scope
The v1 instrument scope is intentionally small, practical, and extensible. These families and templates define the supported starting point for calculations, evidence expectations, guidance content, and history comparison behavior in v1.

### Pressure Transmitters
Primary v1 test patterns / templates:
- as-found calibration check
- as-left calibration check
- loop verification against expected range

Expected calculation / acceptance style:
- deterministic comparison of measured versus expected value
- absolute error, percentage error where relevant, and tolerance/pass-fail classification

Minimum submission evidence expectations:
- structured readings captured at the tested points
- expected range/tolerance used for acceptance
- result classification
- technician observations
- required justification for any skipped point, missing context, or missing expected evidence

Notable guidance / checklist characteristics:
- power and loop continuity checks before recalibration
- concise prompts that separate likely instrument drift from loop/configuration issues
- lightweight normative/best-practice references tied to verification order

Special history / comparison needs:
- previous calibration or intervention result summary
- recurrence visibility for repeated out-of-tolerance behavior

### Temperature Transmitters / RTD Inputs
Primary v1 test patterns / templates:
- input simulation check
- calibration verification
- expected-versus-measured range check

Expected calculation / acceptance style:
- deterministic comparison of simulated or measured input versus expected output
- tolerance-based pass/fail with clear deviation display

Minimum submission evidence expectations:
- structured input and output readings
- identified sensor/input type where required by the template
- result classification
- technician observations
- required justification for skipped points or missing expected evidence

Notable guidance / checklist characteristics:
- prompts to verify input source, configuration assumptions, and wiring conditions before concluding transmitter fault
- concise checklist flow appropriate for transmitter and RTD-style verification

Special history / comparison needs:
- last comparable verification result when available
- clear stale/unknown history indication because comparable temperature tests may not always be recent

### Level Transmitters
Primary v1 test patterns / templates:
- range verification
- basic calibration check
- expected-versus-measured output verification

Expected calculation / acceptance style:
- deterministic range and deviation comparison
- tolerance/pass-fail classification against configured operating range

Minimum submission evidence expectations:
- structured readings at the tested points
- configured range/tolerance reference
- result classification
- technician observations
- required justification for missing expected evidence or incomplete point capture

Notable guidance / checklist characteristics:
- prompts that help distinguish instrument issue from process or installation context
- concise checks for reference setup, range assumptions, and obvious configuration mismatch

Special history / comparison needs:
- recent deviation pattern and recurrence where available
- comparison should emphasize whether the current issue resembles earlier range-related problems

### Control Valves With Positioners
Primary v1 test patterns / templates:
- stroke test
- position feedback verification

Expected calculation / acceptance style:
- deterministic commanded versus observed position comparison
- pass/fail or tolerance-style classification for key checkpoints rather than advanced diagnostics

Minimum submission evidence expectations:
- commanded points and observed response values
- result classification
- technician observations
- required justification for skipped movements, unavailable feedback, or missing expected evidence

Notable guidance / checklist characteristics:
- safety-aware checklist prompts around movement verification
- concise prompts to separate actuator/positioner behavior from signal-path issues
- no advanced valve performance analytics in v1

Special history / comparison needs:
- recent stroke/position feedback outcomes when available
- recurrence cues for repeated response or travel anomalies

### Analog 4-20 mA Loops
Primary v1 test patterns / templates:
- loop integrity check
- signal validation
- expected current versus process value verification

Expected calculation / acceptance style:
- deterministic PV, mA, and percentage conversions where relevant
- deviation and tolerance-based acceptance for the tested points

Minimum submission evidence expectations:
- structured current/value readings at the tested points
- expected range or conversion basis
- result classification
- technician observations
- required justification for missing expected evidence or incomplete validation steps

Notable guidance / checklist characteristics:
- prompts to verify supply, continuity, polarity, and obvious wiring issues before escalating
- lightweight checklist structure optimized for quick field verification rather than exhaustive documentation

Special history / comparison needs:
- prior loop issue or recurrence summary where available
- comparison should highlight repeated instability, intermittent failure, or repeated deviation patterns

## Functional Requirements
### FR-01 Assigned Work Package Preload
- The product shall allow a technician to download assigned work packages before entering low-connectivity field conditions.
- A work package shall include the tags in scope, task context, applicable templates, cached history summary, and lightweight guidance needed for offline execution.
- The product shall support a bounded offline working set sized for practical field usage rather than plant-wide bulk synchronization.
- The product shall show when a package was last refreshed and whether its local contents are complete for offline use.
- The product shall treat the work package as a preload and assignment container, while keeping the tag report as the canonical submission, review, approval, and sync unit in v1.

### FR-02 Entry Into Tag Work
- The product shall allow entry into the workflow by:
- assigned work list
- text search for tag
- QR scan
- Tag entry shall preserve the tag as the operational anchor even when accessed from an assigned work package containing multiple tags.
- If a tag is not locally available offline, the product shall clearly indicate that the item is not cached and cannot be opened until downloaded.

### FR-03 Tag Context View
- The product shall display the minimum field context required to act without overwhelming the technician.
- The tag context view shall include, where available:
- tag identity
- short description
- area / location
- parent asset reference
- instrument family / subtype
- measured variable / signal type
- range / unit / tolerance
- criticality or risk marker
- recent history summary
- last service / last occurrence summary
- next due / overdue indicator
- applicable procedure / checklist reference
- The product shall visibly distinguish missing context from present context and allow the technician to proceed with justification when required.

### FR-04 Calculation And Test Execution
- The product shall support deterministic field calculations and test execution flows tied to the selected instrument family and test pattern.
- Supported v1 families and templates shall be limited to those defined in `Initial V1 Instrument Family / Template Scope`.
- The product shall capture both raw observations and calculated results.
- The execution experience shall remain mobile-first and optimized for on-site task completion rather than office analysis.
- The product shall support pass/fail or tolerance-based classification where relevant.
- The product shall preserve the test execution record even if connectivity is lost mid-task.

### FR-05 History Comparison
- The product shall allow the technician to compare current results with relevant prior history at the tag level when history is locally available.
- The history view shall support quick judgment, not deep analytics.
- If history is unavailable or stale, the product shall make that visible and allow work to continue with explicit risk/justification handling.
- In v1, history freshness/staleness shall be based on the last successful package refresh and any upstream freshness indicator delivered with the package. If no freshness indicator exists, the product shall show the history as age unknown and surface the associated risk.

### FR-06 Guided Diagnosis
- The product shall provide guided diagnosis prompts after or alongside result interpretation.
- Guidance shall be assistive and based on known symptom/result patterns, not authoritative.
- The product shall explain likely next checks and the reason the prompt matters.
- Guided diagnosis shall work in a useful baseline form offline for supported v1 workflows.
- AI-assisted diagnosis, if available, shall appear as optional enrichment and never replace the deterministic workflow.

### FR-07 Checklist / Best Practice / Normative Reference Usage
- The product shall embed checklist steps and lightweight field guidance into the main workflow.
- Guidance content shall prioritize:
- what to do
- why it matters
- what it helps rule out
- where the reference came from
- The product shall avoid turning the workflow into a full document-reading experience.
- If a checklist item is skipped or left incomplete, the product shall flag the risk and require justification without hard-blocking completion.

### FR-08 Evidence Capture
- The product shall support evidence capture during execution rather than as a separate after-the-fact task.
- Evidence may include:
- measurements and calculated values
- free-text observations
- photos
- timestamps
- actor attribution
- checklist outcomes
- explicit justifications for missing or incomplete elements
- Evidence items shall remain linked to the relevant tag, work package, test execution step, and report.
- Every supported v1 test pattern shall define:
- minimum submission evidence
- expected evidence for a complete package
- The v1 baseline for those definitions shall come from `Initial V1 Instrument Family / Template Scope`.
- Minimum submission evidence in v1 shall always include the structured execution record, actor, timestamps, result classification, and any justifications triggered by missing elements or visible risk.
- Missing expected evidence such as photos shall not block technician completion by itself, but shall create a visible risk and mandatory justification when the template flags the evidence as expected.

### FR-09 Report Generation
- The product shall generate a structured technical report from the work already captured.
- In v1, each tag worked inside a work package shall produce its own report record for review, approval, sync, and audit purposes.
- Reports shall include, at minimum:
- tag and work package context
- technician identity
- instrument family and test pattern
- readings and calculated results
- history comparison summary when available
- guidance/checklist outcomes
- evidence references
- risk flags
- justifications
- draft diagnosis summary
- submission status
- approval history once it exists
- The product shall present reporting as a consequence of execution, not duplicate data entry.
- A work package containing multiple tags may therefore contain multiple child reports with independent submission and approval outcomes.

### FR-10 Submission
- The technician shall be able to submit a report for review even when connectivity is unavailable.
- Offline submission shall place the report into a queued state pending synchronization and server validation.
- Submission shall enforce visible risk and justification requirements, but not hard-stop the technician solely because some context or evidence is missing.
- In v1, the exact submission boundary is:
- missing data, missing history, incomplete checklist items, and missing expected evidence do not block submission by themselves
- missing required justification for any visible risk or skipped required element does block submission
- missing minimum submission evidence for the selected test pattern does block submission
- The product shall show the user whether the submission is:
- local draft
- queued for sync
- server accepted
- returned
- approved
- The product shall not mark a connected or recently synced submission as review-ready until server acceptance has succeeded.

### FR-11 Supervisor Review
- The supervisor shall be able to review technician submissions with evidence, calculation summary, risk flags, justifications, and prior approval actions.
- In v1, higher-risk classification shall be a supervisor decision supported by visible product signals rather than an automatic final routing rule. Product signals may include criticality markers, out-of-tolerance or failed results, repeated issue indicators, and missing expected evidence with justification.
- For standard cases, the supervisor shall be able to:
- approve
- return with comments
- For higher-risk cases, the supervisor shall be able to:
- escalate to manager with comments
- Supervisor review actions shall create auditable events.
- A case becomes authoritatively escalated only when the supervisor's escalation action is accepted and validated by the server.

### FR-12 Manager Review
- The manager shall only review escalated cases in v1.
- The manager shall be able to:
- approve
- return with comments
- Manager decisions shall create auditable events and complete the higher-risk approval path.

### FR-13 Sync And Post-Sync Status Updates
- The product shall synchronize locally queued work to the server when connectivity returns.
- The product shall synchronize:
- reports
- evidence references
- checklist results
- justifications
- audit events
- review decisions
- status changes
- The product shall present per-item and overall sync state clearly to the user.
- The product shall preserve local records until the product has a confirmed post-sync outcome.
- In v1, the product shall not support silent auto-merge of conflicting edits on the same report. Conflicting updates shall move the affected local item into sync issue and require user refresh/rework based on the server-authoritative record.

### FR-14 Auditability And Traceability
- The product shall maintain traceability from assigned work package to tag, execution, evidence, report, approval actions, and sync state.
- Every key action shall produce an audit event with actor, role, timestamp, action, and linked business object reference.
- Returned, escalated, and re-submitted work shall preserve history rather than overwrite it silently.

## Offline / Sync Requirements
### What Must Work Fully Offline
- Open already-downloaded assigned work packages.
- Browse locally cached tags and context.
- Search locally cached tags.
- Open QR-scanned tags if they are present in the local working set.
- Execute supported calculations and test flows.
- View cached history summary and cached lightweight guidance.
- Capture evidence, notes, checklist responses, and justifications.
- Generate and edit draft reports.
- Submit work into a local queued state.

### What Can Be Deferred
- Upload of finalized records and media.
- Retrieval of uncached history or newly assigned work packages.
- Remote AI assistance.
- Cross-user visibility of the latest actions.
- Official approval decisions when server validation has not yet occurred.

### What Syncs Later
- Report payloads.
- Evidence items and metadata.
- Checklist outcomes.
- Justifications.
- Audit events.
- Review decisions.
- Status changes.
- Refreshed history/reference snapshots for future offline work.

### What Requires Server-Side Validation
- Official acceptance of a technician submission into the canonical record.
- Official supervisor approve / return / escalate actions.
- Official manager approve / return actions.
- Role and permission enforcement for review actions.
- Canonical audit log registration.
- Conflict resolution when the same record was updated in multiple places.
- Acceptance of any AI response that becomes part of the permanent record.
- Final acceptance of a report into supervisor review when required evidence binaries are still outstanding.

### How The User Sees Sync State
- Each work package and report shall display a visible sync badge/state.
- Minimum visible sync states in v1:
- local only
- queued
- syncing
- pending validation
- synced
- sync issue
- Approval-related records pending server validation shall show a distinct pending-validation state rather than appearing final prematurely.

### Authoritative State Mapping
- Draft saved locally:
- report state `In Progress`
- sync state `Local Only`
- Technician submits while offline:
- report state `Submitted - Pending Sync`
- sync state `Queued`
- Technician submits while connected or a queued item begins upload:
- report state `Submitted - Pending Sync`
- sync state `Syncing` and then `Pending Validation` once the server has received the payload but has not yet finished acceptance checks
- Server accepts structured payload and all minimum required evidence:
- report state `Submitted - Pending Supervisor Review`
- sync state `Synced`
- Server rejects or detects a conflict:
- report state remains at the latest valid business state
- sync state `Sync Issue`
- Reviewer acts while connected and server validates the action:
- report state moves to the next approval lifecycle state
- sync state remains `Synced`

### Reviewer Connectivity Boundary
- In v1, technicians are the only users who must be supported offline for core task completion.
- Supervisors and managers may view previously synchronized data offline, but official approve / return / escalate actions are connected actions in v1 and require immediate server-side validation.
- Reviewer comments drafted without connectivity, if supported at all, are local notes only until the user reconnects and performs the official action.

## Approval / RBAC Requirements
### Roles
- Technician
- Supervisor
- Manager

### Technician Permissions
- View assigned work packages in scope.
- Open and execute tag work.
- Capture/edit evidence and justifications before final approval.
- Submit reports.
- Rework and resubmit returned reports.
- View approval comments and status history.

### Supervisor Permissions
- View technician submissions within assigned scope.
- Approve standard cases.
- Return cases with comments.
- Escalate higher-risk cases to manager with rationale.
- View full report, evidence, and audit trail relevant to review.

### Manager Permissions
- View escalated cases within assigned scope.
- Approve escalated cases.
- Return escalated cases with comments.
- View escalation rationale and prior supervisor actions.

### Approval Requirements
- In v1, `assigned scope` means:
- technicians see work packages explicitly assigned to them or their field team
- supervisors see submissions routed to their review queue from those assigned work packages
- managers see only submissions explicitly escalated into their review queue
- Standard case path:
- technician submits
- supervisor approves or returns
- Higher-risk case path:
- technician submits
- supervisor escalates
- manager approves or returns
- Comments shall be mandatory for returns and escalations.
- Approval decisions shall be auditable and traceable to user, role, timestamp, and target record.
- Official approval state changes shall not rely on local-only device state.
- In v1, supervisor and manager review actions are connected actions only.

### Offline Identity / Session Boundary
- V1 assumes one active authenticated user per device session.
- Cached work packages, drafts, evidence, and queued submissions shall be isolated by authenticated user.
- Offline user switching is not supported when unsynced records for the current user remain on the device.

## AI Boundary Requirements
- AI shall be optional, assistive, asynchronous, and pluggable.
- AI shall never be required to execute the field workflow.
- AI shall never replace deterministic calculations, rule-based checks, or approval authority.
- AI may assist with:
- suggestion of likely issue patterns
- optional diagnosis enrichment
- draft report language
- missing evidence highlighting
- AI requests may be deferred when offline and resolved later.
- The product shall clearly distinguish deterministic product output from AI-suggested output.

## Domain Object Model (Business-Level)
### Tag / Asset Context
Purpose:
- Identifies the field item being worked on and gives the technician enough operational context to act.

Key business attributes:
- tag identifier
- short description
- area / location
- parent asset reference
- instrument family / subtype
- measured variable
- signal type
- range
- unit
- tolerance
- criticality
- due / overdue indicators
- applicable reference pointers

### Assigned Work Package
Purpose:
- Bounded unit of assigned field work that groups one or more tags with the context needed for execution.

Key business attributes:
- work package identifier
- source reference
- assigned technician/team
- included tags
- required templates
- due window / priority
- package status
- cache freshness
- child report summary

### Instrument Family
Purpose:
- Defines the broad class of instrument for workflow, calculations, evidence expectations, and guidance.

Key business attributes:
- family name
- subtype
- supported test patterns
- default evidence expectations
- default risk profile
- v1 template scope status

### Test Pattern
Purpose:
- Defines the execution pattern for a specific kind of field check or calibration activity.

Key business attributes:
- pattern name
- required inputs
- calculation/acceptance logic
- pass/fail semantics
- linked checklist/guidance
- linked evidence expectations
- minimum submission evidence
- history comparison expectation

### Procedure / Checklist Reference
Purpose:
- Provides concise in-flow operational guidance and step structure.

Key business attributes:
- reference identifier
- title
- version
- steps
- concise explanation
- why-it-matters note
- source reference

### History Summary
Purpose:
- Provides recent relevant prior records to compare with the current result.

Key business attributes:
- related tag
- recent values / outcomes
- recent interventions or occurrences
- recurrence marker
- freshness / availability indicator

### Test Execution Record
Purpose:
- Captures one performed execution/test/calculation event for a tag in a work package.

Key business attributes:
- related tag and work package
- test pattern
- raw inputs
- calculated outputs
- result classification
- observations
- actor
- time started / completed

### Evidence Item
Purpose:
- Stores proof captured during execution.

Key business attributes:
- evidence type
- linked step or test execution
- linked tag/report
- creator
- timestamp
- caption/description
- sync state

### Justification
Purpose:
- Explains why work continued despite missing data, skipped items, weak evidence, or other visible risk conditions.

Key business attributes:
- linked report / step / risk flag
- reason type
- free-text justification
- author
- timestamp

### Report
Purpose:
- Structured reviewable record generated from completed field work.

Key business attributes:
- report identifier
- related work package / tag
- technician
- summary of execution
- risk flags
- evidence references
- justification references
- report lifecycle state
- sync status
- reviewable unit flag indicating per-tag report in v1

### Approval Decision
Purpose:
- Represents a supervisor or manager decision on a submitted report.

Key business attributes:
- target report
- decision type
- actor
- role
- comment
- escalation flag where relevant
- timestamp

### Sync Status
Purpose:
- Represents where a report or related record stands in the local-to-server lifecycle.

Key business attributes:
- local only
- queued
- syncing
- synced
- sync issue
- pending validation

## State Models / Lifecycle Definitions
### Report Lifecycle
- In Progress
- Ready to Submit
- Submitted - Pending Sync
- Submitted - Pending Supervisor Review
- Returned by Supervisor
- Escalated - Pending Manager Review
- Returned by Manager
- Approved

Rules:
- `Submitted - Pending Sync` means the technician finished locally and queued the submission, but the server has not yet accepted it.
- `Submitted - Pending Supervisor Review` begins after successful sync/server acceptance for standard or potentially higher-risk cases.
- `Escalated - Pending Manager Review` is entered only when a supervisor escalates.
- `Approved` is final for standard cases after supervisor approval and for higher-risk cases after manager approval.
- Each tag report moves through this lifecycle independently, even when multiple reports belong to the same assigned work package.

### Work Package Roll-Up Rule
- A work package is `Not Started` when no child tag report has begun.
- A work package is `In Progress` when at least one child tag report is in progress and at least one scoped tag remains unfinished.
- A work package is `Pending Review` when all required child tag reports have been submitted and at least one is awaiting review.
- A work package is `Completed` when all required child tag reports are in a final approved state.
- A work package is `Attention Needed` when at least one child tag report is returned or in sync issue.

### Approval Lifecycle
- Not Submitted
- Pending Supervisor Review
- Supervisor Returned
- Supervisor Approved
- Escalated to Manager
- Manager Returned
- Manager Approved

Rules:
- Supervisor Approved is final only for standard cases.
- Manager Approved is final only for escalated cases.
- Returned states reopen the report for technician rework and resubmission.

### Sync Lifecycle
- Local Only
- Queued
- Syncing
- Synced
- Pending Validation
- Sync Issue

Rules:
- Pending Validation applies when the server has received the record or action but has not yet completed authoritative validation.
- Sync Issue requires visible user attention and preserves the local record.

## UX / Workflow Requirements
### Journey 1: Preload / Assigned Work Package Download
1. Technician opens the app while connected.
2. Technician views assigned work packages.
3. Technician downloads one or more packages for offline use.
4. Product confirms package completeness, cache freshness, and offline readiness.
5. Technician goes to the field with the package stored locally.

### Journey 2: Tag Entry By Assigned List, Search, Or QR
1. Technician opens a package or the locally cached tag list.
2. Technician enters via:
- assigned tag list
- text search
- QR scan
3. Product opens the selected tag if available locally.
4. If unavailable locally, product explains that the tag is not cached and cannot be used offline until downloaded.

### Journey 3: Tag Context View
1. Technician opens the tag.
2. Product shows concise context, expected parameters, due/recurrence indicators, recent history summary, and applicable workflow/template.
3. Missing context is marked visibly.
4. Technician proceeds into execution without leaving the tag-centered flow.

### Journey 4: Calculation / Test Execution
1. Technician selects or is guided into the relevant test pattern.
2. Product collects readings and execution inputs.
3. Product runs the deterministic calculation or acceptance logic.
4. Product shows the result and allows observations/evidence capture inline.

### Journey 5: History Comparison
1. Product shows current result next to available prior results.
2. Technician sees drift / recurrence cues where available.
3. If history is missing or stale, the product marks that condition without blocking the workflow.

### Journey 6: Guided Diagnosis
1. Based on result pattern and selected workflow, product suggests likely next checks or issue classes.
2. Technician reviews the prompt and proceeds using judgment.
3. Optional AI enrichment may later add suggestions without changing the required deterministic workflow.

### Journey 7: Checklist / Best-Practice / Normative Reference Usage
1. Product shows relevant checklist steps and concise guidance in context.
2. Technician completes, skips, or annotates steps.
3. If skipped/incomplete, product creates visible risk and requires justification.

### Journey 8: Evidence Capture
1. Technician captures photos, notes, and structured observations during execution.
2. Evidence is linked automatically to the relevant tag, step, and report draft.
3. Evidence remains available locally offline until synced.

### Journey 9: Report Generation
1. Product assembles a report from captured execution data, evidence, and justifications.
2. Technician reviews the generated report summary.
3. Technician adds any final notes or corrections.
4. If the work package contains multiple tags, the product keeps each tag report separate for later submission and approval.

### Journey 10: Submission
1. Technician submits the report.
2. If offline, the product stores it as Submitted - Pending Sync.
3. If connected, the product sends it for server acceptance and moves it into Pending Supervisor Review on success.
4. Product makes visible whether the submission is queued, accepted, or has an issue.
5. Submission is blocked only when minimum submission evidence is missing or a required justification for a visible risk has not been entered.

### Journey 11: Supervisor Approval / Return
1. Supervisor opens a submitted report.
2. Supervisor reviews evidence, calculations, risk flags, and justifications.
3. Supervisor decides whether the case remains standard or should be treated as higher-risk based on visible product signals and operational judgment.
4. For standard cases, supervisor approves or returns with comments.
5. Returned items go back to technician rework with visible comments/history.

### Journey 12: Escalation To Manager
1. Supervisor identifies a higher-risk case.
2. Supervisor escalates with rationale.
3. Product moves the report to Escalated - Pending Manager Review.
4. Escalation is auditable and visible in the lifecycle history.
5. The escalation becomes authoritative only after server validation.

### Journey 13: Manager Approval / Return
1. Manager opens the escalated report.
2. Manager reviews supervisor rationale, evidence, and risk indicators.
3. Manager approves or returns with comments.
4. Product records the decision and preserves the full trace.

### Journey 14: Sync And Post-Sync Status Updates
1. Connectivity returns.
2. Product synchronizes queued items in the background.
3. User sees progress and any issues.
4. Server-validated status changes update local records.
5. Post-sync state becomes visible on the report and work package.

## Metrics
### Core Outcome Metrics
- Percentage of assigned v1 workflows completed fully offline without abandonment.
- Median time from tag open to technician submission.
- Percentage of submissions accepted for review without missing mandatory justification.
- Supervisor return rate due to unclear or insufficient evidence.
- Median time from technician submission to final approval.
- Sync success rate for queued submissions and evidence.
- Percentage of repeat work where history comparison was available and used.

### Quality Metrics
- Consistency of report structure across technicians.
- Percentage of risk-flagged submissions that include usable justification.
- Percentage of approval decisions with complete auditable metadata.

## Risks / Assumptions / Open Questions
### Major Risks
- Upstream tag and history data quality may reduce the value of context and comparison in early rollout.
- Offline conflict scenarios may become difficult if edits are allowed too broadly across users/devices.
- Evidence capture requirements may become too heavy and slow field execution if not bounded carefully.
- Instrument family scope may sprawl if new templates are added without a disciplined product model.
- Teams may pressure TagWise into CMMS/planning territory and weaken the tag-centered execution focus.

### Key Assumptions
- Assigned work packages are created upstream and delivered into TagWise; TagWise is not responsible for planning the work.
- Field teams will accept mobile as the primary execution surface.
- Cached history summary is sufficient for most v1 field comparisons.
- Supervisors and managers will usually review while connected, even if technicians work offline.
- Lightweight best-practice / normative guidance is sufficient for v1 and preferable to deep document handling.
- Minimum submission evidence and expected evidence can be defined consistently for the initial v1 families and templates defined in this PRD.

### Open Questions For Later Architecture Decisions
- What is the final export/share model for reports in v1?
- What is the minimal but sufficient audit event granularity for enterprise-readiness without overloading storage or review UX?

## PRD Handoff Statement
This PRD keeps the approved Product Brief boundaries intact. TagWise remains a mobile-first, offline-first, tag-centered field execution, evidence, reporting, and approval product with bounded work packages, non-blocking workflow behavior, lightweight guidance, and a pluggable AI boundary. The initial v1 instrument-family/template scope is now explicitly defined, and the document is ready to move to `bmad-agent-architect` for the next Architecture step without reopening product scope.
