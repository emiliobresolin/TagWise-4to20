# Story 9.1: Canonical Instruments Catalog

Status: draft

## Metadata
- Story key: 9-1-canonical-instruments-catalog
- Epic: Epic 9 - Supervisor Package Authoring
- Release phase: Authoring Slice

## User Story
As a supervisor, I want a canonical catalog of plant instruments so I can later compose work packages from a known, stable pool.

## Scope
New `instruments` table, model, repository, service, idempotent seed of 20 instruments spread across the 5 instrument families. No API yet; pure data layer.

## Key Functional Requirements Covered
Foundational data layer for Epic 9. Reuses existing seeded templates and guidance from the work-packages module.

## Technical Notes / Implementation Approach
- New migration `0015_instruments_catalog` adds the `instruments` table with: `id`, `tag_code` UNIQUE, `short_description`, `area`, `parent_asset_reference`, `instrument_family`, `instrument_subtype`, `measured_variable`, `signal_type`, `range_min/max/unit`, `tolerance`, `criticality`, `default_template_id`, `default_guidance_reference_id`, `default_history_summary_id` (nullable), `created_at`, `updated_at`.
- `backend/src/modules/instruments/model.ts` - `Instrument` type.
- `backend/src/modules/instruments/instrumentsRepository.ts` - `upsertSeedInstrument`, `listAll`, `findManyByIds`.
- `backend/src/modules/instruments/instrumentsService.ts` - `ensureSeedInstruments`, `listInstruments`, `resolveInstruments(ids)`.
- `backend/src/modules/instruments/seedData.ts` - 20 instruments (4 per family: pressure, temperature/RTD, level, valve, 4-20mA loop). `default_template_id` and `default_guidance_reference_id` reference existing seeded template/guidance IDs (e.g., `tpl-pressure-as-found`, `guide-pressure-loop-check`). No prior-test history baked in.
- Wired into `backend/src/api/main.ts` so `ensureSeedInstruments` runs on boot. Idempotent.

## Dependencies
- `E1-S2` (backend bootstrap).

## Risks
- Drift between catalog `default_template_id` values and the templates embedded in seeded packages would break package assembly. Mitigated by referencing the exact existing IDs.

## Acceptance Criteria
1. New migration creates `instruments` table and adds itself to `schema_migrations`.
2. `ensureSeedInstruments` is idempotent: repeated boots leave exactly 20 rows.
3. The 20 seeded instruments cover all 5 families with 4 entries each, distinct `tag_code`s, distinct `id`s.
4. `listInstruments` returns the seeded set ordered deterministically (family, then tag_code).
5. `resolveInstruments(ids[])` returns rows in the requested order and surfaces missing IDs.

## Validation / Test Notes
- Migration applies test, seed idempotency test, resolve-with-missing-id test.

## Source References
- [architecture.md](../planning-artifacts/architecture.md)
- [2-1-assigned-work-package-list-and-download.md](2-1-assigned-work-package-list-and-download.md)
