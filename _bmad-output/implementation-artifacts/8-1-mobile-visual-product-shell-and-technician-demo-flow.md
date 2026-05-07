# Story 8.1: Mobile Visual Product Shell And Technician Demo Flow

Status: ready-for-dev

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

- [ ] Create or extend a mobile visual design system layer for the dark MVP shell.
  - [ ] Define reusable color, spacing, typography, radius, and elevation tokens.
  - [ ] Add shared visual components such as `TagWiseLogo`, screen scaffold, section header, filter chip, tag card, status pill, metric row, action tile, and checklist row.
  - [ ] Use React Native primitives and existing project dependencies unless a new dependency is clearly justified.
- [ ] Add a visual workflow data adapter for technician demo data.
  - [ ] Provide seeded/local fallback records for PT-204, TT-211, FT-078, LT-090, IT-443, and PT-156.
  - [ ] Prefer real downloaded/local package data when available, but guarantee PT-204-style demo flow works offline.
  - [ ] Keep demo projections separate from durable domain writes unless existing local services explicitly support the write.
- [ ] Replace the primary visible mobile shell with the dark TagWise product dashboard.
  - [ ] Preserve app bootstrap, session restoration, local database initialization, sync state initialization, and error capture.
  - [ ] Move the current Foundation / Packages / Review / Storage style shell out of the primary first-screen path.
  - [ ] Keep any debug/diagnostic affordance secondary and clearly non-primary.
- [ ] Implement visual shell navigation.
  - [ ] Dashboard / triage screen.
  - [ ] PT-204 tag detail screen.
  - [ ] Calculation screen.
  - [ ] Comparison/history screen.
  - [ ] Guided diagnosis screen.
  - [ ] Report screen.
  - [ ] Approval/demo review screen.
- [ ] Keep local-first behavior intact.
  - [ ] The visual shell must work without backend connectivity.
  - [ ] Backend connectivity may still be used for existing package/session behavior when available.
  - [ ] No mobile OpenAI or backend secret configuration is introduced.
- [ ] Add focused tests.
  - [ ] Add pure unit tests for the visual workflow data adapter and seeded fallback behavior.
  - [ ] Add tests for calculation/result formatting if this logic is newly introduced.
  - [ ] Avoid broad dependency churn; do not add a UI testing framework unless necessary.
- [ ] Update mobile documentation.
  - [ ] Document the visual shell smoke path on Android.
  - [ ] Document offline launch expectations.
  - [ ] Document validation and APK rebuild commands.

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

TBD

### Debug Log References

TBD

### Completion Notes

TBD

### File List

TBD

## QA Results

TBD
