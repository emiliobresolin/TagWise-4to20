# Story 7.1: Staging/Production Deployment, Secrets, and Backups

Status: ready-for-dev

## Metadata
- Story key: 7-1-staging-production-deployment-secrets-and-backups
- Story map ID: E7-S1
- Epic: Epic 7 - Release Readiness, Deployment, and Optional AI Assist
- Release phase: Release Hardening

## User Story
As an operations owner, I want staging and production environments with safe configuration and backups so TagWise can run as a real service.

## Scope
staging/prod environment setup, secrets management, backup scheduling, restore verification baseline, deployment pipeline basics.

## Key Functional Requirements Covered
Architecture deployment baseline, production readiness objective.

## Technical Notes / Implementation Approach
single-region managed deployment, managed PostgreSQL backups, managed object storage policy, environment-scoped secrets.

## Dependencies
- `E1-S2`, `E5-S4`, `E6-S5`.

## Risks
- late environment setup can hide release blockers until the end.

## Acceptance Criteria
1. Staging and production environments exist and match the approved runtime shape.
2. Secrets/configuration are environment-scoped and not embedded in code.
3. Database backup and restore baseline is verified.
4. Deployment process can promote a tested build into staging and production.

## Validation / Test Notes
- environment smoke tests, backup/restore drill, deployment checklist verification.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
