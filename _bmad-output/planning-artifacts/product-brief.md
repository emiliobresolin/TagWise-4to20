# TagWise Product Brief

Status: Approved product brief baseline

Source of truth:
- Approved Product Brief in this chat
- `docs/MVP/TagWise_Project_Instructions.txt`
- `docs/MVP/TagWise.pdf`

## Product Summary
TagWise is a mobile-first, offline-first field execution, evidence, reporting, and approval application for industrial instrumentation work. The tag or instrument remains the operational anchor. Assigned work packages provide bounded field context around tags, but TagWise is not a CMMS, scheduler, or planning system.

The core v1 workflow remains:

`tag -> context -> calculation -> history comparison -> guided diagnosis -> checklist / best practice / normative reference -> report -> approval -> sync`

## Problem
Instrumentation technicians often work in low-connectivity plants with fragmented tools, inconsistent evidence capture, weak traceability, and approval steps that happen outside the field workflow. The result is slow execution, incomplete records, and poor auditability.

TagWise exists to reduce field friction while preserving operational control:
- technicians complete work in one mobile flow
- reports are produced from captured work, not retyped later
- supervisors and managers review auditable submissions
- offline execution remains first-class instead of a degraded fallback

## Primary Users And Goals
### Technician
- Open assigned tags quickly from a bounded work package.
- Execute tests and inspections offline.
- Capture readings, evidence, observations, and justifications in context.
- Submit a reviewable per-tag report without being blocked by missing non-critical data or connectivity.

### Supervisor
- Review submitted reports with clear evidence, risk flags, and justifications.
- Approve standard cases or return them with comments.
- Escalate higher-risk cases to a manager with auditable rationale.

### Manager
- Review only escalated higher-risk cases.
- Approve or return escalated reports with traceable comments.
- Preserve control over higher-risk operational decisions without joining day-to-day execution.

## V1 Scope
- Mobile-first execution centered on the tag.
- Offline preload of bounded assigned work packages.
- Local access to tag context, templates, lightweight guidance, and cached history summaries.
- Deterministic calculations and result classification for the approved v1 instrument families and test patterns.
- Inline evidence capture, justifications, and per-tag report generation.
- Deferred sync with visible sync state and server validation.
- Auditable supervisor approval / return and manager escalation / approval flows.
- Optional, assistive, asynchronous AI behind a clean non-blocking boundary.

## V1 Out Of Scope
- CMMS, EAM, or scheduling behavior.
- Workforce planning, spare parts, inventory, or procurement.
- Reviewer offline approval authority.
- Autonomous AI decisions or AI-gated workflows.
- Deep SAP / Maximo / TOTVS integration in v1.
- Broad admin builders for templates or workflow design.

## Offline / Sync Boundary
### Must Work Fully Offline
- Open already-downloaded assigned work packages.
- Browse locally cached tags and context.
- Search locally cached tags and open cached QR-scanned tags.
- Execute supported calculations and test flows.
- View cached history summary and lightweight guidance.
- Capture evidence, notes, checklist responses, and justifications.
- Generate and edit draft per-tag reports.
- Submit locally into a queued state.

### Deferred / Sync-Later
- Upload of report payloads and media.
- Retrieval of uncached history or new assignments.
- AI assistance that depends on remote services.
- Official reviewer actions, which remain connected/server-validated in v1.

## Approval Lifecycle
- Standard case: Technician submits -> Supervisor approves or returns.
- Higher-risk case: Technician submits -> Supervisor escalates -> Manager approves or returns.
- Every submission, return, escalation, approval, and resubmission must be auditable.
- Approval comments and decisions must remain linked to user, role, timestamp, and target report.

## Product Principles
- Tag first: the instrument in hand stays at the center of the experience.
- Offline first: technician completion cannot depend on live connectivity.
- Non-blocking execution: visible risk and mandatory justification replace dead-end hard stops for non-critical gaps.
- Evidence before opinion: capture what happened in the field before summarizing it.
- Lightweight guidance: norms and best practices must support the workflow, not overwhelm it.
- Production-minded simplicity: early releases must be cheap and simple to operate while still future-ready for enterprise integration.

## Initial V1 Instrument Scope
- Pressure transmitters
- Temperature transmitters / RTD inputs
- Level transmitters
- Control valves with positioners
- Analog 4-20 mA loops

These families are supported through a shared execution shell and bounded template set, not through separate application tracks.

## Success Measures
- Technicians can complete core v1 workflows fully offline for assigned tags.
- Per-tag report submission is faster and more complete than the current fragmented process.
- Supervisor return rates due to unclear evidence or missing rationale decline over time.
- Sync reliability is strong enough that offline work is trusted operationally.
- The product model supports the approved v1 instrument families without family-specific forks.

## Key Assumptions And Risks
### Assumptions
- Assigned work packages are created upstream and delivered to TagWise.
- Cached history summaries are sufficient for most v1 comparisons.
- Supervisors and managers usually review while connected.
- Lightweight best-practice guidance is preferable to deep document handling in v1.

### Risks
- Weak upstream tag/history data will reduce field trust.
- Template sprawl could break the shared execution model.
- Evidence requirements could become too heavy if not bounded carefully.
- Teams may try to stretch TagWise into CMMS/planning territory too early.
