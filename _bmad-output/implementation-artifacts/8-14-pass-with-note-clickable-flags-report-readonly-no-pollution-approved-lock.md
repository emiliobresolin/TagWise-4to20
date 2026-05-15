# Story 8.14 — pass-with-note label, interactive red flags, read-only report, observationNotes cleanup, approved-tag lock

Date: 2026-05-15
Predecessor: Story 8.13 (loop cleanup, compare template-free, badge labels, chart from priorReadings, photo filter, auth refresh).

## Scope

Five user-reported deferred items from the Story 8.13 phone-test triage:

| # | Finding | What changed |
|---|---|---|
| 4 | "Aprovação com observação" on detail tile was meaningless without context | `toHistoryResultLabel` collapses `pass-with-note` → `Aprovado` on the instrument detail tile. The third state still carries meaning where the actual note is rendered (Compare screen's priorReadings panel uses `Observacao` badge + inline technician/supervisor notes) |
| 10 | Red flags on the Report screen weren't actionable | Each `riskFlag` is wrapped in a `Pressable` that routes to the checklist (`diagnosis`) screen. Each unsatisfied `evidenceReference` is wrapped in a `Pressable` that routes to the source step (`calculation` for structured readings, `diagnosis` for observation notes / photo evidence) via a new `resolveEvidenceRefRoute` helper |
| 9 | Report page had its own edit affordances (review notes textarea, photo capture buttons, save-draft button) | Removed: review-notes `<TextInput>`, "Adicione fotos / Camera / Galeria" buttons, and "Salvar rascunho" button. Photo cards on the Report screen now render with `editable={false}`. The review notes section now shows a read-only card + a "Abrir checklist para editar" jump button. The only persistent edit affordance left on the Report screen is the AI request and the Submit button |
| 7 | Loop test was being merged into `Observacoes do tecnico` | `handleSaveLoopTestNote` no longer merges the formatted loop result into `shell.evidence.observationNotes`. The per-template calculation summary still persists (used by the visit aggregator's "Resumo da visita" panel). Per-point loop detail remains visible live on the LoopExecutionScreen during editing. **Persisting full per-point loop detail across screen visits is documented as a deferred structural change.** Also: the Story 8.11 visit-summary augmentation block in `handleSubmitExecutionReport` was removed so the augmentation fence (`---VISIT-SUMMARY-START---`) no longer appears in submitted observation notes |
| 5 | Need a real delete-package flow that preserves approved-tag history | Per-tag **approved-report lock**: when the technician opens a tag whose report status is `approved` under the current package version, the detail screen renders a red "Instrumento concluido nesta versao do pacote" banner and the test templates + instrument-photo Pressables are disabled. The lock auto-clears when a new package version is downloaded. Story 8.13's "Apagar pacote local" button now opens a PT-BR confirmation dialog before deleting |

## Files changed

### Mobile

- `mobile/src/shell/VisualProductShell.tsx`:
  - Imported `Alert` from `react-native` for the delete-package confirmation.
  - `toHistoryResultLabel`: `pass-with-note` case merged into `pass` → returns `Aprovado`.
  - `ServiceReportScreen`:
    - Each `riskFlag` is rendered as a `Pressable` that calls `onNavigatePending('diagnosis')`. Each card now also surfaces "Abrir checklist para justificar".
    - Each `evidenceReference` is rendered as a `Pressable` that routes via `resolveEvidenceRefRoute(reference.evidenceKind)` when `unsatisfied`. Unsatisfied entries show "Abrir etapa para resolver".
    - "Fotos e anexos" panel text changed to read-only language; Camera + Galeria buttons removed.
    - `ReportPhotoCard` invoked with `editable={false}` so remove + technician-note edits route back to the checklist screen.
    - "Observacoes do tecnico" `<TextInput>` replaced with a read-only `pendingCard` + "Abrir checklist para editar" jump button.
    - "Salvar rascunho" button removed; the "Enviar relatorio" button stays. The "Envio ainda bloqueado" banner now only renders when the report is invalidated.
  - `TagDetailScreen`:
    - New `approvedReportLock: boolean` prop.
    - When the lock is active, renders the red "Instrumento concluido nesta versao do pacote" banner.
    - Template Pressables (test templates) and instrument photo Pressables (camera + gallery) gain `disabled={approvedReportLock}` + the disabled style.
  - `WorkPackagePreparationPanel`: the "Apagar pacote local" Pressable now wraps `onDeleteLocalPackage` in an `Alert.alert` confirmation with PT-BR copy explaining the destructive scope (snapshot + in-progress execution state wiped; approved reports preserved as history).
  - New `resolveEvidenceRefRoute` helper.
- `mobile/src/shell/TagWiseApp.tsx`:
  - `handleSubmitExecutionReport` no longer applies the Story 8.11 visit-summary augmentation to observation notes; the augmentation block is gone from the submission DTO.
  - `handleSaveLoopTestNote` no longer merges the formatted loop result text into `shell.evidence.observationNotes`. The function signature still accepts the formatted note (so the loop screen's call site is unchanged) but discards the text and only triggers `saveGuidanceEvidence` to persist the calculation row + checklist state.
- Call site at `<TagDetailScreen>` in `VisualProductShell.tsx` now passes `approvedReportLock` derived from `technicianReports.some(report => ... && report.status === 'approved')`.

### Backend

No backend changes for Story 8.14.

## Validation

- `mobile/`: `npx tsc --noEmit` — clean.
- `mobile/`: `npx vitest run` — **192 / 192** across 32 files (no test churn; all changes are projection / UI / conditional logic that existing fixtures cover).
- `backend/`: `npx tsc --noEmit` — clean.
- `backend/`: `npm test` — **99 passing + 1 env-gated skip / 100**.

## Phone-test checklist (combines Story 8.13 + 8.14)

After installing the new APK:

1. **Wipe + refresh data** — for each downloaded package, tap "Apagar pacote local" → confirmation dialog appears → confirm → tap "Atualizar snapshot" → fresh templates land. (8.13 + 8.14)
2. **AI-330 templates route correctly** — open AI-330, you should see 3 templates; only the loop one routes to LoopExecutionScreen, the other two route to ServiceCalculationScreen (single-point). (8.13)
3. **Compare without selecting a test** — open a tag, tap "Avancar para Comparacao" without picking a template → Compare screen renders prior readings panel. (8.13)
4. **Test status badges** — saved tests show `Concluido` (pass) / `Incompleto` (fail) / `Em andamento` (selected, no save) / `Iniciar` (untouched). (8.13)
5. **Compare chart shows seeded history** — each point chip's chart bars are populated from `priorReadings`, with hot color for fail / pass-with-note rows. (8.13)
6. **Checklist photo thumbnails** — take a photo from the checklist screen → thumbnail appears inline under the photo button. Same on calculation and loop screens. (8.13)
7. **Token refresh on submit** — if the session has expired, submission silently retries after refresh; the technician sees a confirmation. If refresh fails, a clear PT-BR message appears. (8.13)
8. **Detail tile says "Aprovado" only** — no more "Aprovação com observação" on the result tile; observation context still appears in the Compare screen's per-reading cards. (8.14 #4)
9. **Red flags + missing evidence are tappable** — on the Report screen, tap a riskFlag or missing evidence card → routes to the checklist / calculation screen where you can fix it. (8.14 #10)
10. **Report page is read-only except Submit + AI request** — no review-notes textbox, no Camera / Galeria buttons, no Salvar rascunho. Only the "Solicitar diagnostico assistido" button + "Enviar relatorio" remain. (8.14 #9)
11. **Loop test no longer pollutes observation notes** — run a loop test, save, navigate to checklist → `Observacoes do tecnico` is empty (or only your free-form text). Per-point loop data was visible on the loop screen while editing. (8.14 #7)
12. **Approved-tag lock** — after a supervisor approval, the technician's detail screen for that tag shows the red banner and test templates are disabled. Tapping "Apagar pacote local" → confirmation appears, then the cache wipes but the approved lock remains until the package version bumps. (8.14 #5)

## Known carry-overs

- **Per-point loop persistence**: per-point detail (expected / measured / error per setpoint) still doesn't survive across screen exits. The per-template calculation result persists; the visit aggregator only sees one summary row per template. Adding a `loopTestSummary` evidence field requires a SQLite migration + service-method wiring + cross-screen rehydration; deferred to Story 8.15. For the next phone test, the technician should review per-point values while on the loop screen and capture a photo of the result if a permanent record is needed.
- **Visit-summary observation-note block on existing drafts**: Story 8.11's augmentation no longer runs, but existing drafts that already have a `---VISIT-SUMMARY-START---` block in their observation notes from prior submissions will keep showing it until the next checklist edit clears the field. "Apagar pacote local" → re-download is the cleanest reset path.
- **Toast vs. Alert UX**: the delete confirmation uses native `Alert.alert` because it's blocking and accident-proof. The general-purpose floating toast added in Story 8.12 stays for non-destructive notifications. Future-proofing the destructive-confirmation copy with a custom modal is a follow-up.
- **Lock semantics for partial-approval**: today the approved-tag lock fires when ANY draft for the tag has `lifecycleState === 'Approved'`. If a tag carries multiple per-template reports and only some are approved (Story 8.11's per-template persistence keeps reports separate), the lock currently fires on the FIRST approval. If the workflow needs partial-approval semantics, the visit aggregator's per-template status badges already give the granular view.
