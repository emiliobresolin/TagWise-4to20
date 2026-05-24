# Story 9.4: Mobile Supervisor Create-Package Flow

Status: draft

## Metadata
- Story key: 9-4-mobile-supervisor-create-package-flow
- Epic: Epic 9 - Supervisor Package Authoring
- Release phase: Authoring Slice

## User Story
As a supervisor on the mobile app, I want a "Create work package" surface where I pick instruments, name the package, choose a technician, and save, so I can compose work without server-side seeding.

## Scope
Mobile-only. New API client, new service, three sequential views (instrument-select, metadata, confirm), wired into the existing supervisor home via a new role-gated tile. PT-BR copy parity with the rest of the supervisor surface.

## Technical Notes / Implementation Approach
- `mobile/src/features/supervisor-authoring/supervisorAuthoringApiClient.ts` - bearer-auth fetch client with `listInstruments()`, `listTechnicians()`, `createWorkPackage(body)`.
- `mobile/src/features/supervisor-authoring/supervisorAuthoringService.ts` - role assertion (`assertConnectedSupervisor`), validation helpers (title length, at least 1 instrument, valid technician).
- `mobile/src/features/supervisor-authoring/model.ts` - `CatalogInstrument`, `CatalogTechnician`, `CreateWorkPackageInput`.
- UI: three React Native views inside `VisualProductShell`'s supervisor surface.
  - Step 1: searchable list grouped by `instrumentFamily`, multi-select with sticky footer ("X selecionados", "Continuar").
  - Step 2: text inputs (Título, Equipe), priority toggle (Rotina / Alta), date pickers (Início / Fim), technician dropdown.
  - Step 3: confirm card (count + technician + window) and a "Criar pacote" button.
- A new tile **"Criar pacote"** on the supervisor home next to the existing Review queue, visible only when `session.role === 'supervisor'`.
- After successful create, return to supervisor home with a transient success toast.

## Dependencies
- `9-3-supervisor-create-work-package-api`.

## Risks
- A long catalog could slow the list; for v1 we stay flat (20 rows fits a single screen with grouping).
- Network failure mid-create leaves the form intact - we keep state in component memory and surface a retry banner. No optimistic local insert (the package belongs to the technician, not the supervisor).

## Acceptance Criteria
1. Supervisor home shows a "Criar pacote" tile; technician home does not.
2. Tapping the tile lands on Step 1 with a populated catalog grouped by family.
3. "Continuar" is disabled until at least 1 instrument is selected.
4. Step 2 validates title (3-120 chars), end date >= start date, technician chosen.
5. Step 3 "Criar pacote" sends the API call; success returns to supervisor home with a success toast referencing the new package's title.
6. Network/API failure surfaces a retry banner without clearing the form.

## Validation / Test Notes
- Service unit test, API client test, vitest coverage for validation. No new e2e in mobile this story; covered by `9-5`.

## Source References
- [9-3-supervisor-create-work-package-api.md](9-3-supervisor-create-work-package-api.md)
- [8-5-reconnect-role-aware-supervisor-approval-queue-and-decisions.md](8-5-reconnect-role-aware-supervisor-approval-queue-and-decisions.md)
