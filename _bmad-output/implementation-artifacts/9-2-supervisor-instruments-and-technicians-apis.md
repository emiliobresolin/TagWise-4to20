# Story 9.2: Supervisor Instruments and Technicians APIs

Status: draft

## Metadata
- Story key: 9-2-supervisor-instruments-and-technicians-apis
- Epic: Epic 9 - Supervisor Package Authoring
- Release phase: Authoring Slice

## User Story
As a supervisor, I want to fetch the instruments catalog and the list of assignable technicians so I can present them in the package-create flow.

## Scope
Two new role-gated GET endpoints: `/supervisor/instruments` and `/supervisor/technicians`. New role guard.

## Technical Notes / Implementation Approach
- New `requireSupervisorOrManager(authService, request)` helper in `backend/src/api/createApiRequestHandler.ts` (composes `authenticateRequest` + role check). Throws `AuthenticationError` with statusCode 403 when role is `technician`.
- `GET /supervisor/instruments` - returns `{ items: Instrument[] }` from `instrumentsService.listInstruments()`.
- `GET /supervisor/technicians` - returns `{ items: { id, displayName, email }[] }` from a new lightweight `AuthRepository.listTechnicians()`.
- Wire `instrumentsService` and pass to the API handler dependency map.

## Dependencies
- `9-1-canonical-instruments-catalog`.

## Risks
- A technician currently has no public role-aware API beyond their own data. Exposing other users requires care: limit to (id, displayName, email) so we leak nothing else.

## Acceptance Criteria
1. `GET /supervisor/instruments` returns 200 with `items[]` for a supervisor or manager bearer token.
2. Same endpoint returns 403 for a technician token.
3. `GET /supervisor/technicians` returns 200 with the seed technician for supervisor/manager and 403 for technician.
4. Both endpoints return 401 without a valid bearer token.

## Validation / Test Notes
- API handler tests for role gating, plus a smoke test in `tagWiseApiE2e.test.ts`.

## Source References
- [9-1-canonical-instruments-catalog.md](9-1-canonical-instruments-catalog.md)
