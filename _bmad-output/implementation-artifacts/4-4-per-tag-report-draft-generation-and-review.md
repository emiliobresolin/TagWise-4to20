# Story 4.4: Per-Tag Report Draft Generation and Review

Status: ready-for-dev

## Metadata
- Story key: 4-4-per-tag-report-draft-generation-and-review
- Story map ID: E4-S4
- Epic: Epic 4 - Evidence, Justification, and Per-Tag Report Drafting
- Release phase: Vertical Slice

## User Story
As a technician, I want a per-tag report draft assembled from my work so I can review and submit it without retyping the field session.

## Scope
report draft assembly, summary screen, inclusion of evidence references/risk flags/justifications/history summary, local save and reopen.

## Key Functional Requirements Covered
FR-09, Report lifecycle `In Progress` / `Ready to Submit`.

## Technical Notes / Implementation Approach
create a local report projection from execution/evidence/justification tables; preserve editability until submission and after return.

## Dependencies
- `E4-S1`, `E4-S2`, `E4-S3`.

## Risks
- if report generation becomes a second data-entry flow, the product promise is broken.

## Acceptance Criteria
1. Draft report is generated from captured local execution data.
2. Draft shows tag context, execution summary, evidence references, risk flags, and justifications.
3. Technician can review and save the draft locally for later completion.
4. Draft can be reopened and updated without data loss.

## Validation / Test Notes
- report projection tests, reopen/edit tests, offline draft review test.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
