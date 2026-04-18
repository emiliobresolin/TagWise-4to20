# Story 2.1: Assigned Work Package List and Download

Status: ready-for-dev

## Metadata
- Story key: 2-1-assigned-work-package-list-and-download
- Story map ID: E2-S1
- Epic: Epic 2 - Offline Work Package and Tag Access
- Release phase: Vertical Slice

## User Story
As a technician, I want to see my assigned work packages and download them before entering the field so I can work offline on the right tags.

## Scope
assigned package list API, mobile list UI, package download action, local snapshot persistence for package payloads.

## Key Functional Requirements Covered
FR-01, FR-02, Domain object `Assigned Work Package`.

## Technical Notes / Implementation Approach
download a bounded snapshot containing tags, templates, cached history summary, and lightweight guidance; store version/freshness metadata locally.

## Dependencies
- `E1-S2`, `E1-S3`, `E1-S4`.

## Risks
- downloading unbounded payloads will hurt field performance.

## Acceptance Criteria
1. Connected technician can view assigned packages in scope.
2. Technician can download a package and store its snapshot locally.
3. Downloaded package contains tag, template, guidance, and history-summary data needed for offline work.
4. Download failure surfaces an actionable message without corrupting local data.

## Validation / Test Notes
- API contract test, package download integration test, offline reopen after download.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
