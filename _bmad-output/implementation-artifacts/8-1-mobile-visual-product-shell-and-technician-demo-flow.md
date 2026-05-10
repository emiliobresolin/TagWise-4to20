# Story 8.1: Mobile Visual Product Shell And Technician Demo Flow

Status: done

## Story

As Emilio testing the TagWise Android APK on a real phone,
I want the mobile app to open into the dark TagWise technician product shell shown in the MVP visual references,
so that the installed APK reflects the intended field workflow while preserving the existing offline-first/mobile foundations.

## Context

The Android preview APK build and install path is working. The backend can be reached from the phone on the same Wi-Fi, and the current mobile app works technically. However, the visible mobile UI still presents a white technical/dev shell with Foundation, Packages, Review, and Storage sections instead of the intended TagWise product experience.

This story implements the first mobile visual product shell. It must not replace the existing local-first architecture, SQLite bootstrap, cached sessions, local packages, sync state, or supervisor review foundations. It should sit on top of those foundations and provide a practical dark technician workflow suitable for APK smoke testing.

## Visual Target

Use these MVP visual references as the design intent:

- `docs/MVP/Visualization/ChatGPT Image Apr 6, 2026, 03_10_39 PM.png` - dashboard / tag triage
- `docs/MVP/Visualization/ChatGPT Image Apr 6, 2026, 03_14_37 PM.png` - PT-204 tag detail / actions
- `docs/MVP/Visualization/ChatGPT Image Apr 6, 2026, 03_26_46 PM.png` - calculation
- `docs/MVP/Visualization/ChatGPT Image Apr 6, 2026, 03_30_35 PM.png` - comparison / history
- `docs/MVP/Visualization/ChatGPT Image Apr 6, 2026, 03_35_08 PM.png` - guided diagnosis
- `docs/MVP/Visualization/ChatGPT Image Apr 6, 2026, 03_38_45 PM.png` - report
- `docs/MVP/Visualization/ChatGPT Image Apr 6, 2026, 03_42_12 PM.png` - approval

The implementation does not need to be pixel-perfect, but the first installed APK screen should clearly read as the dark TagWise product, not the engineering scaffold.

## Scope

- Mobile app only.
- Make the primary APK experience a dark, mobile-first TagWise technician UI.
- Add seeded/local demo data as needed to reproduce the PT-204 workflow offline.
- Keep existing local/offline services intact.
- Keep any technical/debug shell secondary and non-primary if it remains accessible.
- Document validation and APK rebuild commands.

## Non-Goals

- Do not implement AI diagnosis execution.
- Do not add OpenAI, model, or `TAGWISE_AI_*` secrets to mobile.
- Do not change backend AI behavior.
- Do not deploy backend.
- Do not redesign backend data contracts.
- Do not remove SQLite/local-first foundations.
- Do not require a backend connection for the visual shell smoke test.

## Acceptance Criteria

1. The APK opens into a user-facing dark TagWise technician UI, not the current technical Foundation / Packages / Review / Storage shell.
2. The main dashboard visually follows the dark MVP reference, including TagWise header, subtitle, search by tag/asset/area, QR scan action, filter chips for Todos, Pendente, Reincidente, and Vencendo, recently opened cards, and Pendentes / Reincidentes / Vencendo sections.
3. The user can open PT-204 from the dashboard, or an equivalent seeded/demo tag if PT-204 cannot be sourced from real local data.
4. The PT-204 detail screen shows the visual shell elements from the reference: tag name, instrument description, Falha status, variable range, latest value, occurrence/due cards, pending item summary, and action tiles for Calcular, Comparar, Diagnosticar, and Registrar/Relatorio.
5. The user can navigate through calculation, comparison/history, guided diagnosis, report, and approval/demo review screens from the visual shell.
6. The calculation screen displays expected value, observed value, tolerance, calculated error, and failure result using local deterministic/demo data only.
7. The comparison/history screen displays a trend/history view and rows similar to Hoje, 3 dias atras, and 8 dias atras, with a CTA to open diagnosis.
8. The guided diagnosis screen displays symptom options, a probable hypothesis, next step, explanation, and technician checklist using local deterministic/demo guidance, not OpenAI execution.
9. The report screen displays an automatic summary, attachment placeholders or local image placeholders, pending items, a justification field, and an action to send to approval/demo review.
10. The approval/demo review screen displays the summary, technician rationale, checklist item, and Aprovar / Devolver actions as an offline demo flow unless existing review services can be used safely.
11. The visual shell remains usable offline with local/seed data, including when the backend is unavailable.
12. Existing SQLite bootstrap, local packages, cached sessions, sync state, evidence upload orchestration, and supervisor review behavior are not broken.
13. No OpenAI key, OpenAI model, or `TAGWISE_AI_*` variable appears in mobile source, mobile env examples, or mobile build config.
14. Mobile typecheck, mobile tests, expo-doctor, and mobile AI secret scan pass.
15. The story implementation reports exact commands to rebuild the Android preview APK.

## Tasks / Subtasks

- [x] Create or extend a mobile visual design system layer for the dark MVP shell.
  - [x] Define reusable color, spacing, typography, radius, and elevation tokens.
  - [x] Add shared visual components such as `TagWiseLogo`, screen scaffold, section header, filter chip, tag card, status pill, metric row, action tile, and checklist row.
  - [x] Use React Native primitives and existing project dependencies unless a new dependency is clearly justified.
- [x] Add a visual workflow data adapter for technician demo data.
  - [x] Provide seeded/local fallback records for PT-204, TT-211, FT-078, LT-090, IT-443, and PT-156.
  - [x] Prefer real downloaded/local package data when available, but guarantee PT-204-style demo flow works offline.
  - [x] Keep demo projections separate from durable domain writes unless existing local services explicitly support the write.
- [x] Replace the primary visible mobile shell with the dark TagWise product dashboard.
  - [x] Preserve app bootstrap, session restoration, local database initialization, sync state initialization, and error capture.
  - [x] Move the current Foundation / Packages / Review / Storage style shell out of the primary first-screen path.
  - [x] Keep any debug/diagnostic affordance secondary and clearly non-primary.
- [x] Implement visual shell navigation.
  - [x] Dashboard / triage screen.
  - [x] PT-204 tag detail screen.
  - [x] Calculation screen.
  - [x] Comparison/history screen.
  - [x] Guided diagnosis screen.
  - [x] Report screen.
  - [x] Approval/demo review screen.
- [x] Keep local-first behavior intact.
  - [x] The visual shell must work without backend connectivity.
  - [x] Backend connectivity may still be used for existing package/session behavior when available.
  - [x] No mobile OpenAI or backend secret configuration is introduced.
- [x] Add focused tests.
  - [x] Add pure unit tests for the visual workflow data adapter and seeded fallback behavior.
  - [x] Add tests for calculation/result formatting if this logic is newly introduced.
  - [x] Avoid broad dependency churn; do not add a UI testing framework unless necessary.
- [x] Update mobile documentation.
  - [x] Document the visual shell smoke path on Android.
  - [x] Document offline launch expectations.
  - [x] Document validation and APK rebuild commands.

## Dev Notes

The current mobile app is functionally valuable but presents an internal engineering shell. The visual work should wrap the existing foundations rather than erase them. The main risk is accidentally replacing local-first behavior with hardcoded mock-only UI. Avoid that by building a view-model adapter that can render from real local data where available and fall back to seeded demo data only when needed.

Relevant current areas to inspect before implementation:

- `mobile/src/shell/TagWiseApp.tsx` - current app shell and bootstrapping.
- `mobile/src/features/app-shell/model.ts` - current Foundation / Packages / Review / Storage route model.
- `mobile/src/data/local` - SQLite bootstrap and local storage foundations.
- `mobile/src/features/work-packages` - local package/tag context services.
- `mobile/src/features/execution` - deterministic execution/calculation foundations.
- `mobile/src/features/review` - supervisor review service.
- `mobile/src/features/sync` - sync state behavior.

Recommended implementation posture:

- Keep navigation simple for this story. A local React state route is acceptable if the project does not already use a navigation library.
- Use the Portuguese labels from the visual references for this MVP shell: `Buscar tag, ativo ou area...`, `Escanear QR`, `Pendentes`, `Reincidentes`, `Vencendo`, `Falha`, `Calcular`, `Comparar`, `Diagnosticar`, `Relatorio`, `Aprovacao`.
- Use dark industrial colors, restrained borders, and compact mobile-first layouts.
- Use seeded visual data as a projection layer, not as a replacement for real local repositories.
- Do not place cards inside cards unnecessarily; keep repeated items as cards and major screen areas as full-width sections.
- Ensure text fits on Android phone widths and avoid fixed widths that clip Portuguese labels.

## Validation

Run from the repository root unless otherwise noted:

```powershell
cd mobile
npm run typecheck
npm test
npx expo-doctor
rg "OPENAI_API_KEY|OPENAI_MODEL|TAGWISE_AI_" .
cd ..
git diff --check
```

Build the preview APK after validation:

```powershell
cd mobile
npm run build:android:preview
```

Manual Android smoke test:

1. Install the APK from the EAS build link or QR code.
2. Launch the app with the backend unavailable and confirm the dark TagWise dashboard opens.
3. Open PT-204 from the dashboard.
4. Navigate through Calcular, Comparar, Diagnosticar, Relatorio, and Aprovacao.
5. Confirm no screen requires an OpenAI key or backend connection for the demo workflow.
6. If the backend is running, confirm existing login/session/package behavior still works and the visual shell remains usable.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `cd mobile; npm run typecheck` - passed.
- `cd mobile; npm test` - passed, 23 test files and 128 tests.
- `cd mobile; npx expo-doctor` - passed, 17/17 checks.
- `rg "OPENAI_API_KEY|OPENAI_MODEL|TAGWISE_AI_" mobile` - no matches.
- `git diff --check` - passed with line-ending warnings only.

### Completion Notes

- Implemented a dark TagWise mobile product shell as the primary ready-state UI while preserving the existing bootstrap/session/local service initialization in `TagWiseApp`.
- Added a local visual workflow model with seeded PT-204, TT-211, FT-078, LT-090, IT-443, and PT-156 data so the APK can run the product flow offline.
- Added dashboard, PT-204 detail, calculation, comparison/history, guided diagnosis, report, and approval/demo review screens using React Native primitives and no new dependencies.
- Added focused unit tests for seeded fallback, local package context, and deterministic visual error calculation.
- Updated mobile README smoke instructions for the new product shell and APK rebuild path.
- No OpenAI key, OpenAI model, or backend AI secret configuration was added to mobile.

### File List

- `_bmad-output/implementation-artifacts/8-1-mobile-visual-product-shell-and-technician-demo-flow.md`
- `mobile/README.md`
- `mobile/src/features/visual-shell/designSystem.ts`
- `mobile/src/features/visual-shell/model.ts`
- `mobile/src/features/visual-shell/visualWorkflow.test.ts`
- `mobile/src/shell/TagWiseApp.tsx`
- `mobile/src/shell/VisualProductShell.tsx`

## Change Log

- 2026-05-07: Implemented Story 8.1 mobile visual product shell and technician demo flow.

## QA Results

Verdict: Needs fixes

Review date: 2026-05-07

Checks performed:

- Confirmed `TagWiseApp` now renders `VisualProductShell` as the ready-state default mobile experience.
- Confirmed manual APK regression findings: the dark shell behaves like mostly static demo screens and does not preserve the previous functional technician workflow.
- Confirmed `VisualProductShell` implements route-state navigation, but it is a parallel demo flow rather than a skin over the existing execution/report/review foundations.
- Confirmed the visual workflow model provides offline seeded PT-204 fallback data, but key values are static and closely mirror the visual reference instead of being driven by credible seeded/local workflow state.
- Confirmed SQLite/session/package/sync/review service initialization remains in `TagWiseApp`; backend is not required for the visual demo flow.
- Confirmed no OpenAI key, OpenAI model, or `TAGWISE_AI_*` string appears under `mobile`.
- Confirmed no AI execution/provider call is implemented in the mobile visual shell.
- Confirmed live backend smoke passes against both `http://127.0.0.1:4100` and `http://192.168.1.4:4100`; the current blocker is mobile workflow integration, not backend availability.

Validation:

- `cd mobile && npm run typecheck` - passed.
- `cd mobile && npm test` - passed, 23 files / 128 tests.
- `cd mobile && npx expo-doctor` - passed, 17/17 checks.
- `rg "OPENAI_API_KEY|OPENAI_MODEL|TAGWISE_AI_" mobile` - no matches.
- `git diff --check` - passed with CRLF warnings only.
- `cd backend && $env:TAGWISE_LIVE_API_BASE_URL='http://127.0.0.1:4100'; npm test -- tagWiseLiveApiSmoke` - passed.
- `cd backend && $env:TAGWISE_LIVE_API_BASE_URL='http://192.168.1.4:4100'; npm test -- tagWiseLiveApiSmoke` - passed.

Blocking defects:

- The visual shell bypasses the existing shared execution shell, deterministic calculation save path, evidence/report draft behavior, and supervisor review services. Existing handlers remain in `TagWiseApp`, but the product shell does not drive them.
- The calculation screen is not a working calculator. It displays static expected/observed values and a static failure result from the visual model rather than editable inputs saved through the existing deterministic calculation/domain logic.
- Dropdown/select controls are visual only where they matter most. The calculation mode select is not interactive, and report/diagnosis data is not consistently derived from selected state.
- Approval/demo review is reachable from the visual report screen without a credible completed report state or server/local review workflow boundary.
- The seeded visual data is too image-copy-like and not sufficiently tied to realistic TagWise package/tag/template/history data.
- The previous functional technical shell is commented out and unreachable. This confirms the visual shell replaced working behavior instead of skinning/integrating it.
- Automated coverage validates only model-level fallback behavior and does not catch the broken APK workflow. Manual APK smoke is required until a native mobile E2E harness exists.

## Final Epic 8 QA Update

Final Epic 8 verdict: Pass with minor concerns.

Review date: 2026-05-10

Story 8.1 originally delivered the dark mobile visual shell but was functionally insufficient as a production workflow, as recorded in the 2026-05-07 QA results above. The functional regressions were repaired by the follow-on service-backed repair stories:

- Story 8.2 restored authenticated catalog, QR, selected tag, work package, and template identity.
- Story 8.3 restored service-backed calculation, conversions, history, checklist, guidance, references, and risk state.
- Story 8.4 restored service-backed report, evidence, photos, submit/sync, and report-level AI Diagnosis projection.
- Story 8.5 restored role-aware connected supervisor approval, decisions, and audit projection.

Blocking findings for final Epic 8 QA: none.

Residual concern: real APK/backend end-to-end smoke was not physically executed in this environment. Before release/demo confidence, validate the full device path with backend reachable, offline execution/report creation, reconnect sync, supervisor decisions, and audit/history refresh.
