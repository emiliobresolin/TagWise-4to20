# TagWise Phone Smoke Checklist — Physical Android Pass

Manual test script for the demo APK on a real phone against the LAN backend prepared per
[DEMO-RUNBOOK.md](DEMO-RUNBOOK.md). Run top to bottom; it covers the full golden path
(technician → supervisor → technician) plus every fix from the 2026-07-02 campaign that
needs device confirmation.

Conventions: each step is **Action → Expected**. UI strings in quotes are exact PT-BR
labels from the app. Accounts: `tech@tagwise.local`, `supervisor@tagwise.local`, password
`TagWise123!`. Pick `PT-101` as the primary demo tag unless a step says otherwise.

## A. First launch, server URL, login (technician)

- [ ] 1. Install the APK, put the phone on the demo Wi-Fi, open TagWise. → Login screen
  in PT-BR: subtitle "Entre para acessar a execucao de campo", card "TagWise login",
  fields "Email" / "Senha", button "Entrar". **No language selector anywhere** (EN/PT-BR
  toggle was removed).
- [ ] 2. Find the "Servidor" card below the login form. → Collapsed card shows the
  effective server URL and the hint "Toque para alterar a URL do servidor.".
- [ ] 3. Tap "Testar" on the "Servidor" card. → "Servidor alcancavel em
  http://&lt;PC-LAN-IP&gt;:4100. (hh:mm:ss)". (If unreachable: fix per runbook before
  continuing.)
- [ ] 4. Runtime URL validation: tap the URL to expand, replace it with `not a url`, tap
  "Salvar". → Inline red error "URL invalida. Use o formato http://host:porta (ex.:
  http://192.168.0.10:4100)."; nothing is saved.
- [ ] 5. Loopback warning: type `http://127.0.0.1:4100` in the expanded input. → Red
  warning "Atencao: URL de loopback — o telefone nao alcanca o backend em
  127.0.0.1/localhost." Tap "Cancelar" to discard.
- [ ] 6. Runtime URL change (real): expand again, enter the correct
  `http://<PC-LAN-IP>:4100`, tap "Salvar". → Card collapses; floating toast "Servidor
  atualizado: http://&lt;PC-LAN-IP&gt;:4100" appears at the bottom and auto-clears (~5 s).
- [ ] 7. Kill the app (swipe away from recents) and reopen. → The saved server URL is
  still shown on the "Servidor" card (persisted across restarts).
- [ ] 8. Log in as `tech@tagwise.local` / `TagWise123!`, tapping "Entrar". → Button shows
  "Entrando...", then the technician dashboard loads; a session/connection message is
  visible; no crash.

## B. Dashboard, sync diagnostics, package download

- [ ] 9. Locate the "Diagnostico de conexao" card on the technician dashboard. → Shows
  "Servidor configurado" (the URL), "Sessao" = "Conectada ao servidor", "Fila de envio" =
  "0 item(ns) pendente(s), 0 com problema de sync.", "Ultimo teste de conexao" = "Ainda
  nao executado nesta sessao.".
- [ ] 10. Tap "Testar conexao". → Button flips to "Testando conexao...", then "Ultimo
  teste de conexao" shows "Servidor alcancavel." with a timestamp.
- [ ] 11. Download/refresh the assigned work package. → Toast/message "Pacote
  &lt;id&gt; baixado localmente com N tag(s) em cache." and the tag list shows the seeded
  tags: PT-101, TT-205, AI-330, LT-410, XV-402.
- [ ] 12. Tap "Sincronizar com servidor" with nothing queued. → Button shows
  "Sincronizando...", then message "Sincronizacao com o servidor concluida." (no bogus
  push counts — honest messaging).

## C. Tag context and calculation execution (PT-101)

- [ ] 13. Open tag PT-101. → Tag detail hub loads with context ("Contexto da tag PT-101
  carregado localmente."); history tile shows a PT-BR state label (e.g. "disponivel"),
  never a raw token like `available`.
- [ ] 14. Check the "Previa do historico" content. → Summary/detail text is PT-BR (e.g.
  "O historico em cache e recente o suficiente para a comparacao local." when fresh); no
  English sentences.
- [ ] 15. Under "Escolher teste", open the pressure calculation template. → Calculation
  screen opens; after navigation a toast with the template pattern explainer appears (it
  must appear — navigate-then-notify fix).
- [ ] 16. Enter readings and run the deterministic calculation, then save. → Result +
  deviation values render; save confirmation appears; no keyboard covering the active
  input (the screen resizes — `softwareKeyboardLayoutMode: resize`).
- [ ] 17. Keyboard check on a low input: focus the bottom-most text field on the
  calculation screen. → The keyboard pushes the content up; the focused field stays
  visible and editable.

## D. Calculator sweep table

- [ ] 18. Open the standalone calculator ("Calculadora") and fill "PV min" / "PV max" (and
  unit) in conversion mode. Switch the helper mode to the sweep tab. → "Tabela 0-100%
  (4-20 mA)" renders 5 rows (0/25/50/75/100%) with the expected mA (4.00–20.00 mA) and
  the interpolated PV per row.
- [ ] 19. Clear PV min/max. → The sweep table shows its instruction text ("Preencha a
  faixa PV...") instead of rows; nothing crashes.

## E. Loop test per-point persistence (AI-330)

- [ ] 20. Go back to the dashboard, open tag AI-330, and open its loop test template. →
  Loop execution screen "Teste de loop do instrumento" with the 5-point grid.
- [ ] 21. Fill several loop points (PV or mA mode), then save the loop test. → App
  navigates back to the instrument hub FIRST, then shows the toast "Teste de loop salvo
  localmente. Volte ao instrumento para escolher outro teste ou avancar para Comparacao."
  (toast must be visible — it used to be wiped by navigation).
- [ ] 22. Re-open the same loop template. → The saved per-point readings are still there
  (persisted, re-hydrated from disk).
- [ ] 23. Open a DIFFERENT template (e.g. back out and open PT-101's calculation, then
  return to AI-330's loop). → AI-330's loop readings are intact; no values from one
  template ever appear pre-filled in another template's grid (identity-scoped reset).
- [ ] 24. Open AI-330's report screen and find the loop section. → "Curva do teste de
  loop (modo PV):" (or "modo mA") renders the curve/points from the saved readings.

## F. Photos on every capture surface

- [ ] 25. On the AI-330 (or PT-101) tag detail hub, attach an instrument photo via camera.
  → Camera permission prompt (first time) in Android; after capture, toast "Foto salva
  localmente para &lt;tagCode&gt;." and a **thumbnail** appears immediately on the tag
  detail photo panel (no blind capture).
- [ ] 26. Attach a photo from the guidance/checklist screen and another from the report
  screen. → Each surface shows its thumbnail right after attaching; sync state chip reads
  "Somente local" (or "Na fila" once submitted).
- [ ] 27. Photo with a picker that omits metadata (gallery import). → Attach succeeds; no
  error about file type/size (defaults are backfilled — `image/jpeg` + real byte size).

## G. Checklist autosave and guidance

- [ ] 28. On the guidance/checklist screen, toggle at least two checklist outcomes. Do
  NOT tap save. Navigate back to the tag hub, then re-open the checklist. → The toggles
  are still set (autosave on toggle — QA P1 S-03).
- [ ] 29. Tap "Salvar checklist e observacoes" after adding an observation note. → Save
  confirmation; note persists after navigating away and back.

## H. Pre-submit warning and report submission (online)

- [ ] 30. Open a tag/template where the minimum evidence is NOT yet satisfied (e.g. a
  fresh template with no saved readings) and tap "Enviar relatorio". → Native Alert
  "Evidencia minima pendente" with body "O servidor exige e pode recusar este envio sem:
  &lt;labels&gt;. Enviar mesmo assim?" and buttons "Voltar e completar" / "Enviar mesmo
  assim".
- [ ] 31. Tap "Voltar e completar". → No submission happens; you stay on the report.
- [ ] 32. Complete the minimum evidence (save readings etc.) on the PT-101 template, then
  submit from the report screen. → No warning Alert; success message "Relatorio
  sincronizado com o servidor e enviado para revisao." (online path must claim server
  acceptance, not "entrou na fila local"); report status shows "Servidor aceitou o envio.
  Aguarda revisao." and sync chip "Sincronizado".
- [ ] 33. Check the photos attached to that report after submit + sync. → Their sync state
  reaches "Sincronizado" (watch it pass through "Na fila"/"Validacao pendente"); none stay
  in "Falha de sync".

## I. Offline execution and reconnect auto-sync (TT-205)

- [ ] 34. Enable airplane mode (Wi-Fi off). → Amber banner appears: "📡 Offline – as
  alterações sincronizarão quando conectado".
- [ ] 35. While offline: open TT-205, execute its template (readings + a photo + checklist),
  and submit the report. → Everything works offline; submission is queued ("Na fila" /
  lifecycle "Submitted - Pending Sync" pt: "Pendente sync"); no errors.
- [ ] 36. Check "Diagnostico de conexao". → "Sessao" = "Offline (usando cache local)";
  "Fila de envio" shows ≥ 1 "item(ns) pendente(s)".
- [ ] 37. Re-enable Wi-Fi and wait up to ~30 s (or foreground the app again). → Banner
  disappears promptly (backend reachability probe, no internet needed); auto-sync drains
  the queue — a message like "Nova tentativa de sync verificou N relatorio(s) na fila: N
  enviado(s), 0 mantido(s) na fila." appears; TT-205's report reaches "Servidor aceitou o
  envio. Aguarda revisao.".
- [ ] 38. "Sincronizar com servidor" honest messaging (failure path): with Wi-Fi off
  again, tap "Sincronizar com servidor". → Message "Servidor indisponivel no momento.
  Suas alteracoes permanecem salvas no aparelho; tente novamente quando a conexao
  voltar." — it must NOT claim success. Re-enable Wi-Fi, tap it again → "Sincronizacao
  com o servidor concluida." (with " X de Y envio(s) pendente(s) enviado(s)." if anything
  was queued).

## J. Toast visibility while scrolled

- [ ] 39. On a long screen (report), scroll to the bottom, then trigger any action that
  produces a message (e.g. attach a photo). → The floating toast appears at the
  bottom of the viewport regardless of scroll position, auto-clears after ~5 s, and can
  be dismissed by tapping; the same toast channel also shows login-screen errors.

## K. Supervisor review (second device or after logout)

- [ ] 40. Log out / switch user, then log in as `supervisor@tagwise.local` /
  `TagWise123!`. → Supervisor dashboard; message "Sessao encerrada. O proximo usuario
  precisa entrar conectado ao servidor." was shown on the switch.
- [ ] 41. Refresh the review queue (or tap "Sincronizar com servidor"). → "N relatorio(s)
  de revisao carregado(s)."; the queue lists the technician's submitted reports (PT-101,
  TT-205). If empty, see the runbook troubleshooting row.
- [ ] 42. Open the PT-101 report detail. → Full report renders; the technician's photo
  evidence is **visible as images** on the supervisor side (presigned downloads); the
  loop/readings data matches what was executed.
- [ ] 43. Check the approval history section of a first-time report. → PT-BR placeholder
  "Nenhuma decisao de aprovacao foi registrada para este relatorio ainda." (never the
  English backend sentence).
- [ ] 44. Approve the PT-101 report: tap "Aprovar" (or "✓  Aprovar"), confirm
  "Confirmar aprovacao". → Success feedback; the report leaves the pending queue.
- [ ] 45. Open the TT-205 report and tap "Devolver (invalidar)" with an EMPTY comment. →
  Blocked: "Comentario e obrigatorio antes de devolver o relatorio." (button disabled or
  block message).
- [ ] 46. Type a return comment in "Comentario da decisao" (placeholder "Comentario
  obrigatorio para devolucao"), e.g. "Refazer as leituras", tap "Devolver (invalidar)". →
  Confirmation "Confirmar devolucao" / "Devolver este relatorio com o comentario
  registrado?"; confirm. → Return succeeds; queue updates.

## L. Returned report → "Iniciar Nova Visita" (technician)

- [ ] 47. Switch back to `tech@tagwise.local` and tap "Sincronizar com servidor". → Sync
  completes; the TT-205 report status line now reads "Relatorio devolvido e invalidado.
  Abra e inicie uma nova visita para corrigir.".
- [ ] 48. Open the returned TT-205 report. → Red banner "Relatorio invalidado pelo
  supervisor" with body "Este relatorio foi devolvido. Ele permanece visivel como
  historico mas nao pode ser editado nem reenviado. Inicie uma nova visita ao instrumento
  para registrar as correcoes." and "Motivo do supervisor: &lt;your comment&gt;". The
  report is **read-only** — no editable fields, no "Enviar relatorio".
- [ ] 49. Tap "+ Iniciar Nova Visita". → Message "Nova visita iniciada para TT-205.
  Registre as correcoes e reenvie o relatorio."; the execution screens are editable again;
  the previous return decision remains visible as approval history.
- [ ] 50. Re-execute TT-205 (fresh readings) and resubmit. → Submission succeeds
  ("Relatorio sincronizado com o servidor e enviado para revisao."); as supervisor,
  the resubmitted report appears in the queue again (approve it to finish the loop).

## M. Approved-tag lock scoped to package version

- [ ] 51. As technician, sync ("Sincronizar com servidor") after the PT-101 approval, then
  open PT-101's tag detail. → Lock banner "Instrumento concluido nesta versao do pacote"
  with body "Este instrumento ja tem relatorio aprovado pelo supervisor para o pacote
  atual. Os testes ficam bloqueados ate o proximo pacote ser disponibilizado...". Test
  affordances are disabled; history/report remain viewable.
- [ ] 52. Verify a NON-approved tag (e.g. LT-410) shows no lock and remains executable. →
  Templates open normally.
- [ ] 53. (If a fresh package version is published during the rehearsal) download the new
  snapshot. → The PT-101 lock clears — the lock is scoped to the package version the
  approval happened under, it no longer pins the tag forever.

## N. Token expiry survival

- [ ] 54. Leave the app open (or backgrounded) as technician for **16+ minutes** (access
  token TTL is 15 min). Then perform an authenticated action — e.g. "Sincronizar com
  servidor" or a report submit. → The action succeeds silently (automatic refresh-on-401
  and retry). You are NOT bounced to the login screen and see no 401/"expired" error. The
  toast "Sua sessao expirou. Faca login novamente..." must only ever appear if the
  refresh token itself is invalid.

## O. PT-BR-only sweep (run throughout)

- [ ] 55. Confirm there is **no language toggle** on the login screen or the dashboard
  header (no "Language:"/"Idioma:" row, no EN/PT-BR chips).
- [ ] 56. Walk the guaranteed demo path once more scanning every screen (login, dashboard,
  tag hub, calculation, loop, history/compare, checklist, report, review) for English
  leaks. → All operational copy is PT-BR: history/compare rows ("Ultimo resultado",
  "Desvio absoluto", "Comparacao esperada", "Nao informado ainda"...), sync labels
  ("Somente local", "Na fila", "Validacao pendente", "Sincronizado", "Falha de sync"),
  status/system messages. Lifecycle state tokens (e.g. "Submitted - Pending Supervisor
  Review") mirrored from the server contract are the only known English remnants — file
  anything else as a `ptbr-label-leaks` follow-up.
- [ ] 57. Final state check: "Diagnostico de conexao" shows "Fila de envio" = "0 item(ns)
  pendente(s), 0 com problema de sync." and every demo report/photo reads "Sincronizado".
  → Device is demo-ready.
