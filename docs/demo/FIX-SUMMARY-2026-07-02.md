# TagWise Fix Campaign Summary — 2026-07-02

Engineer-facing changelog of the four-wave pre-demo fix campaign (uncommitted working-tree
changeset as of this date). Waves are grouped by theme; ledger/story IDs from the code
comments are kept for traceability.

**Suite status after the campaign:** mobile `238/238` vitest passing + `tsc --noEmit`
clean; backend `106/107` vitest (the 1 skip is `src/api/tagWiseLiveApiSmoke.test.ts`,
intentionally gated on `TAGWISE_LIVE_API_BASE_URL`) + `tsc --noEmit` clean.

Note on the diff: `backend/dist/**` changes are compiled build artifacts and
`backend/node_modules/.vite/**` is vitest cache — review the `src` files only.

---

## Wave 1 — Connectivity, server URL, session (LAN demo blockers)

| Fix | Files | Status |
|---|---|---|
| **Runtime-configurable server URL** (`api-base-url` ledger). New resolution module (stored preference > `EXPO_PUBLIC_TAGWISE_API_BASE_URL` > loopback fallback) with normalization/validation; persisted in `app_preferences`; "Servidor" card on the signed-out login screen (view/edit/"Testar" probe of `/health/live`, loopback warning); saving bumps a bootstrap nonce so **all** API clients are rebuilt against the new URL and NetInfo reachability is re-pointed | `mobile/src/platform/http/apiBaseUrl.ts` (+ `.test.ts`, new), `mobile/src/data/local/repositories/appPreferencesRepository.ts`, `mobile/src/shell/VisualProductShell.tsx` (`ServerUrlCard`), `mobile/src/shell/TagWiseApp.tsx` (`handleSaveApiBaseUrl`, `apiBaseUrlNonce`), `mobile/src/features/auth/authApiClient.ts` | Logic unit-tested; save→re-bootstrap→login UX **needs device confirmation** |
| **APK build preflight** (`apk-lan-url-no-preflight`, `env-buildtime-check`): fail the build when `EXPO_PUBLIC_TAGWISE_API_BASE_URL` is unset or loopback; runs locally (`build:android:preview`) and on the EAS worker (`eas-build-pre-install`); `TAGWISE_ALLOW_DEFAULT_URL=1` bypass | `mobile/scripts/check-env.js` (new), `mobile/package.json` | Script verified locally; EAS-worker hook **needs a real EAS build to confirm** |
| **Offline banner = backend unreachable** (not "no internet"): NetInfo reachability probes `<apiBaseUrl>/health/live` with `useNativeReachability: false` and a 200-status test, so a LAN without internet uplink no longer shows a permanent Offline banner; `isOnline` derives from that probe | `mobile/src/shell/TagWiseApp.tsx` (`configureNetInfoReachability`, NetInfo listener) | **Needs device confirmation** (Android NetInfo native behavior) |
| **Token auto-refresh on 401 everywhere**: `createAuthenticatedFetch` rewritten to refresh via `SessionController.restoreSession()` (keeps secure storage + session cache in sync), single-flight across concurrent 401s, retry once with the renewed token, invalidate only on definitive refresh rejection (not on the cached-offline fallback); injected as `fetchImplementation` into all five feature clients (work packages, evidence upload, supervisor review, supervisor authoring, mobile diagnostics) | `mobile/src/platform/http/authenticatedFetch.ts` (+ rewritten `.test.ts`), `mobile/src/shell/TagWiseApp.tsx` (client wiring), session-expired PT-BR toast | Unit-tested (incl. concurrency); real 15-min expiry **needs device confirmation** (checklist step 54) |
| **Connectivity-regain hardening**: benign short-circuit for already-connected sessions *before* throttle/backoff bookkeeping (backoff used to inflate to its cap during normal use); backoff only on real failed attempts (`still-offline`/`signed-out`); offline→online transition resets throttle+backoff; AI auto-poll calls through a ref so it sees post-reconnect state (stale-closure fix) | `mobile/src/shell/TagWiseApp.tsx` (regain effect, `refreshServerStatusRef`, `lastNetInfoConnectedRef`) | Code-reviewed; reconnect timing **needs device confirmation** (checklist step 37) |
| **Sync diagnostics card** (`qa-p1-ux-sync-diag-card`): technician-dashboard card with configured server URL, session connection state, outbound queue counts, and a one-tap "Testar conexao" probe | `mobile/src/shell/VisualProductShell.tsx` (`SyncDiagnosticsCard`), `TagWiseApp.tsx` (passes `packageSyncSummaries`) | Rendering **needs device confirmation** |
| **LAN-friendly backend defaults**: `TAGWISE_HOST=0.0.0.0` with explanation; `backend/.env` explicitly gitignored | `backend/.env.example`, `.gitignore` | Verified |

## Wave 2 — Evidence / photo pipeline end-to-end

| Fix | Files | Status |
|---|---|---|
| **`TAGWISE_STORAGE_PUBLIC_ENDPOINT`**: presigned upload/download URLs are signed against a publicly reachable endpoint (phone-facing) while internal S3 ops keep the internal endpoint; needs a second S3 client because SigV4 signs the `Host` header; defaults to the internal endpoint; release environments reject loopback public endpoints | `backend/src/config/env.ts` (+ `.test.ts`), `backend/src/platform/storage/objectStorage.ts` (+ `.test.ts`), `backend/.env.example` | Unit-tested (presign host assertions); real phone→MinIO upload **needs device confirmation** (checklist steps 25–33) |
| **`executionStepId: 'instrument'` accepted by the API**: the tag-detail photo panel stamps `instrument`, which the metadata endpoint used to reject | `backend/src/modules/evidence-sync/model.ts`, `backend/src/api/createApiRequestHandler.ts` (+ `.test.ts`) | Verified (API test asserts persisted row) |
| **expo-file-system v19 upload fix**: root `uploadAsync`/`FileSystemUploadType` were removed from the package root (throws at runtime); switched to `expo-file-system/legacy` | `mobile/src/platform/files/evidenceBinaryUploadBoundary.ts` (+ new `.test.ts`) | Unit-tested; on-device binary PUT **needs device confirmation** |
| **Picker-omitted metadata hardening**: backend 400s on null `mimeType` / non-positive `fileSizeBytes`, but pickers can omit both. Attach-time defaults the mime type from the resolved file extension (`.jpg`→`image/jpeg` etc.) and backfills size from the sandbox copy's real byte count (`getInfoAsync` probe, failure-safe); legacy records get an `?? 'image/jpeg'` fallback at queue/request build time | `mobile/src/features/execution/sharedExecutionShellService.ts` (+ tests), `mobile/src/platform/files/appSandboxBoundary.ts` (`sizeBytes`), `mobile/src/features/sync/evidenceUploadOrchestrator.ts` | Verified (unit tests incl. null-metadata fixture) |
| **Per-photo retry after report acceptance**: photos whose upload failed stay retryable once the report reached `submitted-pending-review` (accepted server-side); retry pass promotes finalized photos to `synced` instead of leaving them in `pending-validation`; retry sweep + `canRetry` include accepted reports with pending queue work (and exclude them once drained) | `mobile/src/features/sync/evidenceUploadOrchestrator.ts` (+ tests), `mobile/src/features/sync/syncStateService.ts` (+ tests) | Verified (unit + orchestration tests) |
| **Evidence sync timeout 5 s → 15 s** (`DEFAULT_EVIDENCE_SYNC_TIMEOUT_MS`): rides out LAN/hotspot hiccups; a mid-flight abort could leave a committed POST surfacing a scary `sync-issue` | `mobile/src/features/sync/evidenceUploadApiClient.ts` (+ new `.test.ts`) | Verified |
| **Photo thumbnails on all capture surfaces**: tag-detail panel falls back to the per-visit aggregate (`instrumentVisit.photoAttachments`) so it is not blind before a template is opened; live shell still wins so a just-attached photo shows instantly | `mobile/src/shell/VisualProductShell.tsx` (TagDetailScreen `photoAttachments` fallback) | **Needs device confirmation** (visual) |

## Wave 3 — Review lifecycle correctness

| Fix | Files | Status |
|---|---|---|
| **Returned reports are invalidated read-only** (`qa-p5-f02`, Story 8.12 #2): a supervisor return stamps `invalidated: true` + the supervisor's comment (resolved from namespaced action types `report.supervisor.returned` / `report.manager.returned`, previously only bare `returned` matched — the reason never surfaced); the report renders a red "Relatorio invalidado pelo supervisor" banner, is not editable, and cannot be resubmitted as-is | `mobile/src/features/sync/evidenceUploadOrchestrator.ts` (`resolveInvalidationReason`), `mobile/src/features/visual-shell/serviceBackedReport.ts`, `technicianReports.ts` (status copy), `VisualProductShell.tsx` (banner) | Verified (unit tests); banner UX needs device pass |
| **"Iniciar Nova Visita" escape hatch**: resets the invalidated per-tag draft to a fresh technician-owned state (same deterministic reportId — the backend replaces returned submissions under it), keeps approval history as audit context, guarded so approved/in-flight reports can never be reset | `mobile/src/features/execution/sharedExecutionShellService.ts` (`startNewVisit`, + tests incl. guard), `TagWiseApp.tsx` (`handleStartNewVisit`), `VisualProductShell.tsx` ("+ Iniciar Nova Visita") | Verified (service tests); full round-trip on device = checklist steps 47–50 |
| **Supervisor "Devolver (invalidar)"**: return buttons relabeled to convey invalidation semantics | `mobile/src/shell/VisualProductShell.tsx` (ReviewDetailView + ApprovalScreen) | Verified (label change) |
| **Review routes for freshly authored packages**: supervisor review reads INNER JOIN `supervisor_review_routes`, and boot-time seeding only covered packages existing at startup — reports against packages authored later were invisible until an API restart. Package creation now registers routes for every supervisor (idempotent upsert; failure never fails the 201) | `backend/src/api/createApiRequestHandler.ts`, regression in `backend/src/api/tagWiseApiE2e.test.ts` | Verified (E2E asserts immediate queue visibility) |
| **Approved-tag lock scoped to package version** (Story 8.14 #5 follow-up): report drafts stamp the `packageVersion` they were worked under; the lock predicate compares it against the currently downloaded snapshot so a fresh package version actually unlocks the tag; legacy drafts without the stamp keep the conservative lock | `mobile/src/features/execution/model.ts` + `sharedExecutionShellService.ts` (stamp/parse), `technicianReports.ts` (summary carries it), `VisualProductShell.tsx` (lock predicate) | Verified (tests); unlock-on-new-package on device = checklist step 53 |
| **Pre-submit minimum-evidence warning**: mobile never hard-blocks (Story 8.10) but the backend 422s (`minimum-evidence-missing`); submit now warns with the exact unmet minimum labels via a native Alert — "Evidencia minima pendente" with "Voltar e completar" / "Enviar mesmo assim" | `sharedExecutionShellService.ts` (`listUnsatisfiedMinimumEvidenceLabels`, + tests), `TagWiseApp.tsx` (Alert + `performSubmitExecutionReport` split) | List function unit-tested; Alert flow **needs device confirmation** |
| **"Sincronizar com servidor" is a real, honest full sync** (Story 10.7 follow-up): offline sessions attempt the regain probe inline; drains the outbound queue *before* pulling; refreshes package catalog + in-flight report lifecycles (+ review queue for reviewer roles); reports an honest PT-BR result — full success, partial (`Sincronizacao parcial... Falhou: ...`), or server-unavailable — instead of an unconditional success toast | `mobile/src/shell/TagWiseApp.tsx` (`handleSyncWithServer`; `handleRefreshAssignedPackages` / `handleRefreshSupervisorReviewQueue` now return success booleans and accept a session override) | Code-reviewed; message matrix on device = checklist steps 12/37/38 |
| **Honest online-submit message**: a fully successful online submit says the report reached the server ("Relatorio sincronizado com o servidor e enviado para revisao."), gated on the reloaded `submitted-pending-review` state; the "queued locally" copy is reserved for the offline path | `mobile/src/shell/TagWiseApp.tsx` | Verified (state-gated) |
| **Evidence pending actions route to the screen that fixes them** (`rca86-f06` residual): report-screen pendings used to self-route to the read-only report; now `structured-readings`→calculation, everything else→checklist | `mobile/src/features/visual-shell/serviceBackedReport.ts` (+ tests) | Verified |

## Wave 4 — UX polish and PT-BR sweep

| Fix | Files | Status |
|---|---|---|
| **Floating toast everywhere** (`toast-coverage-partial`): `MessageToast` merges both message channels (`shellMessage` and TagWiseApp-owned `authMessage`) so feedback reaches every screen incl. TagDetail; login screen gets the toast too; dismissal/auto-clear clears both channels; redundant inline `InlineMessage` rows removed from dashboard/calculation/loop/history/guidance/report/review screens | `mobile/src/shell/VisualProductShell.tsx`, `TagWiseApp.tsx` (`onClearAuthMessage`) | **Needs device confirmation** (checklist step 39) |
| **Navigate-then-notify ordering** (`new-loop-save-toast-wiped-by-poproute`): `openRoute`/`popRoute` clear `shellMessage`, so loop-save and template-open confirmations are now set *after* navigating — the technician actually sees them | `mobile/src/shell/VisualProductShell.tsx` | Verified in code; device = checklist step 21 |
| **Checklist autosave** (QA P1 S-03): toggling a checklist outcome silently persists the draft (navigating back reloads from disk and used to reset the toggle); explicit "Salvar checklist e observacoes" kept as the visible affordance and recovery path | `mobile/src/shell/TagWiseApp.tsx` (`handleChecklistOutcomeChange`) | Persistence layer tested; toggle→navigate→return on device = checklist step 28 |
| **Loop state scoped to template identity**: the shared loop-point grid resets when the active wp+tag+template identity changes, so a curve filled on one template never bleeds into (or gets saved under) another; same-identity shell replacements keep mid-edit values | `mobile/src/shell/VisualProductShell.tsx` (`lastLoopTemplateIdentityRef`) | Verified in code; device = checklist steps 22–23 |
| **History chart shows the 6 newest sessions**: readings arrive newest-first; slice-then-reverse replaced the old reverse-then-slice which rendered the 6 *oldest* | `mobile/src/shell/VisualProductShell.tsx` (ServiceHistoryScreen) | Verified |
| **Keyboard no longer covers inputs**: Android `softwareKeyboardLayoutMode: "resize"` | `mobile/app.json` | **Needs device confirmation** (checklist step 17) |
| **Pressed-state feedback** (`qa-p1-s02`): shared `cardPressed` overlay applied via Pressable style functions to tappable cards/buttons | `mobile/src/shell/VisualProductShell.tsx` | Visual; device pass |
| **PT-BR sweep** (`ptbr-label-leaks`): tag-context history preview fully PT-BR; phrase-level mappings added to `translateVisibleText` for report/compare rows; English approval-history placeholder replaced with PT-BR; raw history-preview state tokens mapped (`toHistoryPreviewStateLabel`); dozens of `authMessage`/error strings in TagWiseApp converted (download, refresh, QR, photo, review, diagnostics, retry summary...) | `mobile/src/features/work-packages/localTagContextService.ts` (+ tests), `mobile/src/features/visual-shell/serviceBackedExecution.ts`, `serviceBackedReview.ts` (+ tests), `mobile/src/shell/VisualProductShell.tsx`, `TagWiseApp.tsx` | Verified (tests updated); full-screen sweep on device = checklist step 56 |
| **PT-BR-only UI (honesty)**: language toggle removed from login + dashboard; `setAppLanguage('pt-BR')` forced at bootstrap (a previously persisted `'en'` preference is ignored); i18n catalogs (`mobile/src/i18n/*`) kept in place for post-demo wiring | `mobile/src/shell/VisualProductShell.tsx`, `TagWiseApp.tsx` | Verified; device = checklist step 55 |

---

## Verified-fixed vs needs-device-confirmation

**Verified by automated tests / code inspection:** everything in the tables above marked
"Verified" — notably the presign public-endpoint split, `instrument` step id, metadata
hardening, per-photo retry semantics, `startNewVisit` reset + guard, review-route
registration, packageVersion lock scoping, evidence pending routing, PT-BR service-layer
strings, authenticatedFetch behavior (incl. single-flight concurrency).

**Needs the physical-phone pass** (checklist reference in parentheses): runtime URL
save/re-bootstrap (A4–A8), NetInfo backend-probe banner + reconnect auto-sync (I),
EAS preflight on a real cloud build, photo upload end-to-end through MinIO presigned URLs
(F, H33), expo-file-system legacy upload, thumbnails on all surfaces (F), pre-submit
Alert (H30–31), honest sync message matrix (B12, I38), toast visibility (J),
keyboard resize (C17), checklist autosave (G28), loop persistence/bleed (E), token expiry
survival (N54), supervisor photo visibility (K42), returned→new-visit round trip (L),
approved lock + unlock on new package version (M).

## Known remaining backlog (post-demo)

1. **Component/renderer test harness** — the shell JSX (`VisualProductShell.tsx`,
   `TagWiseApp.tsx`) has no react-test-renderer/RTL coverage; all UI-level fixes above are
   only verifiable by hand today.
2. **Maestro E2E** — no scripted on-device flows; the golden path lives in
   [PHONE-SMOKE-CHECKLIST.md](PHONE-SMOKE-CHECKLIST.md) as a manual script.
3. **i18n wiring** — catalogs exist (`mobile/src/i18n/pt-BR.ts` / `en.ts`) but the shell
   renders hard-coded PT-BR strings; wire `useTranslation` through the shell and restore a
   language toggle once real.
4. **`VisualProductShell.tsx` monolith refactor** — ~8.9k lines / single file; split into
   per-screen modules before further feature work.
5. **Manual-instrument server reconciliation** — manually created instruments remain
   local-only; no server-side merge/dedup flow yet.
6. **Per-photo retry button** — retry is per-report ("Sincronizar com servidor" /
   report-level retry); a failed single photo has no dedicated retry affordance in the UI.
