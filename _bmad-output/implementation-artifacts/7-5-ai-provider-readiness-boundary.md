# Story 7.5: AI Provider Readiness Boundary

Status: review

## Metadata
- Story key: 7-5-ai-provider-readiness-boundary
- Story map ID: E7-S5 (extension derived from Epic 7 optional AI assist scope; original first-release cut listed E7-S1 through E7-S4 only)
- Epic: Epic 7 - Release Readiness, Deployment, and Optional AI Assist
- Release phase: Optional AI Assist Readiness
- Created: 2026-05-07

## User Story
As an operations owner,
I want a backend-only AI diagnosis provider boundary with safe OpenAI configuration,
so that TagWise can validate the OpenAI API key and later add assistive diagnosis without exposing secrets in the mobile app or changing field workflow semantics.

## Scope
Implement the first AI Provider Readiness slice only:
- backend-only AI diagnosis configuration
- provider interface and factory
- mock provider for local/dev/tests
- OpenAI provider implementation or narrow skeleton behind feature flags
- backend-only smoke command to prove a real OpenAI key/model can be called
- focused backend tests

This story does not implement mobile UI, AI job persistence, AI request queueing, report artifact persistence, APK builds, or workflow gating.

## Acceptance Criteria
1. AI config is loaded from backend environment only.
   - `TAGWISE_AI_ENABLED` defaults to `false`.
   - `TAGWISE_AI_PROVIDER` defaults to `mock`.
   - `TAGWISE_AI_REQUEST_TIMEOUT_MS` defaults to `30000`.
   - `OPENAI_API_KEY` and `OPENAI_MODEL` are read only by backend code.
   - No mobile source file reads or references `OPENAI_API_KEY`.

2. OpenAI provider initialization is fail-closed.
   - `TAGWISE_AI_ENABLED=false` does not require `OPENAI_API_KEY`.
   - `TAGWISE_AI_PROVIDER=mock` does not require `OPENAI_API_KEY`.
   - `TAGWISE_AI_ENABLED=true` with `TAGWISE_AI_PROVIDER=openai` requires a non-empty, non-placeholder `OPENAI_API_KEY`.
   - `TAGWISE_AI_ENABLED=true` with `TAGWISE_AI_PROVIDER=openai` requires a non-empty `OPENAI_MODEL`.
   - Unsupported `TAGWISE_AI_PROVIDER` values fail during backend config/provider initialization.

3. Provider boundary exists and is provider-agnostic.
   - Add an `AiDiagnosisProvider` interface with a narrow `generateDiagnosis(input)` contract.
   - Input captures only sanitized diagnosis context needed for future worker execution.
   - Output clearly identifies AI-suggested content as assistive and includes provider/model metadata.
   - The contract does not expose OpenAI-specific response structures to callers.

4. Mock provider is deterministic.
   - `MockAiDiagnosisProvider` returns stable, testable suggestions without network calls.
   - Mock output is clearly marked with provider metadata `provider: "mock"`.

5. OpenAI provider is backend-only and uses the Responses API.
   - It uses `OPENAI_API_KEY` only from backend environment/config.
   - It does not log the API key, request Authorization header, or raw secrets.
   - It uses `OPENAI_MODEL` from config; do not hardcode a model in source as the only option.
   - It honors `TAGWISE_AI_REQUEST_TIMEOUT_MS` with abort/timeout behavior.
   - It calls OpenAI through backend code only, using Node `fetch` or the official backend-only SDK if the dev agent has a clear reason to add that dependency.

6. Backend smoke command proves key/model readiness without product workflow changes.
   - Add `npm run ai:smoke`.
   - The command fails fast with a clear message when AI is disabled, OpenAI provider is not selected, the key is missing, or the model is missing.
   - When configured, it sends a small synthetic instrument-diagnosis prompt to OpenAI and prints a redacted success summary.
   - The smoke command must not require PostgreSQL, object storage, mobile, or worker boot.

7. No mobile or APK work is included.
   - No files under `mobile/` are changed.
   - No mobile env var is introduced for `OPENAI_API_KEY`.
   - No APK/build artifact is produced.

8. Follow-up story is explicitly documented.
   - Document that actual AI diagnostic execution still requires worker job integration, persistence, report attachment, retry/failure behavior, and mobile UX in later stories.

## Tasks / Subtasks
- [x] Add backend AI config boundary (AC: 1, 2)
  - [x] Extend `backend/src/config/env.ts` with an optional `ai` config object.
  - [x] Prefer `TAGWISE_AI_*` names for TagWise-owned feature flags and keep `OPENAI_*` for OpenAI-owned provider credentials/model.
  - [x] Update `backend/.env.example`, `.env.staging.example`, and `.env.production.example`.
  - [x] Ensure release guardrails reject placeholder OpenAI values only when AI is enabled with provider `openai`.

- [x] Add AI diagnosis provider module (AC: 3, 4, 5)
  - [x] Create `backend/src/modules/ai-diagnosis/model.ts`.
  - [x] Create `backend/src/modules/ai-diagnosis/aiDiagnosisProvider.ts`.
  - [x] Create `backend/src/modules/ai-diagnosis/mockAiDiagnosisProvider.ts`.
  - [x] Create `backend/src/modules/ai-diagnosis/openAiDiagnosisProvider.ts`.
  - [x] Create `backend/src/modules/ai-diagnosis/aiDiagnosisProviderFactory.ts`.
  - [x] Keep OpenAI request/response details inside the OpenAI provider.

- [x] Add backend AI smoke command (AC: 5, 6)
  - [x] Add `backend/src/ops/aiDiagnosisSmokeCli.ts`.
  - [x] Optionally add `backend/src/ops/aiDiagnosisSmoke.ts` if testability benefits.
  - [x] Add `ai:smoke` script to `backend/package.json`.
  - [x] Ensure output is redacted and operationally clear.

- [x] Add focused tests (AC: 1, 2, 3, 4, 6, 7)
  - [x] Extend or add config tests covering disabled, mock, OpenAI missing key, OpenAI missing model, invalid provider, timeout default/override.
  - [x] Add provider factory tests.
  - [x] Add mock provider deterministic output tests.
  - [x] Add OpenAI provider initialization tests without making a real network call.
  - [x] Add smoke command validation tests using a fake provider/fetch where practical.
  - [x] Add a guard test or repository search assertion that mobile code does not reference `OPENAI_API_KEY`.

- [x] Update docs and implementation report (AC: 8)
  - [x] Update `backend/README.md` with AI env vars and `npm run ai:smoke`.
  - [x] Add a concise follow-up note in this story's Dev Agent Record after implementation.

## Dev Notes

### Architecture Constraints
- AI is an async assist layer, never deterministic business logic. It must not decide approval, required pass/fail calculations, role validation, or canonical state transitions. [Source: `_bmad-output/planning-artifacts/architecture.md#AI Boundary Architecture`]
- Missing AI results must never block reports or approval. [Source: `_bmad-output/planning-artifacts/architecture.md#Pending AI Result Behavior`]
- The provider boundary must stay provider-agnostic so future provider changes do not touch report, approval, or sync logic. [Source: `_bmad-output/planning-artifacts/architecture.md#Provider-Agnostic Boundary`]
- PRD requires AI to remain optional, assistive, asynchronous, pluggable, and clearly distinguished from deterministic product output. [Source: `_bmad-output/planning-artifacts/prd.md#AI Boundary Requirements`]
- Epic 7 includes optional AI assist, provider-agnostic AI job boundary, optional queueing, and feature-flag control, but live AI can remain off. [Source: `_bmad-output/planning-artifacts/epics.md#Epic 7 - Release Readiness, Deployment, and Optional AI Assist`]

### Existing Backend Patterns To Reuse
- Environment config belongs in `backend/src/config/env.ts`; tests belong near `backend/src/config/env.test.ts`.
- Release guardrails already reject placeholders, local release databases, development secrets, and release-unsafe storage behavior. Extend this pattern for AI only when AI is enabled.
- CLI ops commands already live under `backend/src/ops/*Cli.ts` and are exposed through `backend/package.json`.
- Backend tests use Vitest. Follow existing focused test style rather than broad integration setup.
- Worker durability already exists in `backend/src/modules/worker-jobs`, but this story should not add an AI job type yet. Name the follow-up, do not implement it here.

### Suggested AI Contract
Keep the first contract small and non-domain-authoritative:

```ts
export interface AiDiagnosisInput {
  tagCode: string;
  instrumentFamily: string;
  templateId: string;
  deterministicResultSummary: string;
  historySummary: string;
  riskFlags: Array<{ id: string; reasonType: string; detail: string }>;
  evidenceSummary: string;
}

export interface AiDiagnosisResult {
  provider: 'mock' | 'openai';
  model: string;
  generatedAt: string;
  summary: string;
  likelyIssuePatterns: string[];
  recommendedChecks: string[];
  missingEvidenceWarnings: string[];
  disclaimer: 'assistive-ai-suggestion';
}

export interface AiDiagnosisProvider {
  generateDiagnosis(input: AiDiagnosisInput): Promise<AiDiagnosisResult>;
}
```

The dev agent may refine names, but it must preserve provider-agnostic inputs/outputs and the explicit assistive disclaimer.

### OpenAI API Guidance
- Use the OpenAI Responses API for the smoke/provider path. The API creates model responses from text input and supports developer instructions plus text output. [Source: OpenAI Responses API Reference: https://platform.openai.com/docs/api-reference/responses]
- OpenAI documentation shows `OPENAI_API_KEY` as an environment variable and notes SDKs read it from the system environment. [Source: OpenAI Developer Quickstart: https://platform.openai.com/docs/quickstart/using-the-api]
- Do not rely on a model string from older notes. `OPENAI_MODEL` must be configurable. A current cost-conscious example from official docs is `gpt-5-mini`, but the code should not require that exact model. [Source: OpenAI Models: https://platform.openai.com/docs/models]

### Security Guardrails
- Never put an API key in source, examples with real values, tests, logs, output, mobile code, or committed docs.
- `.env.*.example` files must show placeholders or blanks only.
- `npm run ai:smoke` output must show provider/model/status and a short generated summary, but never the key.
- Prefer redacting any error details that could echo request headers.

### Explicit Non-Goals
- No mobile changes.
- No APK build.
- No report-submission API changes.
- No new database table or migration for AI artifacts.
- No worker job handler for AI.
- No AI result attached to report/review screens.
- No AI-gated workflow transition.

## Testing Requirements
- Run `cd backend && npm run typecheck`.
- Run `cd backend && npm test`.
- Run focused tests during development, for example:
  - `cd backend && npm test -- env aiDiagnosis`
  - `cd backend && npm test -- aiDiagnosisSmoke`
- Do not make automated tests depend on a real OpenAI network call. The real call belongs only in the manual `npm run ai:smoke` command when the developer/operator has set real env vars.

## Manual Smoke Instructions For Developer
After implementation, with a real key available only in the backend shell:

```powershell
cd backend
$env:TAGWISE_AI_ENABLED='true'
$env:TAGWISE_AI_PROVIDER='openai'
$env:OPENAI_API_KEY='<real key from secret manager or local env>'
$env:OPENAI_MODEL='gpt-5-mini'
$env:TAGWISE_AI_REQUEST_TIMEOUT_MS='30000'
npm run ai:smoke
```

Expected: the command reports successful provider/model readiness and returns a short assistive synthetic diagnosis summary. It must not print the key.

## Follow-Up Story Needed
Create a later story for actual AI diagnostic execution:
- `ai.diagnosis.generate` worker job type
- request enqueueing from backend/report context
- AI request/result persistence
- retry/failure states and observability
- result artifact linked to report/tag
- mobile UX for optional AI suggestions
- clear distinction between deterministic output and AI-suggested output

## Project Structure Notes
- New backend module should sit under `backend/src/modules/ai-diagnosis`.
- New smoke command should sit under `backend/src/ops`.
- Keep existing `backend/src/modules/diagnostics` for mobile runtime error telemetry; do not mix AI diagnosis with runtime diagnostics.
- No `mobile/` files should be touched.

## References
- [PRD AI Boundary Requirements](../planning-artifacts/prd.md#ai-boundary-requirements)
- [Architecture AI Boundary Architecture](../planning-artifacts/architecture.md#ai-boundary-architecture)
- [Epic 7 Optional AI Assist](../planning-artifacts/epics.md#epic-7---release-readiness-deployment-and-optional-ai-assist)
- [Story Map First Release Story Cut AI note](../planning-artifacts/story-map.md#first-release-story-cut)
- [Previous Story 7.4 Worker Resilience](7-4-worker-resilience-and-operational-recovery-runbook.md)
- [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses)
- [OpenAI Developer Quickstart](https://platform.openai.com/docs/quickstart/using-the-api)
- [OpenAI Models](https://platform.openai.com/docs/models)

## Dev Agent Record

### Agent Model Used
GPT-5

### Debug Log References
- `cd backend && npm test -- env` - passed, 17 tests.
- `cd backend && npm test -- aiDiagnosisProviderFactory` - passed, 5 tests.
- `cd backend && npm test -- aiDiagnosisSmoke` - passed, 5 tests.
- `cd backend && npm test -- env aiDiagnosisProviderFactory aiDiagnosisSmoke` - passed, 3 files / 27 tests.
- `cd backend && npm run typecheck` - passed.
- `cd mobile && npm run typecheck` - passed.
- `cd backend && npm test` - passed, 18 files / 92 tests.
- `cd mobile && npm test` - passed, 22 files / 125 tests.
- `rg "OPENAI_API_KEY|TAGWISE_AI_|OPENAI_MODEL" mobile` - no matches.
- `git diff --check` - passed with CRLF warnings only.

### Completion Notes List
- Implemented backend-only AI config with `TAGWISE_AI_ENABLED`, `TAGWISE_AI_PROVIDER`, `TAGWISE_AI_REQUEST_TIMEOUT_MS`, `OPENAI_API_KEY`, and `OPENAI_MODEL`.
- Added fail-closed OpenAI config validation while keeping disabled/mock AI modes free of OpenAI credential requirements.
- Added provider-agnostic AI diagnosis model/interface, deterministic mock provider, OpenAI Responses API provider, and provider factory.
- Added `npm run ai:smoke` through a testable smoke module and CLI that uses synthetic diagnosis context and redacted output.
- Added backend tests for config, provider/factory behavior, OpenAI fake-fetch behavior, smoke validation, and mobile source secret guard.
- Updated backend env examples and README.
- Follow-up story remains required for actual async AI execution: worker job type, request/result persistence, report attachment, retry/failure observability, and mobile UX.

### File List
- `backend/.env.example`
- `backend/.env.production.example`
- `backend/.env.staging.example`
- `backend/README.md`
- `backend/package.json`
- `backend/src/config/env.ts`
- `backend/src/config/env.test.ts`
- `backend/src/modules/ai-diagnosis/aiDiagnosisProvider.ts`
- `backend/src/modules/ai-diagnosis/aiDiagnosisProviderFactory.test.ts`
- `backend/src/modules/ai-diagnosis/aiDiagnosisProviderFactory.ts`
- `backend/src/modules/ai-diagnosis/mockAiDiagnosisProvider.ts`
- `backend/src/modules/ai-diagnosis/model.ts`
- `backend/src/modules/ai-diagnosis/openAiDiagnosisProvider.ts`
- `backend/src/ops/aiDiagnosisSmoke.test.ts`
- `backend/src/ops/aiDiagnosisSmoke.ts`
- `backend/src/ops/aiDiagnosisSmokeCli.ts`
- `_bmad-output/implementation-artifacts/7-5-ai-provider-readiness-boundary.md`

## Change Log
- 2026-05-07: Implemented backend-only AI provider readiness boundary and moved story to review.
