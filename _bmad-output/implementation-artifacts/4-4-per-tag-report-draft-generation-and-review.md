# Story 4.4: Per-Tag Report Draft Generation and Review

Status: review

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

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Completion Notes List
- Added a generic `report` step to the shared execution shell so every execution now ends with a local per-tag report draft review instead of a second clerical flow.
- Built the report draft as a local projection from captured execution, evidence, history, and risk state, including evidence references, risk flags, justifications, lifecycle state, and a generated draft diagnosis summary.
- Added explicit checklist outcome projection and report-draft rendering so FR-09’s guidance/checklist outcome requirement is now visible in the draft itself instead of only indirectly through risk hooks.
- Kept editability narrow by persisting only the report-review slice (`final notes / corrections` plus saved timestamp) into the existing technician-owned draft record while the rest of the report continues to derive from already captured local work.
- Preserved reopen/update behavior by merging existing draft payload when calculation, guidance, or photo saves refresh the draft anchor, so later evidence saves do not wipe previously saved report-review notes.
- Kept the story local-first and pre-submission only: no backend/report-generation API, no queue transition, no approval flow, and no new durable workflow engine were introduced.

### Tests Run
- `cd mobile && npm run typecheck`
- `cd mobile && npm test -- sharedExecutionShellService`
- `cd mobile && npm test`
- `cd mobile && npx expo export --platform android`

### File List
- `mobile/src/features/execution/model.ts`
- `mobile/src/features/execution/localExecutionTemplateRegistry.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `_bmad-output/implementation-artifacts/4-4-per-tag-report-draft-generation-and-review.md`
