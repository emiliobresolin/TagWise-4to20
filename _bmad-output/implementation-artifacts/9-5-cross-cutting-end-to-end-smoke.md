# Story 9.5: Cross-Cutting End-to-End Smoke

Status: draft

## Metadata
- Story key: 9-5-cross-cutting-end-to-end-smoke
- Epic: Epic 9 - Supervisor Package Authoring
- Release phase: Authoring Slice

## User Story
As the team, we want an end-to-end test that proves supervisor authoring works with the existing technician execution path, so we ship Epic 9 without regressing Epic 2 or Epic 3.

## Scope
One automated end-to-end test in `backend/src/api/tagWiseApiE2e.test.ts` that:
1. Logs in as supervisor, fetches instrument + technician catalogs.
2. Creates a package containing 2 instruments assigned to the seed technician.
3. Logs in as that technician, lists work packages, confirms the new package is present.
4. Downloads the new package and asserts the snapshot has the right tag count, tag codes, and at least one template per tag.

## Technical Notes / Implementation Approach
- Reuse existing test boot harness; no new fixtures.
- Use real Postgres test DB the existing E2E uses.
- Keep the assertion set minimal (presence, count, IDs) so the test stays stable as catalog content evolves.

## Dependencies
- `9-1`, `9-2`, `9-3`.

## Acceptance Criteria
1. Test runs as part of `npm test` and passes locally.
2. Test cleans up the new package id afterward (so re-runs are deterministic).
3. Run does not perturb existing seed-package tests.

## Validation / Test Notes
- Vitest e2e suite.

## Source References
- [9-3-supervisor-create-work-package-api.md](9-3-supervisor-create-work-package-api.md)
