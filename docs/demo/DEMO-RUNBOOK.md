# TagWise Demo Runbook — Cold Start to Demo-Ready (LAN, no internet required)

Last updated: 2026-07-02 (post fix campaign). Companion documents:
[PHONE-SMOKE-CHECKLIST.md](PHONE-SMOKE-CHECKLIST.md) (manual phone test pass) and
[FIX-SUMMARY-2026-07-02.md](FIX-SUMMARY-2026-07-02.md) (engineer changelog).

## Demo topology

| Piece | Where | Notes |
|---|---|---|
| PostgreSQL 16 + MinIO | Docker on the backend PC | `docker-compose.yml` at repo root. Postgres on `5432`, MinIO on `9000` (S3 API) + `9001` (console) |
| API service | Backend PC, port `4100` | `backend`, `npm run dev:api` (or `start:api`) |
| Worker service | Backend PC, port `4101` | `npm run dev:worker` — required: it processes the AI diagnosis jobs |
| Mobile app (APK) | Physical Android phone | Built via EAS `preview` profile (APK, internal distribution) |
| Network | Phone and PC on the **same LAN / Wi-Fi** | Internet is NOT required at demo time when `TAGWISE_AI_PROVIDER=mock` |

The offline banner in the app now means "**the TagWise backend is unreachable**", not "no
internet" — a LAN without an internet uplink works fine (the app probes
`<server>/health/live`, not Google).

## 0. Prerequisites

- Docker Desktop running on the backend PC (Windows).
- Node.js + npm installed; `npm install` already run in both `backend\` and `mobile\`.
- The APK **built in advance** (step 8 needs internet — EAS builds run in the cloud).
- Find the PC's LAN IP now; you will use it in several places:

```powershell
ipconfig   # look for "IPv4 Address" on the Wi-Fi/Ethernet adapter, e.g. 192.168.0.10
```

Referred to as `<PC-LAN-IP>` below.

## 1. Start infrastructure (Postgres + MinIO)

**Warning — port squatters:** another project's container may already hold ports
`9000/9001` (a known offender on this machine is `ptfp-minio`) or `5432`. Check first:

```powershell
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

If anything other than this repo's compose services publishes `9000`, `9001`, or `5432`,
stop it, e.g.:

```powershell
docker stop ptfp-minio
```

Then, from the repo root (or the VS Code task **"Docker: Start Infrastructure"**):

```powershell
docker compose up -d
```

Compose dev credentials (committed in `docker-compose.yml`, dev-only): Postgres
`tagwise`/`tagwise`, database `tagwise`; MinIO root user `minioadmin`/`minioadmin`.
MinIO console: `http://localhost:9001`.

## 2. Backend `.env` — required edits

Create `backend\.env` from `backend\.env.example` if it does not exist. `backend/.env` is
gitignored — never commit it, and never paste real secret values into docs or chats.

Required values for the LAN demo (everything else can stay at the example defaults):

| Variable | Demo value | Why |
|---|---|---|
| `TAGWISE_HOST` | `0.0.0.0` | Exposes the API on the LAN so the phone can reach it. `127.0.0.1` = local-only = phone login fails. |
| `TAGWISE_API_PORT` | `4100` | Default. |
| `TAGWISE_STORAGE_ENDPOINT` | `http://127.0.0.1:9000` | Internal S3 operations from the backend to MinIO. Keep as loopback. |
| `TAGWISE_STORAGE_PUBLIC_ENDPOINT` | `http://<PC-LAN-IP>:9000` | **Critical for photo upload.** This endpoint is baked into the presigned URLs the phone uses to PUT/GET photo binaries. If it is loopback, the phone tries to upload to itself and every photo sticks in `Falha de sync`. |
| `TAGWISE_AI_ENABLED` | `true` | AI diagnosis is off by default (`false`); the "Solicitar diagnostico assistido" button needs it on. |
| `TAGWISE_AI_PROVIDER` | `mock` | **Recommended for the demo**: deterministic AI diagnosis with zero external calls, works with no internet. `openai` requires internet **and** `OPENAI_API_KEY=<your-openai-api-key>` (never commit a real key). |
| `TAGWISE_AUTH_TOKEN_SECRET` | any non-placeholder local value | Dev default is fine for a demo; use a real secret only for release envs. |

Seed identities are also configured in `.env` (`TAGWISE_SEED_*`); the defaults produce the
demo accounts listed in section 7.

If the PC's LAN IP changes (new router/DHCP lease), update
`TAGWISE_STORAGE_PUBLIC_ENDPOINT` and restart the API. The **app-side** URL no longer needs
a rebuild — it is editable at runtime on the login screen ("Servidor" card, step 9).

## 3. Migrate the database

From `backend\` (or VS Code task **"Backend: Migrate DB"**):

```powershell
cd backend
npm run db:migrate
```

There is no separate seed script: **seeding runs automatically when the API boots**
(`src/api/main.ts` calls `ensureSeedUsers`, `ensureSeedPackages`, `ensureSeedInstruments`,
and `ensureSeedRoutes`). Migrate, then start the API, and the demo users/packages/tags
exist.

## 4. Storage smoke (creates the bucket)

```powershell
npm run storage:smoke
```

This bootstraps object storage: with `TAGWISE_STORAGE_AUTO_CREATE_BUCKET=true` it creates
the `tagwise-evidence-dev` bucket if missing and verifies a put/delete cycle. Run it once
after `docker compose up` — a missing bucket is one of the two causes of photos stuck in
`Falha de sync`.

## 5. Start API and worker

Two terminals in `backend\` (or VS Code tasks **"Backend: Start API"** and
**"Backend: Start Worker"**):

```powershell
npm run dev:api      # API on TAGWISE_HOST:4100
npm run dev:worker   # worker on :4101 — REQUIRED for AI diagnosis jobs
```

(`npm run start:api` / `npm run start:worker` are the non-watch equivalents.)

Optional AI check while both are up: `npm run ai:smoke` (requires
`TAGWISE_AI_ENABLED=true`).

## 6. Windows Firewall — allow the phone in

The phone must reach TCP `4100` (API) and TCP `9000` (MinIO presigned photo URLs) on the
PC. In an **elevated** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "TagWise API 4100"   -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4100
New-NetFirewallRule -DisplayName "TagWise MinIO 9000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 9000
```

Ports `5432`, `9001`, and `4101` are only used locally on the PC and do not need rules.
Also make sure the Wi-Fi network profile is not blocking all inbound traffic (public
profile with "block all" toggled).

## 7. Verify the backend before touching the phone

Run the live API smoke test (it is skipped unless `TAGWISE_LIVE_API_BASE_URL` is set —
this is the one intentionally skipped test in the backend suite). From `backend\`:

```powershell
$env:TAGWISE_LIVE_API_BASE_URL = "http://localhost:4100"
npx vitest run src/api/tagWiseLiveApiSmoke.test.ts
```

(bash equivalent: `TAGWISE_LIVE_API_BASE_URL=http://localhost:4100 npx vitest run
src/api/tagWiseLiveApiSmoke.test.ts`)

It exercises health/readiness/metrics, all three seeded logins, token refresh, package
download, and both review queues. Quick manual checks:

- `http://localhost:4100/health/live` → 200, `api-service`
- `http://localhost:4100/health/ready` → `ready: true`, database `ready`
- From the **phone's browser**: `http://<PC-LAN-IP>:4100/health/live` — if this fails, fix
  network/firewall before opening the app.

Demo accounts (seeded at API boot; password for all: `TagWise123!`):

| Role | Email |
|---|---|
| Technician | `tech@tagwise.local` |
| Supervisor | `supervisor@tagwise.local` |
| Manager | `manager@tagwise.local` |

Seeded instruments in the demo package: `PT-101` (pressure transmitter, 0–10 bar),
`TT-205` (RTD input, 0–250 °C), `AI-330` (4–20 mA process loop), `LT-410` (level
transmitter, 0–8 m), `XV-402` (valve stroke test).

## 8. Build the APK (do this in advance — needs internet)

The build embeds a default server URL from `EXPO_PUBLIC_TAGWISE_API_BASE_URL` and runs the
`mobile\scripts\check-env.js` preflight, which **fails the build** if the variable is
unset or a loopback address (a phone can never reach `127.0.0.1`/`localhost`). From
`mobile\` (or VS Code task **"Mobile: Build APK"**):

```powershell
cd mobile
$env:EXPO_PUBLIC_TAGWISE_API_BASE_URL = "http://<PC-LAN-IP>:4100"
npm run build:android:preview
```

Notes:

- `build:android:preview` = `node scripts/check-env.js && npx eas-cli build --platform
  android --profile preview` (EAS `preview` profile: internal distribution, `apk`).
- The preflight runs **twice**: locally before invoking EAS, and again on the EAS build
  worker via the `eas-build-pre-install` hook — the worker validates the value injected
  from the EAS **"preview" environment**. Set it there too (`eas env:create`, environment
  `preview`, name `EXPO_PUBLIC_TAGWISE_API_BASE_URL`) or the cloud build fails the same
  check.
- Escape hatch: `TAGWISE_ALLOW_DEFAULT_URL=1` skips the check (emulator-only builds, or
  when you plan to set the URL at runtime on the login screen).
- A wrong/stale baked URL is **field-recoverable** since this campaign: the login screen
  has a runtime "Servidor" editor (step 9). You do not need to rebuild the APK because the
  PC's IP changed.

## 9. Phone-side install and first launch

1. Copy the APK to the phone (USB, or `adb install app.apk`) and install it (allow
   "install unknown apps" for your file manager if prompted).
2. Ensure the phone is on the **same Wi-Fi/LAN** as the backend PC.
3. Open TagWise. On the login screen, find the **"Servidor"** card. Collapsed, it shows
   the effective server URL.
   - Tap **"Testar"** → expect `Servidor alcancavel em http://<PC-LAN-IP>:4100.` If it
     says `Servidor inalcancavel...`, fix the URL or network before logging in.
   - If the URL is wrong (or shows the loopback warning `Atencao: URL de loopback...`),
     tap the URL text ("Toque para alterar a URL do servidor."), type
     `http://<PC-LAN-IP>:4100`, tap **"Salvar"** → toast `Servidor atualizado:
     http://<PC-LAN-IP>:4100`. The URL persists across app restarts.
4. Log in as `tech@tagwise.local` / `TagWise123!` → technician dashboard with the
   **"Diagnostico de conexao"** card. Tap **"Testar conexao"** → `Servidor alcancavel.`
5. You are demo-ready. Follow [PHONE-SMOKE-CHECKLIST.md](PHONE-SMOKE-CHECKLIST.md) for the
   full rehearsal pass.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Login fails; "Testar" says `Servidor inalcancavel em <url>. Verifique rede e URL.` | Wrong server URL baked/typed; phone on a different network; Windows Firewall blocking 4100; API bound to `127.0.0.1` | Verify phone browser reaches `http://<PC-LAN-IP>:4100/health/live`; fix the URL via the login "Servidor" card; add the firewall rule (section 6); set `TAGWISE_HOST=0.0.0.0` and restart the API |
| Photos stuck in `Falha de sync` (sync-issue) while the report itself syncs | `TAGWISE_STORAGE_PUBLIC_ENDPOINT` is loopback/wrong IP (presigned URL points the phone at itself), or the MinIO bucket does not exist, or port 9000 blocked | Set `TAGWISE_STORAGE_PUBLIC_ENDPOINT=http://<PC-LAN-IP>:9000`, restart the API, run `npm run storage:smoke`, allow TCP 9000 inbound; then on the phone tap "Sincronizar com servidor" — failed photo uploads stay retryable even after the report was accepted |
| AI diagnosis shows a failure (`Diagnostico de IA falhou sem bloquear`) or never completes | `TAGWISE_AI_ENABLED=false`; `TAGWISE_AI_PROVIDER=openai` without internet or without `OPENAI_API_KEY`; worker not running | For offline demos set `TAGWISE_AI_ENABLED=true` + `TAGWISE_AI_PROVIDER=mock`, restart **both** API and worker (`npm run dev:worker` must be running — it executes the AI jobs); sanity-check with `npm run ai:smoke` |
| Supervisor review queue is empty after the technician submitted | Logged in with the wrong role; the technician's report is still queued locally (not yet synced); (historic) missing review route for a package authored after API boot — now auto-registered at package creation | Confirm role `supervisor@tagwise.local`; on the technician phone check the report shows `Servidor aceitou o envio. Aguarda revisao.` (run "Sincronizar com servidor" if not); pull the queue again ("Sincronizar com servidor" as supervisor) |
| App shows the offline banner (`Offline – as alterações sincronizarão quando conectado`) although the phone is on the LAN | **Fixed this campaign** — the banner now means "backend unreachable", not "no internet". If it still shows: the backend really is unreachable (URL/firewall/API down) | Use "Testar conexao" on the dashboard (or "Testar" on the login screen) to probe `<url>/health/live`; fix per the login-fails row above; the banner clears on the next successful probe |
| `docker compose up` fails: port already allocated (9000/9001/5432) | Another container (e.g. `ptfp-minio`) or local service owns the port | `docker ps --format "table {{.Names}}\t{{.Ports}}"`, `docker stop <name>`, then `docker compose up -d` |
| Toast `Sua sessao expirou. Faca login novamente para continuar sincronizando.` | Refresh token expired or was revoked (access tokens auto-refresh silently; this only fires when the refresh itself is rejected) | Log in again; normal demo pauses (15+ min idle) are survived by the automatic refresh-on-401 |
| `npm run db:migrate` / API boot fails to connect to Postgres | Docker infra not up, or `TAGWISE_DATABASE_URL` edited | `docker compose up -d`; keep the default `postgres://tagwise:tagwise@127.0.0.1:5432/tagwise` |

## Quick reference

| What | Command (from) |
|---|---|
| Infra up | `docker compose up -d` (repo root) |
| Migrate DB | `npm run db:migrate` (backend) |
| Bucket bootstrap + smoke | `npm run storage:smoke` (backend) |
| Start API / worker | `npm run dev:api` / `npm run dev:worker` (backend) |
| AI smoke | `npm run ai:smoke` (backend) |
| Live API smoke | `$env:TAGWISE_LIVE_API_BASE_URL = "http://localhost:4100"; npx vitest run src/api/tagWiseLiveApiSmoke.test.ts` (backend) |
| Build APK | `$env:EXPO_PUBLIC_TAGWISE_API_BASE_URL = "http://<PC-LAN-IP>:4100"; npm run build:android:preview` (mobile) |
| Full test suites | `npm run test` + `npm run typecheck` (backend and mobile) |
