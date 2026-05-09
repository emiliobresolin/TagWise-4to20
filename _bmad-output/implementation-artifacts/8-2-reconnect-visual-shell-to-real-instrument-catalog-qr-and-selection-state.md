# Story 8.2: Reconnect Visual Shell to Real Instrument Catalog, QR, and Selection State

Status: review

## Metadata
- Story key: 8-2-reconnect-visual-shell-to-real-instrument-catalog-qr-and-selection-state
- Story map ID: Visual Shell Regression Repair Story A
- Epic: Post-8.1 Mobile Visual Shell Repair
- Release phase: Visual Shell Regression Repair
- Created: 2026-05-09
- Source decision: `_bmad-output/planning-artifacts/visual-shell-service-backed-adapter-decision.md`

## User Story
As a technician using the dark TagWise mobile shell,
I want QR scan, dashboard cards, search/list results, and tag detail navigation to open the exact downloaded/local tag I selected or scanned,
so that the visual shell preserves the real offline-first field workflow instead of sending me into a PT-204 demo flow.

## Context
Story 8.1 successfully moved the APK into the dark TagWise visual direction, but QA and the regression analysis found that the new `VisualProductShell` behaves as a parallel demo flow. It currently owns local route state, builds a screenshot-shaped visual model, prefers PT-204, uses no-argument detail navigation, and does not drive the existing local tag/QR/context services.

This story is the first repair slice. It restores identity correctness and service-backed catalog ownership for the visual shell. It must not try to fix the whole execution/report/approval stack. The purpose is to make every later repair story start from the correct selected tag, work package, and template context.

## Scope
In scope:
- Mobile app only.
- Reconnect the dark visual dashboard/list/search/QR/detail entry path to existing local-first work-package/tag services.
- Use downloaded/local package tags as the authenticated production catalog source.
- Preserve selected `tagId`, `tagCode`, `workPackageId`, and selected execution template context through visual navigation.
- Make QR scan use the existing local QR resolver for scan payloads.
- Open the matching local tag context for the selected/scanned tag.
- Prepare or load the existing shared execution shell only as far as needed to preserve selected tag/template identity for downstream screens.
- Keep screenshot/demo seed data only as explicit demo or empty-state data.
- Add regression tests that fail if authenticated visual navigation hardcodes PT-204, falls back to `seededTags[0]`, or opens detail without a selected tag identity.

Out of scope:
- Do not implement or repair the calculator UI beyond preserving selected tag/template identity.
- Do not implement PV <-> mA <-> percent conversion helpers in this story.
- Do not repair checklist, next-step, best-practice, or normative reference rendering beyond preserving selected tag/template identity.
- Do not repair report summary editability, attachments, photos, evidence queue, or report submission.
- Do not implement AI diagnosis, AI job lifecycle, or report-level "AI Diagnosis" projection.
- Do not repair supervisor approval queues, confirmations, tabs, or decision actions.
- Do not change backend contracts, seed data, sync services, evidence services, review services, or AI provider behavior.
- Do not treat visual/demo data as proof that production identity/navigation works.

## Key Functional Requirements Covered
- PRD FR-01: bounded offline working set from assigned packages.
- PRD FR-02: tag entry through assigned list, search, and QR scan.
- PRD FR-03: tag context view loaded from local context.
- Architecture visual shell service-backed adapter rule.
- Story-map Visual Shell Regression Repair Story A.

## Acceptance Criteria
1. Authenticated visual catalog source is local/downloaded package data.
   - When a technician has downloaded packages, dashboard/list/search cards in the visual shell are derived from local package tag entries.
   - Screenshot/demo seed data is not merged into authenticated production lists as if it were real downloaded work.
   - If no downloaded tags exist, the visual shell shows an empty/download/refresh state instead of silently substituting PT-204.

2. Selecting an instrument preserves identity.
   - Pressing any tag card or search/list result passes that tag's `tagId` and `workPackageId` through navigation.
   - The detail screen opens the exact selected tag.
   - PT-204 opens only when the user selected/scanned PT-204 from local data.
   - Selecting PT-101, TT-205, AI-330, or any other local seed/downloaded tag does not open PT-204 unless that is the selected tag.

3. QR scan uses the local QR resolver.
   - The visual QR action invokes the existing local QR scan path, not `handleQrDemo`.
   - Cached QR hits open the matching local tag context without requiring a live API call.
   - Cache misses show the existing not-cached guidance and do not open PT-204.
   - Invalid payloads fail gracefully and keep the technician in a recoverable state.

4. Visual route state cannot lose the selected tag.
   - `VisualProductShell` and child components no longer use no-argument detail navigation for authenticated tag cards.
   - `TagSection`, `TagListItem`, recent cards, and search results call handlers with the selected tag identity.
   - Detail/action routes read the selected service-backed identity, not `model.selectedTag`.

5. Selected tag context comes from local services.
   - Detail context for authenticated flows is resolved through `LocalTagContextService` or existing `TagWiseApp` context state.
   - Range, tolerance, instrument family/subtype, area, parent asset, due indicator, history preview availability, and template/reference pointers come from local package snapshots where available.
   - Missing local context is displayed as missing/unavailable and does not silently fall back to screenshot values.

6. Execution handoff preserves template context.
   - The selected tag's available execution templates are preserved in state for downstream execution screens.
   - If a valid template is selected or can be safely selected by existing rules, the handoff to `SharedExecutionShellService.loadShell` uses the selected `workPackageId`, `tagId`, and template id.
   - If template selection is required, the visual shell shows the existing available template choices or a clear missing-template state rather than using a hardcoded template.
   - This story does not need to make calculation/history/diagnosis screens fully functional.

7. Demo seed data is explicit and non-authoritative.
   - PT-204/demo data may remain only for signed-out demo, explicit demo mode, or empty-state illustration.
   - Authenticated production flow never uses `seededTags[0]` as the selected tag fallback.
   - Tests clearly distinguish demo behavior from authenticated local package behavior.

8. Existing local-first behavior is preserved.
   - After a package is downloaded, list/search/QR/detail selection works offline.
   - No live backend call is required to open a cached tag or QR hit.
   - The app must never hard-block the technician because QR camera permission is denied; the existing manual payload path or equivalent recovery remains available.

9. Existing foundations are not removed.
   - SQLite bootstrap, session restoration, work-package download/cache state, local QR resolver, tag entry service, tag context service, and shared execution shell service remain intact.
   - The old service-backed handlers in `TagWiseApp` are reused or adapted rather than duplicated with new domain logic.

10. Regression tests protect identity.
    - Tests fail if authenticated visual workflow selects PT-204 by default while other local tags are present.
    - Tests fail if authenticated visual workflow uses `seededTags[0]` as selected tag fallback.
    - Tests prove selected `tagId` flows from dashboard/list/search/QR into detail and execution handoff state.
    - Existing visual workflow tests that assert PT-204 fallback in local package context are removed or rewritten to match the new rule.

11. Validation commands pass.
    - Mobile typecheck passes.
    - Mobile tests pass.
    - `expo-doctor` passes unless there is a documented environment-only blocker.
    - `git diff --check` has no new content issues other than existing line-ending warnings.

12. Manual APK smoke confirms the repair.
    - With backend reachable, technician can sign in, refresh/download a package, and see real local/downloaded tags in the dark shell.
    - After disabling backend/network, selecting at least two different cached tags opens the exact selected tag context.
    - A QR payload for a cached non-PT-204 tag opens that tag, not PT-204.
    - A QR payload for an uncached tag shows not-cached guidance and does not open any fallback instrument.

## Tasks / Subtasks
- [x] Confirm the current visual shell regression and choose the smallest service-backed repair path (AC: 1-4)
  - [x] Inspect `VisualProductShell`, `visual-shell/model.ts`, and `TagWiseApp` route/handler state before editing.
  - [x] Identify any existing service-backed handler that can be reused directly instead of rewritten.
  - [x] Keep calculator/report/evidence/approval fixes out of this story unless a tiny identity handoff is strictly required.

- [x] Introduce or refactor visual-shell view-model/adapter ownership for authenticated catalog data (AC: 1, 5, 7)
  - [x] Project local/downloaded `LocalAssignedTagEntry` values into visual tag cards without losing `tagId` or `workPackageId`.
  - [x] Keep screenshot/demo seed data in an explicit demo/empty-state path only.
  - [x] Remove authenticated production reliance on `model.selectedTag`, PT-204 preference, and `seededTags[0]` fallback.
  - [x] Keep visual styling/components from Story 8.1 where they can consume service-backed props.

- [x] Rewire visual selection navigation to carry identity (AC: 2, 4, 5)
  - [x] Change visual card/list callbacks to pass selected tag identity.
  - [x] Update `TagSection`, `TagListItem`, recent cards, and dashboard search/list results so they cannot call detail without a tag.
  - [x] Wire selection to existing `LocalTagEntryService.selectPackageTag` and `LocalTagContextService.getTagContext` paths, either through `TagWiseApp` handlers or a thin adapter.
  - [x] Ensure detail route state clears/reloads correctly when the selected tag changes.

- [x] Rewire QR action to the existing local QR resolver (AC: 3, 8)
  - [x] Replace `handleQrDemo` behavior in authenticated flow.
  - [x] Reuse `LocalQrScanService.resolveScan` through existing `TagWiseApp` handlers where possible.
  - [x] Preserve camera permission handling and a manual payload fallback or equivalent nonblocking recovery path.
  - [x] Ensure QR hit, miss, and invalid states display service-backed messages/guidance.

- [x] Preserve execution-template identity for downstream flows (AC: 6)
  - [x] Ensure available template options from local tag context are visible or preserved for the selected tag.
  - [x] When loading the shared execution shell, call `SharedExecutionShellService.loadShell` with selected `workPackageId`, `tagId`, and template id.
  - [x] Do not implement calculator/history/checklist/report behavior beyond identity-safe handoff.

- [x] Add focused tests (AC: 1-4, 7, 10)
  - [x] Update visual workflow/model tests so authenticated local tags are the source of truth.
  - [x] Add selection tests for two or more local tags proving each opens its own identity.
  - [x] Add QR hit/miss/invalid visual-shell integration tests at the service/adapter level.
  - [x] Add regression tests against PT-204 hardcoding, `seededTags[0]` fallback, and no-argument detail navigation.

- [x] Validate and document story results (AC: 8, 9, 11, 12)
  - [x] Run required mobile validation commands.
  - [x] Run a manual or documented APK smoke path covering connected download, offline selection, cached QR hit, and QR miss.
  - [x] Document exact commands and any environmental blocker in the Dev Agent Record.

## Dev Notes

### Architectural Guardrails
- The visual shell is presentation-only in authenticated/production flows.
- Do not introduce a second tag selection service, QR parser, catalog store, calculation engine, report lifecycle, evidence lifecycle, sync lifecycle, approval state machine, or AI diagnosis state.
- Reuse existing services through thin adapters/view models.
- Authenticated visual screens must not silently fall back to PT-204, `seededTags[0]`, screenshot-only mock data, or no-argument navigation that loses selected tag identity.
- Missing local data should appear as missing, unavailable, or not downloaded. It should not be disguised with demo content.

### Current Regression Evidence To Address
- `mobile/src/shell/VisualProductShell.tsx` owns route state and uses `onOpenDetail={() => openRoute('detail')}` without tag identity.
- `mobile/src/shell/VisualProductShell.tsx` has `handleQrDemo`, which displays a PT-204 QR demo message and routes to detail.
- `mobile/src/features/visual-shell/model.ts` prefers PT-204 as `selectedTag` and falls back to `seededTags[0]`.
- `mobile/src/features/visual-shell/visualWorkflow.test.ts` currently asserts PT-204 demo fallback even when local package context exists.
- `mobile/src/shell/TagWiseApp.tsx` initializes the real services and already has service-backed handlers for opening tags, resolving QR payloads, and loading the execution shell, but the primary visual return path does not pass those handlers into `VisualProductShell`.

### Existing Services To Reuse
- `mobile/src/features/work-packages/localTagEntryService.ts`
  - `listPackageTags(session, workPackageId)`
  - `searchPackageTags(session, workPackageId, query)`
  - `selectPackageTag(session, workPackageId, tagId)`
- `mobile/src/features/work-packages/localQrScanService.ts`
  - `resolveScan(session, rawPayload)`
  - `parseLocalTagQrPayload(rawPayload)`
- `mobile/src/features/work-packages/localTagContextService.ts`
  - `getTagContext(session, workPackageId, tagId)`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
  - `loadShell(session, workPackageId, tagId, templateId)`
- `mobile/src/shell/TagWiseApp.tsx`
  - existing service initialization
  - existing `handleOpenTag`
  - existing `handleStartQrScanner`
  - existing `handleResolveQrPayload`
  - existing `handleProceedToExecutionShell`
  - existing `loadVisualShellTags`

### Likely Files / Modules To Inspect
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/src/shell/VisualProductShell.tsx`
- `mobile/src/features/visual-shell/model.ts`
- `mobile/src/features/visual-shell/visualWorkflow.test.ts`
- `mobile/src/features/visual-shell/designSystem.ts`
- `mobile/src/features/work-packages/model.ts`
- `mobile/src/features/work-packages/localTagEntryService.ts`
- `mobile/src/features/work-packages/localTagEntryService.test.ts`
- `mobile/src/features/work-packages/localQrScanService.ts`
- `mobile/src/features/work-packages/localQrScanService.test.ts`
- `mobile/src/features/work-packages/localTagContextService.ts`
- `mobile/src/features/work-packages/localTagContextService.test.ts`
- `mobile/src/features/execution/localExecutionTemplateRegistry.ts`
- `mobile/src/features/execution/sharedExecutionShellService.ts`
- `mobile/src/features/execution/sharedExecutionShellService.test.ts`
- `backend/src/modules/work-packages/seedData.ts` only as a reference for realistic seed/downloaded package shape.

### Implementation Guidance
- Prefer adapting `TagWiseApp` to pass service-backed state and command handlers into `VisualProductShell` instead of moving service logic into visual components.
- If a new file is useful, place pure projection logic under `mobile/src/features/visual-shell/` and keep it free of side effects.
- Any adapter should accept explicit inputs such as session state, local work-package summaries, local tags, selected tag, selected tag context, QR result, and command callbacks.
- `VisualProductShell` may own transient UI state such as active filter/search text and current visual route, but route transitions that depend on tag identity must receive explicit selected tag identity.
- Signed-out demo/empty-state behavior may still show illustrative content if needed, but it must be visibly and structurally separate from authenticated execution.
- Keep labels and dark visual design direction from Story 8.1 unless they interfere with identity correctness.
- Do not add new dependencies unless a strong reason exists. Existing stack is Expo SDK 54, React Native 0.81.5, React 19.1.0, TypeScript 5.9, and Vitest.

### Suggested Minimal Data Flow
1. `TagWiseApp` loads work packages and `visibleTags` from downloaded local snapshots.
2. `VisualProductShell` receives service-backed tags and command handlers.
3. Dashboard/search/list cards render service-backed tags with `tagId` and `workPackageId`.
4. Pressing a tag calls a handler with that identity.
5. The handler selects the tag through local services, loads local tag context, stores selected identity/context, and routes to detail.
6. QR scan resolves through `LocalQrScanService`; hit follows the same selected-tag path, miss/invalid shows guidance.
7. Detail/action screens use selected local context. They do not infer selected tag from PT-204 or seeded visual data.

## Risks
- Expanding into calculator/report/approval work would make this repair too large and harder to QA.
- Leaving any no-argument detail navigation in authenticated tag cards could preserve the PT-204 regression.
- Merging screenshot seed data with local package tags can hide missing download states and weaken future ERP/EAM integration assumptions.
- Rebuilding visual state inside React components instead of using thin adapters will recreate the same architecture problem.
- QR camera permission failures can accidentally become blocking unless the manual payload or equivalent fallback remains available.
- Template selection can become ambiguous if multiple templates exist; use existing local context/template rules and surface a choice or clear missing-template state.

## Dependencies
- Story 8.1 created the dark `VisualProductShell` and visual shell model.
- Story 2.3 implemented local tag list/search/selection.
- Story 2.4 implemented local QR parsing/resolution and cache-miss behavior.
- Story 2.5 implemented local tag context.
- Story 3.1 implemented the shared execution shell/template contract.
- Planning decision `visual-shell-service-backed-adapter-decision.md` governs this story.
- Regression analysis `visual-shell-functional-regression-analysis.md` identifies the code-level failure modes.

## Validation
Run from the repository root unless noted:

```powershell
cd mobile
npm run typecheck
npm test
npx expo-doctor
cd ..
git diff --check
```

Recommended focused test expectations:
- Unit/adapter tests for visual catalog projection from local tags.
- Unit/adapter tests for selected tag identity from dashboard/list/search.
- QR hit/miss/invalid tests that prove visual QR uses `LocalQrScanService`.
- Regression tests proving authenticated local package flow does not select PT-204 unless PT-204 is the selected/scanned local tag.
- Regression tests proving authenticated local package flow does not use `seededTags[0]` as selected tag fallback.

Manual APK smoke expectations:
1. Start backend in a phone-reachable way if package download/login is part of the test, for example with a LAN/tunnel API URL.
2. Sign in as technician.
3. Refresh/download an assigned package.
4. Open at least two different downloaded tags from the dark visual shell and verify each detail screen matches the selected tag.
5. Stop backend or disable network.
6. Reopen the app and verify cached tags remain visible.
7. Scan or paste a cached QR payload for a non-PT-204 tag and verify that tag opens.
8. Scan or paste an uncached/invalid payload and verify not-cached/invalid guidance appears without opening PT-204.

APK testing note:
- APK testing must consider whether the backend is currently running/reachable for login and package download.
- Once a package is downloaded, cached tag/list/QR/detail behavior must work offline.
- This story does not validate report submission, evidence sync, approval, or AI report behavior; those require later connected backend smoke tests.

## Source References
- [visual-shell-service-backed-adapter-decision.md](../planning-artifacts/visual-shell-service-backed-adapter-decision.md)
- [visual-shell-functional-regression-analysis.md](../planning-artifacts/visual-shell-functional-regression-analysis.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [story-map.md](../planning-artifacts/story-map.md)
- [epics.md](../planning-artifacts/epics.md)
- [prd.md](../planning-artifacts/prd.md)
- [8-1-mobile-visual-product-shell-and-technician-demo-flow.md](8-1-mobile-visual-product-shell-and-technician-demo-flow.md)
- [2-3-tag-entry-by-assigned-list-and-local-search.md](2-3-tag-entry-by-assigned-list-and-local-search.md)
- [2-4-qr-scan-entry-and-cache-miss-handling.md](2-4-qr-scan-entry-and-cache-miss-handling.md)
- [2-5-tag-context-screen.md](2-5-tag-context-screen.md)
- [3-1-shared-execution-shell-and-template-contract.md](3-1-shared-execution-shell-and-template-contract.md)

## Story Creation Notes
- Scope choice: this story is intentionally limited to catalog, QR, selected tag identity, tag context, and template identity handoff because every downstream repair depends on correct selected instrument identity.
- Intentionally left for later: calculator/history/checklist/guidance repair, report/evidence/photo repair, AI diagnosis report projection, and role-aware supervisor approval repair.
- Planning readiness: no additional planning artifact adjustment is required before development starts; the architecture, story-map, epics, regression analysis, and adapter decision now all point to this repair sequence.
- Completion note: Create-story context engine analysis completed; comprehensive developer guide created.

## Dev Agent Record

### Agent Model Used
GPT-5 Codex

### Debug Log References
- `cd mobile; npm run typecheck` - passed.
- `cd mobile; npm test -- serviceBackedNavigation visualWorkflow` - passed, 2 files / 7 tests.
- `cd mobile; npm test` - passed, 24 files / 132 tests.
- `cd mobile; npx expo-doctor` - passed, 17/17 checks.
- `rg "seededTags\\[0\\]|handleQrDemo|onQrDemo|QR demo local|abrindo PT-204|onOpenDetail=\\{\\(\\)" mobile/src` - no matches.
- `git diff --check` - passed with existing CRLF warnings only.
- QA fix: `cd mobile; npm test -- serviceBackedNavigation` - passed, 1 file / 3 tests.
- QA fix: `cd mobile; npm run typecheck` - passed.
- QA fix: `cd mobile; npm test` - passed, 24 files / 133 tests.
- QA fix: `cd mobile; npx expo-doctor` - passed, 17/17 checks.
- QA fix: `git diff --check` - passed with existing CRLF warnings only.

### Completion Notes List
- Reworked the visual workflow model so authenticated flows use only downloaded/local tags, preserve `workPackageId` and `tagId`, and expose a `local-empty` state instead of silently selecting PT-204 or `seededTags[0]`.
- Wired `TagWiseApp` service-backed handlers into `VisualProductShell` for tag selection, QR start/scan/manual-payload resolution, template selection, and shared execution shell handoff.
- Replaced visual QR demo behavior with the existing local QR resolver path and added a dark QR panel that shows scanner, manual payload fallback, hit/miss/invalid messaging, and guidance.
- Updated the detail screen to render selected local tag context, including range, history availability, asset/area, due indicator, and available execution templates.
- Kept calculator, checklist/guidance, report/evidence/photos, AI diagnosis, sync submission, and supervisor approval behavior intentionally out of scope beyond selected tag/template identity handoff.
- Manual APK smoke path documented, not executed in this environment: run backend reachable from the phone, sign in as technician, refresh/download package, open two downloaded tags and verify distinct detail contexts, disable backend/network, verify cached tags remain visible, paste/scan a cached non-PT-204 QR payload and verify it opens that tag, then paste/scan uncached/invalid payload and verify it shows guidance without opening PT-204.
- QA fix: QR miss/invalid state now preserves the authenticated `activeTagPackageId` and `visibleTags` catalog while clearing selected tag/context/template/execution state and keeping QR guidance visible. It does not open PT-204 or demo fallback data.
- QA fix: Detail context now displays local tolerance from `selectedTagContext.tolerance.value` with an unavailable fallback when tolerance is missing. This is display-only and does not add calculator behavior.

### File List
- `mobile/src/features/visual-shell/model.ts`
- `mobile/src/features/visual-shell/serviceBackedNavigation.ts`
- `mobile/src/features/visual-shell/serviceBackedNavigation.test.ts`
- `mobile/src/features/visual-shell/visualWorkflow.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/src/shell/VisualProductShell.tsx`

## Change Log

- 2026-05-09: Implemented Story 8.2 service-backed visual catalog, QR, selected tag identity, tag context, and template identity handoff repair.
- 2026-05-09: Addressed QA findings by preserving cached catalog state on QR miss/invalid and adding local tolerance display to visual detail context.
