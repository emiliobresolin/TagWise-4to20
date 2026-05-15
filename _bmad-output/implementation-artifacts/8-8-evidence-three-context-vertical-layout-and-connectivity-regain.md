# Story 8.8 — Evidence three-context model, vertical-layout pass, connectivity regain, PT-BR sweep, data realism

Status: review

## Metadata

- Story key: 8-8-evidence-three-context-vertical-layout-and-connectivity-regain
- Epic: Epic 8 live phone repair continuation
- Created: 2026-05-14
- Validation gate: **manual phone smoke using the user's 4-terminal workflow.** Automated gates (backend typecheck + tests, mobile typecheck + tests) green before manual phone test.
- Source: QA defect discovery report 2026-05-14 (`_bmad-output/planning-artifacts/qa-defect-discovery-2026-05-14.md`), defects D-02 through D-07; user's manual Android findings.

## User Story

As a field technician using TagWise on a real Android phone, after Story 8.7 closed the surgical UX/wiring bugs, I want
- per-photo execution-step context (`Instrumento`, `Ponto de loop 50%`, `Checklist`) and my free-text observation to follow the report through to the supervisor;
- a photo entry point on the tag detail screen for nameplate / installation photos that are not tied to any test;
- the important info blocks on instrument detail, report, supervisor queue, and supervisor review to read as `TÍTULO` / `valor` instead of `Title - Value`;
- queued reports to retry automatically when my phone comes back online without me having to tap "Retry";
- the visual-shell sample numerics to stop leaking into authenticated screens;
- all visible labels and statuses in PT-BR;
- the seeded history to look like real prior calibrations so I can verify the comparison screen against realistic data,
so that the next manual Android phone test exercises the full intended technician → supervisor flow without surfacing English tokens, dead-end pending items, or supervisor-side context loss.

This story explicitly defers D-01 (AI diagnosis end-to-end) to a follow-up. AI remains end-to-end disconnected but visible as `Indisponivel` (unchanged from Story 8.7).

## Scope

In scope:

1. **D-02 + D-04 — `contextNote` and `technicianNote` round-trip.** Extend `SharedExecutionPhotoAttachment` and `StoredExecutionPhotoAttachmentPayload` with `technicianNote`; thread both fields through mobile capture, SQLite persistence, the evidence-upload orchestrator's `loadPhotoSubmissionAttachments`, the mobile-side `ReportSubmissionRequest.photoAttachments` shape, the backend `ReportSubmissionPhotoAttachment` DTO, the backend supervisor `SupervisorReviewPhotoAttachment` DTO, the mobile review model mirror, the mobile review projection (`serviceBackedReview.ts`), and the supervisor review render in `VisualProductShell.tsx`. **No backend schema migration:** report submissions persist via `payloadJson` (the full request DTO), so both fields flow end-to-end via existing storage. Add a cross-boundary vitest in `evidenceUploadOrchestrator.test.ts` that asserts the round-trip with non-null values.
2. **D-03 — instrument-level photos on the tag detail screen.** Widen `SharedExecutionStepKind` to include `'instrument'`. Add an `executionStepIdOverride` option to `attachPhotoEvidence`. Render a `Foto do instrumento` action panel on `TagDetailScreen` with `Tirar foto` / `Da galeria` buttons that attach with `executionStepIdOverride: 'instrument'` and `contextNote: 'Instrumento'`. Gate the panel behind template selection (the photo still rides on the execution shell; a future story can lift this gate by modelling instrument photos on the tag context).
3. **D-04 — per-photo technician comment.** Add `technicianNote` field (see D-02). Add a new shell-service method `updatePhotoTechnicianNote`. Surface an inline `Editar observacao` Pressable on each report photo card so the technician can add or update the comment in place. Display the comment on both technician report and supervisor review.
4. **D-05 — vertical title-over-value layout.** Add a `variant: 'horizontal' | 'vertical'` prop to both `SummaryLine` and `MetricLine` (default `'horizontal'` to keep all existing call sites unchanged). Apply `variant="vertical"` at the five priority screens the QA report cited: instrument detail metrics (`MetricLine` × 6), technician report header (`SummaryLine` × 5), supervisor review queue card (`SummaryLine` × 4), supervisor review detail header (`SummaryLine` × 2 + dynamic `summaryRows.map(...)`). Add matching `metricLineVertical` / `metricLabelVertical` / `metricValueVertical` / `summaryLineVertical` / `summaryLabelVertical` / `summaryValueVertical` styles.
5. **D-06 — connectivity-regain auto-retry.** Wire the orphaned `detectConnectivityRegain` helper into production. Subscribe to `AppState` `'change'` events in `TagWiseApp.tsx`. When the app comes back to foreground, call `detectConnectivityRegain({ currentSession, restoreSession, retryEligibleReports })`; on `reconnected`, update the visible session and display a feedback toast summarising what was retried. Bound the retry rate to one attempt per 30 s.
6. **D-07 — visual-shell sample-value cleanup.** Gate the demo calculation/history/diagnosis/report literals in `visual-shell/model.ts` behind `!authenticated && demoEnabled`. Authenticated builds emit neutral placeholders that the authenticated rendering paths never read.
7. **PT-BR sweep.** Add `'In Progress'` / `'Ready to Submit'` to `reviewLifecycleLabel`. Add `translateEvidencePresenceState` and `translateEvidencePresenceMessage` helpers in `serviceBackedReview.ts` so the supervisor never sees the raw `no-photo-evidence` / `all-photo-evidence-finalized` / `pending-photo-evidence` tokens or their English sentences. Add new helper exports `formatPhotoExecutionStepLabel` and `formatPhotoContextSubtitle` with PT-BR copy and corresponding unit tests.
8. **Data realism.** Enrich the five seeded history summaries in `backend/src/modules/work-packages/seedData.ts` with measured values, decisions, and date references so the technician can verify the comparison screen against realistic prior calibration data.

Out of scope (defer to follow-up stories):

- **D-01 — AI diagnosis end-to-end** (worker job, enqueue on submit, manual request endpoint, supervisor DTO, mobile threading). Largest defect by integration surface; isolated from the rest of the phone test.
- Backend `report_photo_attachments` SQL migration — not required because `contextNote` and `technicianNote` ride through the existing `payloadJson` blob.
- Renderer tests (`@testing-library/react-native`) — deferred per Story 8.7 guardrail.
- Maestro device E2E (Story 8.7-T) — still deferred.
- Heavier seed enrichment (prior `Report` records, prior approval decisions). The current model only carries `historySummary` per tag; adding richer prior reports requires a new entity. Deferred.
- Visual-shell sample-value cleanup that touches authenticated render paths (none currently do — the gating in D-07 is preemptive, not corrective).

## Non-Goals

- Do not change the Story 8.7 submit rule (`severity === 'submit-block'` only blocks; minimum-evidence still blocks).
- Do not bypass `SharedExecutionShellService`, `SupervisorReviewService`, `EvidenceUploadOrchestrator`, or `SyncStateService`.
- Do not move OpenAI/API keys or provider calls into mobile.
- Do not fake AI output.
- Do not refactor `VisualProductShell.tsx` or `TagWiseApp.tsx`; in-place additive changes only.
- Do not introduce new dev dependencies (no `@testing-library/react-native`, no NetInfo).

## Acceptance Criteria

### AC 1 — `contextNote` + `technicianNote` round-trip (D-02 / D-04)

- `SharedExecutionPhotoAttachment.technicianNote: string | null` is non-optional on the in-memory shape and round-trips through the SQLite payload parser. The shape is backwards-compatible: pre-Story-8.8 rows missing the field parse to `null`.
- `attachPhotoEvidence` accepts `options.technicianNote` and `options.executionStepIdOverride` in addition to the existing `options.contextNote`. Empty / whitespace strings normalize to `null`.
- A new shell-service method `updatePhotoTechnicianNote(session, shell, evidenceId, note)` mutates the persisted note in place; locked reports cannot be mutated.
- The orchestrator's `loadPhotoSubmissionAttachments` includes `contextNote`, `executionStepId`, and `technicianNote` in the submission DTO entries.
- `ReportSubmissionPhotoAttachment` (both mobile and backend definitions, plus the `EvidenceUploadApiClient` mirror) carries `contextNote`, `executionStepId`, `technicianNote` as optional fields.
- The backend submission service is unchanged — it accepts the full request payload as JSON. The supervisor `toReportDetail` projection passes the new fields through `payload.photoAttachments` automatically.
- Mobile `SupervisorReviewPhotoAttachment` mirrors the new fields. `VisualReviewPhotoAttachmentProjection` exposes `contextSubtitle` and `technicianNoteLabel`.
- `evidenceUploadOrchestrator.test.ts` includes one cross-boundary case proving the round-trip with non-null values.

### AC 2 — Instrument-level photo entry (D-03)

- `SharedExecutionStepKind` includes `'instrument'`. `isExecutionStepKind` accepts the new value. `EvidenceUploadMetadataRequest.executionStepId` widens to include it.
- `TagDetailScreen` renders a `Foto do instrumento` action panel above the page footer with `Tirar foto` / `Da galeria` buttons.
- When a template is selected, the buttons attach a photo via `onAttachReportPhoto(source, 'Instrumento', { executionStepIdOverride: 'instrument' })`.
- When no template is selected, the buttons are disabled and the panel displays a clear PT-BR hint.

### AC 3 — Per-photo comment UI (D-04)

- The report screen's photo card renders the step label (Instrumento / Calculo / Checklist / Comparativo / Relatorio / Contexto da tag), the sub-step `contextNote` if present, and the `technicianNote` if present (or a PT-BR hint to add one).
- `Editar observacao` Pressable opens an inline `TextInput` with a `Salvar observacao` / `Cancelar` pair. Saving calls `onUpdatePhotoTechnicianNote`.
- The supervisor review photo card renders the same step label, `contextNote`, and `technicianNoteLabel` (or `Sem observacao do tecnico` when empty).

### AC 4 — Vertical layout variant (D-05)

- `SummaryLine` and `MetricLine` accept `variant: 'horizontal' | 'vertical'` with default `'horizontal'`.
- Vertical variant renders the label uppercase with letter-spacing above the value, full-width, no truncation risk.
- Applied at: instrument detail metric panel (6 rows), technician report header (5 rows), supervisor review queue card (4 rows per item), supervisor review detail header (2 fixed + dynamic `summaryRows`).
- Existing horizontal-variant callers (chip pairs, supervisor access status, short status rows) are unchanged.

### AC 5 — Connectivity regain auto-retry (D-06)

- `TagWiseApp.tsx` registers an `AppState` `'change'` listener once the local runtime status becomes `'ready'`.
- On the listener firing with `'active'`, the app calls `detectConnectivityRegain` with the current cached session, the session controller's `restoreSession`, and the sync state service's `retryEligibleReports`.
- A bounded-rate guard prevents more than one regain attempt per 30 seconds.
- On `reconnected`, the visible session updates to the new connected session and a PT-BR feedback message reports how many queued items were retried.
- Subscription cleanup runs on status change / unmount.

### AC 6 — Visual-shell sample-value cleanup (D-07)

- `buildTechnicianVisualWorkflow` computes the demo calculation/history/diagnosis/report literals only when `!authenticated && demoEnabled`.
- Authenticated builds emit neutral structures (zeros for calculation, empty arrays for history and checklist, empty strings for report fields).
- Authenticated rendering paths (which already consume service-backed projections) are unaffected.

### AC 7 — PT-BR sweep

- `reviewLifecycleLabel` maps `'In Progress'` → `Em andamento`, `'Ready to Submit'` → `Pronto para enviar` in addition to the existing server-side mappings.
- `translateEvidencePresenceState` maps the three backend evidence presence enum values into PT-BR.
- `translateEvidencePresenceMessage` replaces the backend's English `evidenceStatus.message` sentence with PT-BR copy that preserves the pending count.
- New helpers `formatPhotoExecutionStepLabel` and `formatPhotoContextSubtitle` produce PT-BR step labels and combined subtitles.
- Unit tests cover both new helpers.

### AC 8 — Seed data realism

- The five existing `historySummary` records in `backend/src/modules/work-packages/seedData.ts` now include explicit measured values, deviations, percent-of-span context, supervisor decision references, and concrete next-action hints in PT-BR.
- Trend hints reference observed numerical patterns rather than generic prose.

## Tasks / Subtasks

Each task track maps to one AC. Execute in order.

- [x] T1. Widen `SharedExecutionPhotoAttachment` and `StoredExecutionPhotoAttachmentPayload` to include `technicianNote: string | null`. Widen `SharedExecutionStepKind` to include `'instrument'`. (AC 1, AC 2)
  - [x] Update `mobile/src/features/execution/model.ts`.
  - [x] Update `isExecutionStepKind` in `sharedExecutionShellService.ts`.
- [x] T2. Extend `attachPhotoEvidence` to accept `options.technicianNote` and `options.executionStepIdOverride`. Persist both in the SQLite payload. Update the `buildPhotoAttachments` mapper to surface `technicianNote`. (AC 1)
- [x] T3. Add `updatePhotoTechnicianNote` method to the shell service. (AC 1, AC 3)
- [x] T4. Update the orchestrator's `parsePhotoAttachmentPayload` and `loadPhotoSubmissionAttachments` to round-trip both fields. (AC 1)
- [x] T5. Widen `EvidenceUploadApiClient.ReportSubmissionRequest.photoAttachments` and backend `ReportSubmissionPhotoAttachment` to carry `contextNote`, `executionStepId`, `technicianNote`. Mirror in mobile `SupervisorReviewPhotoAttachment`. (AC 1)
- [x] T6. Cross-boundary vitest: assert that non-null `contextNote` / `executionStepId` / `technicianNote` flow from local SQLite payload through `syncSubmittedReportEvidence` into the orchestrator's submission DTO. (AC 1)
- [x] T7. Extend `VisualReviewPhotoAttachmentProjection` with `contextSubtitle` and `technicianNoteLabel`. Pass them through `serviceBackedReview.ts`. Update the supervisor review photo card render. (AC 1, AC 3)
- [x] T8. Add `formatPhotoExecutionStepLabel` and `formatPhotoContextSubtitle` helpers in `serviceBackedReport.ts`. Add unit tests. (AC 3, AC 7)
- [x] T9. Add `ReportPhotoCard` inline component to `VisualProductShell.tsx` with inline edit affordance. Replace the existing technician-report photo card. (AC 3)
- [x] T10. Add instrument-level photo panel to `TagDetailScreen`. Wire `onAttachInstrumentPhoto` prop through to the shell's `onAttachReportPhoto` call site with `'Instrumento'` contextNote and `executionStepIdOverride: 'instrument'`. (AC 2)
- [x] T11. Add `variant` prop to `SummaryLine` and `MetricLine`. Apply `variant="vertical"` at the five priority screens. Add corresponding vertical styles. (AC 4)
- [x] T12. Add `AppState` connectivity-regain effect in `TagWiseApp.tsx`. Bound to one attempt per 30 s. (AC 5)
- [x] T13. Gate visual-shell demo literals behind `!authenticated && demoEnabled`. (AC 6)
- [x] T14. Extend `reviewLifecycleLabel` with draft-state mappings. Add `translateEvidencePresenceState` and `translateEvidencePresenceMessage` in `serviceBackedReview.ts`. (AC 7)
- [x] T15. Enrich `historySummary` records with realistic measured values and decision context. (AC 8)
- [x] T16. Validation
  - [x] `cd backend && npx tsc --noEmit` — silent (PASS).
  - [x] `cd backend && npm test` — 92 pass, 1 skipped.
  - [x] `cd mobile && npx tsc --noEmit` — silent (PASS).
  - [x] `cd mobile && npm test` — 186 pass (was 180 baseline; +6).
  - [ ] Manual phone smoke per the checklist below (user runs on his Android phone after rebuilding the APK).

## Dev Notes

### Backend persistence shape (no migration needed)

`report_submissions` table persists the full `ReportSubmissionRequest` as JSON in `payload_json`. The supervisor read path (`supervisorReviewService.toReportDetail`) projects `photoAttachments` by reading `payload.photoAttachments` directly from the stored blob. Adding optional fields to the DTO is therefore a non-migration change: pre-8.8 rows simply do not carry the new fields, and the projection falls back to `null`/`undefined` for those rows.

### Step-kind widening

Adding `'instrument'` to `SharedExecutionStepKind` ripples through:
- `SharedExecutionTemplateStepContract.kind` — no template uses `'instrument'` in seed data, so this is forward-compatible only.
- `SharedExecutionStepView.kind` — same.
- `StoredExecutionEvidenceRecord.executionStepId` and `StoredExecutionPhotoAttachmentPayload.executionStepId` — backwards-compatible.
- `EvidenceUploadMetadataRequest.executionStepId` (mobile API client) — widened in place.
- The supervisor backend type `ReportSubmissionPhotoExecutionStepId` mirrors the union.

### Connectivity-regain wiring rationale

The QA report flagged NetInfo as the preferred mechanism but noted that AppState/session-restore is acceptable. NetInfo is not currently a dependency and pulling it in would require an Expo config change + native rebuild. AppState is part of `react-native` core and triggers on every foreground transition; combined with the 30-second rate limit it covers the realistic "phone went offline at the site, technician comes back to a connected area" path without adding a dependency.

### Why D-01 (AI diagnosis) was deferred

QA estimated 2–3 hours for AI end-to-end (worker job + DB migration + enqueue path + manual endpoint + supervisor DTO + mobile threading + tests). That's roughly equal to all of Story 8.8 combined and intersects four backend modules. The user explicitly authorized a phone-test-ready slice rather than a full hardening pass. AI remains visible as `Indisponivel` per the existing buildVisualAiDiagnosisProjection default; nothing in this story regresses that surface.

## Validation

### Automated (already run)

```powershell
cd backend
npx tsc --noEmit     # PASS (silent)
npm test -- --run    # 92 pass, 1 skipped (env-gated live API smoke)

cd ../mobile
npx tsc --noEmit     # PASS (silent)
npm test -- --run    # 186 pass (was 180 baseline; +6 new)
```

### Manual Phone Smoke Checklist

Run on a real Android phone after rebuilding the APK (4-terminal workflow, `TAGWISE_AI_PROVIDER='mock'` applied).

| # | Action | Expected |
|---|---|---|
| 1 | Sign in as `tech@tagwise.local` / `TagWise123!`. | Dashboard renders. All labels and statuses in PT-BR. |
| 2 | Open an assigned package and a tag (PT-101). | Tag detail screen shows metric panel as **vertical** title-over-value blocks: Faixa / Tolerancia / Ultimo valor / Area / Ativo / Vencimento. No "Title - Value" rows on this screen. |
| 3 | Before selecting a template, observe the `Foto do instrumento` panel near the bottom. | Panel shows "Selecione um teste acima para liberar a foto do instrumento." The Tirar foto / Da galeria buttons are visually disabled. |
| 4 | Select a template (e.g. Pressure transmitter as-found). | Foto do instrumento panel updates to "Anexe foto da placa, fiacao, instalacao ou condicao fisica do instrumento." Buttons become active. |
| 5 | Tap `Tirar foto` on the Foto do instrumento panel. | Camera opens. After capture, return to the detail screen. (Verification of the attachment happens in step 13.) |
| 6 | Open the Calculator (bottom Calcular tile) → enter values → Calcular → switch to Loop mode. | Story 8.7 behavior preserved unchanged. |
| 7 | Open the loop test screen on the selected tag → run a 5-point loop → tap `Foto` on the 50% point. | Camera opens. After capture, photo appears in the thumbnail list with "Ponto de loop 50%" context. |
| 8 | Open the report screen. | Report header shows vertical title-over-value blocks: Tag / Template / Ciclo / Estado / Sync. No "Title - Value" rows on this screen. |
| 9 | Scroll to the photo section on the report. | Each photo card shows its **step label** (Instrumento / Calculo / Checklist / Ponto de loop 50%) and a placeholder "Sem observacao do tecnico. Toque em 'Editar observacao' para adicionar." |
| 10 | Tap `Editar observacao` on the instrument-level photo. | Inline TextInput appears with `Salvar observacao` / `Cancelar` buttons. |
| 11 | Type "Cabos danificados na flange" → Salvar observacao. | Text appears as "Observacao: Cabos danificados na flange" on the card. |
| 12 | Submit the report (`Enviar para fila local`). | Submission succeeds. Sync section shows "Em fila local" or similar PT-BR copy. |
| 13 | Toggle airplane mode on briefly → off → wait for the next foreground (open the app fresh from the recents tray if needed). | App auto-detects regain. Feedback toast shows "Conexao restaurada. Sincronizados X de Y itens da fila local." (or "Nada na fila local para sincronizar." if nothing was queued). |
| 14 | Sign out → sign in as `supervisor@tagwise.local` / `TagWise123!`. | Supervisor dashboard renders. |
| 15 | Open the supervisor review queue. | Queue cards render with vertical title-over-value blocks: Ciclo / Pacote / Riscos / Evidencias pendentes. Long `Pacote` IDs no longer wrap mid-row. |
| 16 | Open the submitted report. | Detail header renders vertical title-over-value. |
| 17 | Scroll to the Fotos section. | Each photo card shows: **step label + contextNote** (e.g. "Instrumento", "Ponto de loop 50%", "Checklist"); ID; Sync state; Finalizada timestamp; "Observacao do tecnico: <text>" or "Sem observacao do tecnico." |
| 18 | Verify the History/comparison screen for any tag. | Prior history summary shows realistic measured values, deviations, and supervisor decisions (e.g. for PT-101: "Ponto 75%: medido 7,62 bar vs esperado 7,50 bar (+0,12 bar, dentro de +/-0,25% span)"). |
| 19 | Scan every screen for English tokens. | No `Submitted - Pending ...`, no `Returned by ...`, no `pass-with-note`, no `no-photo-evidence`, no `In Progress` raw labels. Every visible label is PT-BR. |

If any step fails, document which step failed and what was observed in the Dev Agent Record below.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (Amelia persona), bmad-agent-dev skill, 2026-05-14.

### Debug Log References

- `cd backend && npx tsc --noEmit` — PASS (silent).
- `cd backend && npm test -- --run` — **92 / 1 skipped** (env-gated live API smoke; unchanged from 8.7 baseline).
- `cd mobile && npx tsc --noEmit` — PASS (silent).
- `cd mobile && npm test -- --run` — **186 / 186 PASS** (180 baseline + 1 D-02/D-04 round-trip test + 2 `formatPhotoExecutionStepLabel` tests + 3 `formatPhotoContextSubtitle` tests).

### Completion Notes

- **No backend SQL migration was required.** `ReportSubmissionRecord` persists the entire `ReportSubmissionRequest` as `payload_json`. Adding optional fields to the DTO flows through both the submission path (`reportSubmissionService.submitForValidation`) and the supervisor projection (`supervisorReviewService.toReportDetail`) with zero schema work. Pre-8.8 rows simply read back with `contextNote` / `technicianNote` undefined, which is handled by the photo subtitle/note formatters.
- **Cross-boundary test for D-02 / D-04.** The new vitest in `evidenceUploadOrchestrator.test.ts` ("round-trips contextNote, executionStepId and technicianNote through the report submission DTO (Story 8.8 D-02 / D-04)") seeds local evidence with non-null values, runs the orchestrator's full `syncSubmittedReportEvidence`, and asserts that the resulting submission DTO carries the three fields end-to-end. This is the contract test the QA report recommended; without it, both sides could pass their isolation tests independently while the wire layer dropped the data (the D-02 defect shape).
- **`SharedExecutionStepKind` widening.** Adding `'instrument'` ripples through one mobile API client literal (`EvidenceUploadMetadataRequest.executionStepId`), one backend type (`ReportSubmissionPhotoExecutionStepId`), and the `isExecutionStepKind` runtime guard. Existing seed templates and execution shells continue to use the original 5 kinds; the new kind is reachable only through the explicit `executionStepIdOverride` option on `attachPhotoEvidence`.
- **Instrument-level photo gating.** The `TagDetailScreen` instrument photo affordance requires a template selection because `attachPhotoEvidence` operates on a `SharedExecutionShell` which only exists once a template is loaded. A future story can lift this gate by modelling instrument photos directly on the tag context (without an execution shell) — the current approach is the smallest safe diff that gets a real entry point on the screen.
- **AppState connectivity regain.** `detectConnectivityRegain` was orphaned (defined and tested but never called in production). The new wiring in `TagWiseApp.tsx` subscribes once per `status` transition and tears down on cleanup. The 30-second rate limit prevents AppState toggles from generating a flood of restore-session calls. NetInfo was not pulled in because it would require an Expo dependency change and a native rebuild; AppState/session-restore is sufficient for the "drop, drive, regain" pattern.
- **Visual-shell sample-value gating (D-07).** No authenticated render path currently reads `model.calculation`/`model.history`/`model.report`/`model.diagnosis` — they're only consumed inside the `session ? <ServiceXScreen /> : <DemoXScreen />` ternary. The cleanup is preemptive: gating the construction so the literals only exist in demo mode prevents a future bug where an authenticated screen accidentally picks them up.
- **PT-BR sweep.** The mappers in `serviceBackedReport.ts` and `serviceBackedReview.ts` are the right boundary — backend models continue to use English tokens and snake-case enum values. The presentation edge translates them. New helpers cover the photo step label and the evidence presence sentence that previously slipped through `translateOperationalMessage` (which only does regex replacements, not full-sentence translation).
- **Seed data enrichment.** The `historySummary` model is a single summary per tag with `summaryText` + `trendHint`. Without introducing a new prior-report entity (deferred), the highest-leverage change is to make the narrative carry the measured values and the supervisor decision context inside that single string. Each of the five summaries now includes specific point/value pairs in PT-BR.

### File List

Modified:

- `mobile/src/features/execution/model.ts` — added `'instrument'` to `SharedExecutionStepKind`; added `technicianNote: string | null` to `SharedExecutionPhotoAttachment`; added `technicianNote?: string | null` to `StoredExecutionPhotoAttachmentPayload`.
- `mobile/src/features/execution/sharedExecutionShellService.ts` — `isExecutionStepKind` accepts `'instrument'`; `attachPhotoEvidence` accepts `options.technicianNote` and `options.executionStepIdOverride`; new method `updatePhotoTechnicianNote`; persisted payload writes and parser handle both new fields; `buildPhotoAttachments` mapper surfaces `technicianNote`.
- `mobile/src/features/sync/evidenceUploadOrchestrator.ts` — `parsePhotoAttachmentPayload` round-trips `technicianNote`; `loadPhotoSubmissionAttachments` includes `contextNote`, `executionStepId`, and `technicianNote` in the submission DTO entries.
- `mobile/src/features/sync/evidenceUploadOrchestrator.test.ts` — added cross-boundary D-02/D-04 round-trip test; updated `buildPhotoAttachment` fixture and `saveLocalEvidence` helper to carry the new fields; updated existing assertion to include the new fields in the submitted DTO; added `SharedExecutionReportLifecycleState` import.
- `mobile/src/features/sync/evidenceUploadApiClient.ts` — widened `EvidenceUploadMetadataRequest.executionStepId` to include `'instrument'`; widened `ReportSubmissionRequest.photoAttachments` entries with optional `contextNote`, `executionStepId`, `technicianNote`.
- `mobile/src/features/sync/syncStateService.test.ts` — added `technicianNote: null` to the fixture.
- `mobile/src/features/sync/syncConnectivityRegain.ts` — unchanged (pure function); now consumed in production via the new TagWiseApp effect.
- `mobile/src/features/review/model.ts` — added optional `contextNote`, `executionStepId`, `technicianNote` to `SupervisorReviewPhotoAttachment`; added `SupervisorReviewPhotoExecutionStepId` union.
- `backend/src/modules/report-submissions/model.ts` — added optional `contextNote`, `executionStepId`, `technicianNote` to `ReportSubmissionPhotoAttachment`; added `ReportSubmissionPhotoExecutionStepId` union.
- `backend/src/modules/work-packages/seedData.ts` — enriched five `historySummary` records with measured values, deviations, supervisor decisions, and PT-BR trend hints.
- `mobile/src/features/visual-shell/serviceBackedReport.ts` — added `formatPhotoExecutionStepLabel` and `formatPhotoContextSubtitle` helpers + exports.
- `mobile/src/features/visual-shell/serviceBackedReport.test.ts` — added 5 new unit tests for the two helpers; added `formatPhotoContextSubtitle` / `formatPhotoExecutionStepLabel` imports; added `technicianNote: null` to fixture.
- `mobile/src/features/visual-shell/serviceBackedReview.ts` — `VisualReviewPhotoAttachmentProjection` exposes `contextSubtitle` and `technicianNoteLabel`; supervisor projection maps both; added `translateEvidencePresenceState` and `translateEvidencePresenceMessage` helpers; replaced raw English `evidenceStatus.message` rendering with the new PT-BR translator.
- `mobile/src/features/visual-shell/model.ts` — gated the demo calculation / history / diagnosis / report literals behind `!authenticated && demoEnabled` (D-07); emits neutral structures in authenticated mode.
- `mobile/src/shell/TagWiseApp.tsx` — added `AppState` / `useRef` imports; added `detectConnectivityRegain` import; added `SharedExecutionStepKind` to execution model imports; extended `handleAttachExecutionPhoto` with `options.technicianNote` and `options.executionStepIdOverride`; added `handleUpdatePhotoTechnicianNote`; passed both as props to `VisualProductShell`; added the `AppState` connectivity-regain `useEffect`.
- `mobile/src/shell/VisualProductShell.tsx` — extended prop types for `onAttachReportPhoto` and added `onUpdatePhotoTechnicianNote`; added `SharedExecutionPhotoAttachment` + `SharedExecutionStepKind` imports; added `formatPhotoContextSubtitle` + `formatPhotoExecutionStepLabel` imports; added `ReportPhotoCard` inline component with inline `Editar observacao` editor; replaced the old report-photo card render with the new component; updated supervisor review photo card to render `contextSubtitle` + `technicianNoteLabel`; added `onAttachInstrumentPhoto` prop on `TagDetailScreen` and the `Foto do instrumento` action panel; wired the new prop at the call site to `onAttachReportPhoto(source, 'Instrumento', { executionStepIdOverride: 'instrument' })`; added `variant` prop to both `SummaryLine` and `MetricLine` with vertical styles; applied `variant="vertical"` at the four priority screens (instrument detail, technician report header, supervisor queue card, supervisor review detail); extended `reviewLifecycleLabel` with `'In Progress'` and `'Ready to Submit'` mappings; added `photoNoteInput`, `metricLineVertical`, `metricLabelVertical`, `metricValueVertical`, `summaryLineVertical`, `summaryLabelVertical`, `summaryValueVertical` styles.

Added: none.

Deleted: none.

### Story 8.8 Defect-to-Fix Summary

| # | QA Defect | Status |
|---|---|---|
| D-02 | `contextNote` dropped at backend submission boundary | Fixed — round-trips via DTO widening + orchestrator + supervisor projection; cross-boundary test asserts it. |
| D-03 | No photo entry point on the tag detail screen | Fixed — `Foto do instrumento` panel renders on `TagDetailScreen`, gated behind template selection. |
| D-04 | No per-photo technician comment | Fixed — `technicianNote` field round-trips; `Editar observacao` inline UI on technician report; supervisor sees the note. |
| D-05 | Horizontal `TITLE / VALUE` rows | Fixed — vertical variant applied at instrument detail (×6), technician report header (×5), supervisor queue card (×4), supervisor review detail (×2 + dynamic). |
| D-06 | `detectConnectivityRegain` dead code | Fixed — wired via `AppState` foreground listener with 30-second rate limit. |
| D-07 | Visual-shell sample values used unconditionally | Fixed — demo literals gated behind `!authenticated && demoEnabled`. |
| PT-BR | English tokens leak (`In Progress`, `no-photo-evidence`, English evidence sentences, raw step kind) | Fixed — new PT-BR mappers + `reviewLifecycleLabel` draft-state coverage. |
| Data | Seeded history is decorative narrative without measured values | Fixed — 5 `historySummary` records now carry explicit point/value pairs, deviations, and supervisor decisions. |
| **D-01** | **AI diagnosis end-to-end disconnected** | **Deferred to Story 8.9** — explicit scope decision; user authorized phone-test-ready slice. |

## References

- [QA defect discovery report 2026-05-14](../planning-artifacts/qa-defect-discovery-2026-05-14.md) — source defect input
- [Story 8.7 implementation artifact](8-7-live-phone-field-workflow-repair.md) — predecessor; Story 8.7's per-attachment try/catch, submit rule, and contextNote field are preserved
- [Live phone 8.6 regression root-cause analysis](../planning-artifacts/live-phone-story-8-6-regression-root-cause-analysis.md) — original architectural diagnosis
