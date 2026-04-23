# TagWise

TagWise is a mobile-first, offline-first field execution, evidence, reporting, and approval application for industrial instrumentation work.

The product is built around one core idea from the approved Product Brief and PRD: the **tag or instrument in hand stays at the center of the workflow**.

## What TagWise Is

TagWise is designed for technicians working in plants with poor or intermittent connectivity. It combines field context, deterministic calculations, history comparison, lightweight diagnosis, checklist guidance, evidence capture, report drafting, approval, and sync into one operational flow.

The approved v1 field spine is:

`tag -> context -> calculation -> history comparison -> guided diagnosis -> checklist / best practice / normative reference -> report -> approval -> sync`

TagWise is **not** a CMMS, scheduler, planner, inventory system, or permit-to-work platform.

## Product Intent

From the approved planning artifacts, TagWise exists to:

- let technicians complete real field work fully offline
- turn reports into a byproduct of captured work instead of later re-entry
- keep execution non-blocking even when data is incomplete or history is missing
- preserve auditable review and approval on the per-tag report level
- support multiple instrument families through a shared, template-driven execution model

Initial v1 instrument scope:

- pressure transmitters
- temperature transmitters / RTD inputs
- level transmitters
- control valves with positioners
- analog 4-20 mA loops

## Architecture At A Glance

The approved architecture is intentionally boring and production-minded:

- one cross-platform mobile app
- one modular backend API
- one worker service for async jobs
- one canonical PostgreSQL database
- one object-storage family for evidence/media
- one clean AI boundary
- one future integration/outbox boundary

Key architecture rules:

- **local-first mobile data access**: field screens read from local storage first
- **per-tag report is the canonical review/sync unit**
- **deterministic calculations stay local and non-AI**
- **approval is server-authoritative**
- **instrument support is template-driven, not hardcoded per family**

## MVP Visualization Reading

The image set under [docs/MVP/Visualization](docs/MVP/Visualization) shows the intended product direction more than the exact current UI.

Those visuals consistently point to:

- a dark, field-first mobile interface
- a dashboard/home surface for triage and workload grouping
- fast tag entry through search and QR
- a tag detail screen with current state, due status, and recent context
- a deterministic calculation surface
- history and recurrence visibility
- lightweight guided diagnosis with checklist support
- structured report drafting with attachments, pending items, and justification
- approval screens for reviewer actions

In short: the visuals describe **one continuous field-to-report-to-approval mobile experience**, which is exactly what the PRD and architecture define.

## Is The Current Development Heading Toward An App Like The Images?

Yes, **at the workflow and architecture level**.

The current implementation already aligns with the visual references on the most important structural points:

- shared execution shell
- template-driven instrument workflows
- deterministic calculation engine
- history comparison and freshness cues
- lightweight guided diagnosis and checklist flow
- structured execution evidence capture

That means the product is already being built toward the same operational app shown in the images:

- technician opens a tag
- sees context
- runs calculations
- checks history
- uses guidance/checklists
- captures evidence
- moves toward report and approval

### Important Reality Check

The current repository is **not yet visually equivalent** to the image set.

What is already aligned:

- core workflow shape
- local-first/offline-first behavior
- per-tag execution model
- evidence/report/approval direction

What still needs later story work to look and behave more like the images:

- polished dashboard and list presentation
- photo/media attachment flow
- justification UX
- per-tag report draft generation
- approval queue/detail/action flows
- final UI refinement and visual polish

So the answer is:

- **Yes, the project is clearly heading toward a similar app**
- **No, it is not at image-level fidelity yet**

That is expected. The implementation sequence is building the correct architecture and workflow spine first, then layering report, approval, sync, and richer UX on top.

## Current Delivery Shape

Based on the approved BMAD sequence, the project has been progressing in this order:

1. mobile shell and local SQLite foundation
2. authentication and user-partitioned local storage
3. assigned work package download and offline tag entry
4. shared execution shell and deterministic calculations
5. family-specific template packs
6. history comparison and lightweight diagnosis/guidance
7. structured execution evidence capture
8. next phases: media attachments, justifications, report drafting, sync, and approval

This is consistent with the PRD, architecture, and story map.

## Repository Layout

- [mobile](mobile)  
  React Native mobile client, local SQLite logic, execution shell, and offline-first field workflow.

- [backend](backend)  
  Modular backend foundation for API, worker, canonical data, and future approval/sync responsibilities.

- [docs](docs)  
  Supporting product inputs, including MVP references and visual direction.

- [_bmad-output/planning-artifacts](_bmad-output/planning-artifacts)  
  Approved Product Brief, PRD, Architecture, Epics, and Story Map.

- [_bmad-output/implementation-artifacts](_bmad-output/implementation-artifacts)  
  Ordered story files and implementation handoff artifacts.

## Source Of Truth

Primary planning documents:

- [Product Brief](_bmad-output/planning-artifacts/product-brief.md)
- [PRD](_bmad-output/planning-artifacts/prd.md)
- [Architecture](_bmad-output/planning-artifacts/architecture.md)
- [Epics](_bmad-output/planning-artifacts/epics.md)
- [Story Map](_bmad-output/planning-artifacts/story-map.md)
- [Story Index](_bmad-output/implementation-artifacts/story-index.md)

Visual reference set:

- [docs/MVP/Visualization](docs/MVP/Visualization)

## Practical Development Notes

The repo is being developed as a local-first mobile product first, not as a visual prototype first.

That means decisions should continue to favor:

- offline completion over live dependency
- deterministic behavior over opaque automation
- template-driven extensibility over per-family UI forks
- non-blocking field UX over rigid workflow enforcement
- clean per-tag report semantics over work-package shortcuts

If the team keeps following the approved artifacts, the resulting app should stay meaningfully aligned with the image set while remaining much more production-ready than a pure mockup-first build.
