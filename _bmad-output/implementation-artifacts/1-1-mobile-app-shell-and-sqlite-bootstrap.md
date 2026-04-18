# Story 1.1: Mobile App Shell and SQLite Bootstrap

Status: ready-for-dev

## Metadata
- Story key: 1-1-mobile-app-shell-and-sqlite-bootstrap
- Story map ID: E1-S1
- Epic: Epic 1 - Platform, Identity, and Local-First Foundation
- Release phase: Vertical Slice

## User Story
As a technician, I want the mobile app to open into a reliable local-first shell so field work can continue even when connectivity is poor.

## Scope
mobile navigation shell, app startup flow, SQLite initialization, local migration handling, offline-capable screen placeholders, basic repository wiring.

## Key Functional Requirements Covered
PRD platform baseline, Offline/Sync "must work fully offline", Architecture local-first mobile architecture.

## Technical Notes / Implementation Approach
use the approved mobile-first stack; initialize SQLite on app launch; establish a repository layer that reads local state first; persist app shell state across restart.

## Dependencies
- none.

## Risks
- startup migration failures can strand users; a network-first screen pattern here will create rework later.

## Acceptance Criteria
1. App launches without requiring an active network call to render the signed-out shell.
2. SQLite initializes successfully on first launch and app restart.
3. Local-first repositories can read and write a seeded record without live API dependency.
4. App restart preserves local seeded data and navigation state where appropriate.

## Validation / Test Notes
- mobile smoke tests on iOS/Android simulators, SQLite migration tests, kill-and-restart persistence test.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
