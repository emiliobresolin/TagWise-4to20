# Story 3.7: Guided Diagnosis, Checklist, and Lightweight Guidance Flow

Status: review

## Metadata
- Story key: 3-7-guided-diagnosis-checklist-and-lightweight-guidance-flow
- Story map ID: E3-S7
- Epic: Epic 3 - Template-Driven Field Execution
- Release phase: Vertical Slice

## User Story
As a technician, I want practical next-step guidance and concise checklist context so I can keep moving without opening a manual.

## Scope
guided diagnosis prompts, checklist steps, why-it-matters messaging, source reference display, risk-flag hooks for skipped/incomplete items.

## Key Functional Requirements Covered
FR-06, FR-07.

## Technical Notes / Implementation Approach
keep guidance lightweight and template-linked; support offline baseline prompts; treat any future AI result as additive only.

## Dependencies
- `E3-S1`, `E3-S2`, `E3-S6`.

## Risks
- dumping too much normative content into the shell will hurt field usability.

## Acceptance Criteria
1. Execution shell displays checklist steps and guidance in context.
2. Prompts explain what to do, why it matters, and what it helps rule out.
3. Skipped or incomplete checklist items generate visible risk state hooks.
4. Flow works offline with cached guidance content.

## Validation / Test Notes
- checklist completion tests, skip/incomplete risk tests, UX smoke tests for concise guidance display.

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
- Extended the local template contract with structured `checklistSteps` and `guidedDiagnosisPrompts` so Story 3.7 can stay template-owned and offline-first without introducing a new backend/runtime dependency.
- Updated the shared execution shell to build shell-local guidance state from the cached template and guidance snapshot content, including visible risk hooks for skipped or incomplete checklist items.
- Kept the guidance flow non-blocking and local-only: checklist outcomes are shell-local for Story 3.7 and are preserved through calculation-save reloads in-session, but no durable checklist persistence or report workflow was added before Epic 4.
- Added a generic guidance render block in the existing `guidance` step so technicians can see what to do, why it matters, what it helps rule out, and the cached source reference without opening a manual.
- Seeded the approved family templates with lightweight structured checklist and diagnosis content so the app path is driven by real template metadata, not hidden family logic in generic layers.

### Tests Run
- `cd mobile && npm test -- localExecutionTemplateRegistry sharedExecutionShellService`
- `cd mobile && npm run typecheck`
- `cd mobile && npm test`
- `cd mobile && npx expo export --platform android`
- `cd backend && npm test`
- `cd backend && npm run typecheck`
- `cd backend && npm run build`

### File List
- `backend/src/modules/work-packages/model.ts`
- `backend/src/modules/work-packages/seedData.ts`
- `backend/dist/modules/work-packages/seedData.js`
- `mobile/src/features/work-packages/model.ts`
- `mobile/src/features/execution/model.ts`
- `mobile/src/features/execution/localExecutionTemplateRegistry.ts`
- `mobile/src/features/execution/localExecutionTemplateRegistry.test.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `_bmad-output/implementation-artifacts/3-7-guided-diagnosis-checklist-and-lightweight-guidance-flow.md`
