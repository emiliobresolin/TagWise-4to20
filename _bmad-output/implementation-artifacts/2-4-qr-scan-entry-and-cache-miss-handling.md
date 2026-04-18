# Story 2.4: QR Scan Entry and Cache-Miss Handling

Status: ready-for-dev

## Metadata
- Story key: 2-4-qr-scan-entry-and-cache-miss-handling
- Story map ID: E2-S4
- Epic: Epic 2 - Offline Work Package and Tag Access
- Release phase: First Release

## User Story
As a technician, I want to scan a tag QR code and know immediately whether it is available offline so I do not waste time at the asset.

## Scope
QR scan entry flow, tag resolution, cache-hit open behavior, cache-miss explanation.

## Key Functional Requirements Covered
FR-02.

## Technical Notes / Implementation Approach
resolve scan locally first; do not hide uncached tags behind silent failure; avoid any requirement for live lookup to continue.

## Dependencies
- `E2-S1`, `E2-S3`.

## Risks
- QR miss flows often become misleading if they imply live recovery while offline.

## Acceptance Criteria
1. Scanning a cached tag opens the correct tag context.
2. Scanning an uncached tag shows a clear not-cached state and next-step guidance.
3. QR entry does not require live connectivity for cached tags.
4. Invalid scan payloads fail gracefully.

## Validation / Test Notes
- QR parsing tests, offline cache-hit and cache-miss tests, malformed payload test.

## Source References
- [product-brief.md](../planning-artifacts/product-brief.md)
- [prd.md](../planning-artifacts/prd.md)
- [architecture.md](../planning-artifacts/architecture.md)
- [epics.md](../planning-artifacts/epics.md)
- [story-map.md](../planning-artifacts/story-map.md)
