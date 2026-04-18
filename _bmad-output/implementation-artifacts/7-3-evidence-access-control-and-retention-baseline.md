# Story 7.3: Evidence Access Control and Retention Baseline

Status: ready-for-dev

## Metadata
- Story key: 7-3-evidence-access-control-and-retention-baseline
- Story map ID: E7-S3
- Epic: Epic 7 - Release Readiness, Deployment, and Optional AI Assist
- Release phase: Release Hardening

## User Story
As an operations owner, I want evidence files protected and retained predictably so report media remains secure and supportable in early production.

## Scope
private object storage posture, signed/authenticated access strategy, file-type/size rules, retention baseline, cleanup rules for rejected local uploads.

## Key Functional Requirements Covered
Evidence/media architecture secure handling, Security baseline.

## Technical Notes / Implementation Approach
keep object storage private by default; expose only controlled download/access; document v1 retention rules.

## Dependencies
- `E5-S2`, `E7-S1`.

## Risks
- weak media access policy can create security and support issues quickly.

## Acceptance Criteria
1. Evidence binaries are not publicly accessible by default.
2. Download/access path requires authenticated or signed access.
3. File-type and size guardrails are enforced.
4. Retention and cleanup rules are documented and applied for first release.

## Validation / Test Notes
- access-control tests, upload rule tests, retention policy verification.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
