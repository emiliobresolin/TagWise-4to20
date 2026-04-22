# Story 3.6: History Comparison and Freshness Cues

Status: review

## Metadata
- Story key: 3-6-history-comparison-and-freshness-cues
- Story map ID: E3-S6
- Epic: Epic 3 - Template-Driven Field Execution
- Release phase: Vertical Slice

## User Story
As a technician, I want current results compared to cached prior history so I can spot drift or recurrence without leaving the tag workflow.

## Scope
current-versus-history display, freshness/staleness labels, age-unknown handling, recurrence cues.

## Key Functional Requirements Covered
FR-05.

## Technical Notes / Implementation Approach
compare only locally cached summaries; do not depend on live history fetch; preserve family/test-pattern relevance where the PRD calls for it.

## Dependencies
- `E2-S5`, `E3-S1`, `E3-S2`.

## Risks
- ambiguous history freshness will weaken trust in diagnosis and approval.

## Acceptance Criteria
1. Execution shell can show current values next to locally cached history.
2. Missing, stale, or age-unknown history states are clearly distinguished.
3. History comparison does not block execution when unavailable.
4. Recurrence cues can be rendered when present in the snapshot.

## Validation / Test Notes
- history rendering tests, stale/unknown state tests, offline comparison smoke test.

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
- Reused the existing package freshness timestamps for history trust signals, so Story 3.6 distinguishes `available`, `stale`, `age-unknown`, `missing`, and `unavailable` history without adding a new backend contract.
- Kept history comparison strictly local-first: the tag context now carries cached prior result and recurrence cue metadata from the downloaded snapshot, and the shared shell renders those cues through the existing `history` step.
- Extended the history step with generic current deterministic result data from the existing calculation path: current checkpoint values, signed deviation, absolute deviation, and percent-of-span now appear next to cached history for quick drift judgment.
- Updated calculation save behavior to reload the shell after local persistence so the history step immediately shows current-versus-prior comparison cues after a deterministic calculation is run.
- Kept execution non-blocking when history is unavailable or missing; the shell still opens and the history step now explains the limitation explicitly instead of blocking execution.

### Tests Run
- `cd mobile && npm test -- localTagContextService sharedExecutionShellService`
- `cd mobile && npm run typecheck`
- `cd mobile && npm test`
- `cd mobile && npx expo export --platform android`

### File List
- `mobile/src/data/local/repositories/assignedWorkPackageRepository.ts`
- `mobile/src/features/work-packages/model.ts`
- `mobile/src/features/work-packages/localTagContextService.ts`
- `mobile/src/features/work-packages/localTagContextService.test.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `_bmad-output/implementation-artifacts/3-6-history-comparison-and-freshness-cues.md`
