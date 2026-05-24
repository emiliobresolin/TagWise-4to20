# Story 9.3: Supervisor Create Work-Package API

Status: draft

## Metadata
- Story key: 9-3-supervisor-create-work-package-api
- Epic: Epic 9 - Supervisor Package Authoring
- Release phase: Authoring Slice

## User Story
As a supervisor, I want to create a new work package containing instruments I pick from the catalog so the chosen technician sees it in their list and can download it for offline work.

## Scope
New `POST /supervisor/work-packages` endpoint that assembles a full `AssignedWorkPackageSnapshot` from selected instrument IDs (reusing existing seeded templates / guidance / history-summary stubs) and persists it via the existing `assigned_work_packages` + `assigned_work_package_snapshots` tables.

## Technical Notes / Implementation Approach
- Request body: `{ title: string, assignedTeam: string, priority: 'routine'|'high', dueWindow: {startsAt, endsAt}, assignedUserId: string, instrumentIds: string[] }`. Validation: title 3-120 chars, at least 1 instrument, all IDs must resolve, `assignedUserId` must be a technician.
- Server generates `id = 'pkg-sup-' + randomUUID()`, `sourceReference = 'supervisor:{supervisorId}:{isoTimestamp}'`, `snapshotContractVersion = '2026-04-v1'` (same as seed packages), `packageVersion = 1`, `status = 'assigned'`.
- Snapshot assembly: for each instrument, build an `AssignedWorkPackageTagSnapshot` from the catalog row. Pull the matching template from a small server-side template registry (shared with seed packages) so the snapshot's `templates[]` contains only templates referenced by the selected tags. Pull guidance entries the same way. `historySummaries[]` may be empty for freshly created packages; `priorTestReadings[]` omitted. Update `tagCount`.
- Persist via `assignedWorkPackageRepository.upsertSeedPackage(...)` (rename to `upsertPackage` if helpful, otherwise reuse — semantics already match).
- Audit log entry: `actionType = 'work-package.created'`, target = the new package id.
- 201 response: full snapshot summary so the client can render it immediately.

## Dependencies
- `9-1`, `9-2`.

## Risks
- If the supervisor selects an instrument whose `default_template_id` isn't in the server-side template registry, snapshot assembly fails. Mitigated by validating at seed time (every catalog row maps to an existing template).
- Audit append failure must not leave a half-created package: wrap the writes in a transaction.

## Acceptance Criteria
1. Supervisor token + valid body returns 201 with the new package summary and a resolvable `id`.
2. Technician token returns 403.
3. Missing/empty `instrumentIds` returns 400 with a clear message.
4. Unknown `instrumentId` returns 400 listing the missing IDs.
5. Non-technician `assignedUserId` returns 400 with a clear message.
6. After successful create, `GET /work-packages` as that technician lists the new package; `GET /work-packages/:id/download` returns the assembled snapshot.

## Validation / Test Notes
- Service unit test (snapshot assembly, validation, audit), API integration test (role + happy path + each error path), end-to-end via `tagWiseApiE2e.test.ts`.

## Source References
- [9-2-supervisor-instruments-and-technicians-apis.md](9-2-supervisor-instruments-and-technicians-apis.md)
- [2-1-assigned-work-package-list-and-download.md](2-1-assigned-work-package-list-and-download.md)
