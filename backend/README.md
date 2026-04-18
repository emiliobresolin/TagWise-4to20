# TagWise Backend

Story 1.2 bootstraps the backend modular monolith baseline:
- one codebase with separate API and worker entry points
- PostgreSQL connectivity and migrations
- private object storage wiring with a smoke command
- health and readiness endpoints for API and worker

## Commands
- `npm install`
- `npm run dev:api`
- `npm run dev:worker`
- `npm run db:migrate`
- `npm run storage:smoke`
- `npm test`
- `npm run typecheck`

## Environment
Copy `.env.example` values into your environment before running local commands.

Required variables:
- `TAGWISE_DATABASE_URL`
- `TAGWISE_STORAGE_BUCKET`
- `TAGWISE_STORAGE_REGION`
- `TAGWISE_STORAGE_ACCESS_KEY_ID`
- `TAGWISE_STORAGE_SECRET_ACCESS_KEY`

Optional but recommended for local S3-compatible storage:
- `TAGWISE_STORAGE_ENDPOINT`
- `TAGWISE_STORAGE_FORCE_PATH_STYLE`
- `TAGWISE_STORAGE_AUTO_CREATE_BUCKET`

## Manual Smoke Path
1. Start a local PostgreSQL instance and a private S3-compatible object store such as MinIO.
2. Export the values from `.env.example` or set equivalent environment variables.
3. Run `npm run db:migrate`.
4. Run `npm run storage:smoke`.
5. In separate terminals run `npm run dev:api` and `npm run dev:worker`.
6. Open `http://127.0.0.1:4100/health/ready` and `http://127.0.0.1:4101/health/ready`.
7. Expected result:
- both processes boot from the same codebase
- readiness returns `200` after PostgreSQL is reachable
- object storage smoke completes without leaving the sentinel object behind
