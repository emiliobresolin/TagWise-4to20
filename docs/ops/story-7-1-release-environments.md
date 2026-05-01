# Story 7.1 Release Environments

This runbook implements the Story 7.1 baseline for staging and production deployment,
environment-scoped secrets, backup/restore verification, and promotion checks.

## Runtime Shape

Use the approved single-region managed deployment shape:

- one API container from `backend/Dockerfile`
- one worker container from the same image with command `node dist/worker/main.js`
- one managed PostgreSQL database per environment
- one private object storage bucket per environment
- managed environment secret/config injection
- managed logs and error monitoring supplied by the host platform

Staging must be production-like but smaller scale. Production remains single region with managed backups.

## Environment And Secrets

Use `backend/.env.staging.example` and `backend/.env.production.example` as templates only.
Do not commit populated environment files.

Required secret manager values:

- `TAGWISE_DATABASE_URL`
- `TAGWISE_STORAGE_ACCESS_KEY_ID`
- `TAGWISE_STORAGE_SECRET_ACCESS_KEY`
- `TAGWISE_AUTH_TOKEN_SECRET`
- `TAGWISE_SEED_TECHNICIAN_PASSWORD`
- `TAGWISE_SEED_SUPERVISOR_PASSWORD`
- `TAGWISE_SEED_MANAGER_PASSWORD`

Release environments must set:

- `TAGWISE_DEPLOYMENT_ENV=staging` or `production`
- `TAGWISE_NODE_ENV=production`
- `TAGWISE_HOST=0.0.0.0`
- `TAGWISE_STORAGE_AUTO_CREATE_BUCKET=false`

The backend release guard rejects localhost database URLs, local MinIO credentials,
default auth secrets, default seed passwords, and auto-created buckets in staging/production.

## Build And Promotion

Run the release gate before each promotion:

```powershell
cd backend
npm ci
npm run typecheck
npm test
npm run build
docker build -t tagwise-backend:<version> .
```

The same checks are available through the manual GitHub Actions workflow
`.github/workflows/release-gate.yml`. Configure GitHub environment secrets/variables for
`staging` and `production`, then run the workflow with the target environment selected.

Deploy the same image twice:

- API service command: `node dist/api/main.js`
- Worker service command: `node dist/worker/main.js`

Before starting services, run migrations once against the target database:

```powershell
cd backend
npm run deploy:preflight
npm run db:migrate
npm run storage:smoke
```

After service start, verify both service endpoints:

```powershell
cd backend
$env:TAGWISE_API_BASE_URL='https://<api-host>'
$env:TAGWISE_WORKER_BASE_URL='https://<worker-host>'
npm run release:smoke
```

Promotion to production requires the same commands after the staging image and smoke checks pass.

## Backup And Restore Baseline

Configure managed PostgreSQL backups in both staging and production. Keep object storage versioning
or provider backup policy enabled for evidence/media buckets.

Minimum database backup drill:

1. Confirm the provider has a fresh managed PostgreSQL backup.
2. Restore that backup into a disposable restored database.
3. Point `TAGWISE_RESTORED_DATABASE_URL` at the disposable restored database.
4. Run:

```powershell
cd backend
npm run backup:restore:verify
```

The verification is read-only. It checks that the restored database has the same migration version
as the source database and current application code.

## Acceptance Checklist

- Staging API and worker are deployed from the same tested backend image.
- Production API and worker are configured to deploy from the same tested backend image.
- Staging and production secrets live in environment-scoped secret management.
- No populated `.env` files are committed.
- PostgreSQL managed backups are enabled.
- Backup restore verification has passed against a disposable restored database.
- Object storage bucket exists before deployment and is private.
- `npm run deploy:preflight`, `npm run db:migrate`, `npm run storage:smoke`, and
  `npm run release:smoke` have passed for the target environment.
