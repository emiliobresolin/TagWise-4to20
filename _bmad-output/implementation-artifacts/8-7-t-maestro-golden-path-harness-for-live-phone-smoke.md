# Story 8.7-T: Maestro Golden-Path Harness for Live Phone Smoke

Status: ready-for-dev

## Metadata

- Story key: 8-7-t-maestro-golden-path-harness-for-live-phone-smoke
- Epic: Epic 8 live phone repair continuation
- Type: Test infrastructure (no product behavior change beyond `testID` props)
- Created: 2026-05-11
- Source: [`_bmad-output/planning-artifacts/live-phone-story-8-6-regression-root-cause-analysis.md`](../planning-artifacts/live-phone-story-8-6-regression-root-cause-analysis.md)
- Gates: Story 8.7 cannot be marked done without this harness green (or its documented `MANUAL-FALLBACK.md` signed off) per [Story 8.7](8-7-live-phone-field-workflow-repair.md) Validation.

## User Story

As Emilio, owner of the TagWise live phone workflow,
I want a small device-level golden-path smoke harness for the Android APK,
so that future repair stories cannot land "code green, phone red" again and the demo gate has a fast, repeatable proof.

## Context

After three rounds — Story 8.1, Epic 8 live APK hotfix, and Story 8.6 — automated tests have consistently passed while the real phone workflow still failed. The 2026-05-11 architect analysis identified the structural cause: the projection/service layer is well tested; the rendered/touch/navigation layer (`mobile/src/shell/VisualProductShell.tsx` 6,169 lines, `mobile/src/shell/TagWiseApp.tsx` 5,040 lines) has **zero tests** and is exactly where the field defects live.

This story does not change product behavior. It adds a device-level smoke harness that the team can run from the dev machine against a tethered Android device or emulator. The harness is the new gate that Story 8.7 must pass.

This is small, parallelizable, and lands before Story 8.7. Without it, Story 8.7 will repeat the same pattern.

## Prerequisites

Stated once here; every other section references this block.

- **Dev OS:** Windows 11, PowerShell.
- **Backend running locally** and reachable on the LAN: `cd backend && npm run dev`. The harness will not function if the device cannot reach the backend.
- **Android target:** either an emulator (Android Studio AVD) or a USB-tethered physical phone with USB debugging enabled. `adb devices` must list the target.
- **`adb` on the Windows PATH** so Maestro can address the target.
- **Java 11+** on PATH (Maestro JAR requires it).
- **APK profile:** the `preview` Android APK from `npx eas-cli build --platform android --profile preview` with `EXPO_PUBLIC_TAGWISE_API_BASE_URL=http://<laptop-lan-ip>:4100` set at build time (NOT loopback / `127.0.0.1`). Install via `adb install <apk-path>`. Note: Story 8.7 will add a build-time check that fails preview/production builds with loopback URLs; this harness ships **before or alongside** that check, so during the harness dev pass you may need to build against the LAN URL manually.
- **Test credentials** (seeded by `backend/src/config/env.ts` when `TAGWISE_SEED_*` env vars are unset):
  - Technician: `tech@tagwise.local` / `TagWise123!`
  - Supervisor: `supervisor@tagwise.local` / `TagWise123!`
  - Manager: `manager@tagwise.local` / `TagWise123!`
- **LAN IP discovery:** `ipconfig | findstr IPv4` on the dev laptop. The Android target must be on the same Wi-Fi.
- **Reachability self-check (one-time per session):** from the device/emulator browser, hit `http://<laptop-lan-ip>:4100/health/ready`. Must return 200.

## Scope

In scope:

- Install Maestro (CLI-driven Android UI smoke tool, YAML flows, no native code, free, MIT).
- Add a `mobile/maestro/` directory with one technician golden-path flow.
- If feasible per the objective gate in AC 8, add a supervisor smoke flow.
- Add a `mobile/maestro/README.md` documenting prerequisites (link to this story's Prerequisites block), the exact run command, and how to read results.
- Add minimal, surgical `testID` props to `VisualProductShell.tsx` from the pre-enumerated set in AC 6 — exactly that set, no other shell changes.
- Add a tiny `mobile/maestro/run.ps1` wrapper that performs a backend reachability precheck before invoking `maestro test`.
- Update [`_bmad-output/implementation-artifacts/tests/test-summary.md`](tests/test-summary.md) using its existing table schema verbatim.
- If Maestro cannot be installed in the dev environment (corporate proxy, OS restriction, unresolvable peer-dep), produce `mobile/maestro/MANUAL-FALLBACK.md` using Story 8.7's "Manual Phone Smoke Checklist" 14-step format as the structural template. **Do not pretend device E2E exists if it does not.**

Out of scope:

- Any product behavior change beyond the `testID` props enumerated in AC 6 and an optional Pressable wrapper around `TagWiseLogo` if Story 8.7 has not yet shipped that change.
- Refactoring `VisualProductShell.tsx` or `TagWiseApp.tsx`.
- New screens, new copy, new icons, new routes.
- CI/CD wiring for Maestro (the harness must be runnable from the dev machine; CI is a follow-up).
- Detox, Appium, or any second harness.
- Backend code or contract changes.

## Acceptance Criteria

### A. Harness install and project location

1. Maestro is installed and runnable from the dev machine. `maestro --version` returns successfully in PowerShell.
2. A `mobile/maestro/` directory exists with `01-technician-golden-path.yaml`, `README.md`, `run.ps1`, and `.gitignore` at minimum.
3. The `README.md` documents: a reference to this story's Prerequisites block, the exact command to run a flow, how to interpret pass/fail, and known limitations.
4. The harness directory is added to git. Generated artefacts (`maestro-output/`, screenshots, videos, `*.mp4`, `*.png`, `*.local.*`, `logs/`) are gitignored. The global `~/.maestro` cache is not part of the repo.

### B. Pre-enumerated `testID` set added to `VisualProductShell.tsx`

5. The following `testID` props are added to `VisualProductShell.tsx` as accessibility-only attributes:
   - `tagwise/header/logo-home` on the `TagWiseLogo` (wrap in `Pressable` if Story 8.7 has not yet done so).
   - `tagwise/detail/template-row` on each template row in the instrument detail screen.
   - `tagwise/loop/save-button` on the loop test save button.
   - `tagwise/report/submit-button` on the report submit button.
   - `tagwise/dashboard/calculadora-action` on the dashboard standalone calculator action.
   - `tagwise/dashboard/sync-card` on the dashboard sync diagnostic card (only if Story 8.7 has shipped it; otherwise skip and document in README).
   - `tagwise/report/pending-action` on each pending-action card on the report screen.
6. Naming convention enforced: screen segment matches a `VisualRoute` literal (`dashboard`, `detail`, `loop-test`, `report`, etc.) or `header` for cross-screen items; element is kebab-case noun-only. No two `testID`s collide.

### C. Technician golden-path flow procedure

7. The technician flow `mobile/maestro/01-technician-golden-path.yaml` performs the following procedure on a real Android target, **using the first seeded loop-pattern template available in `backend/src/modules/work-packages/seedData.ts`** (the dev records the exact tag code, template id, range, and tolerance in a YAML comment header):
   - Launch app.
   - Sign in as `tech@tagwise.local` / `TagWise123!`.
   - Open the assigned work-packages list; download or open the seeded package.
   - Open the seeded tag.
   - Tap the seeded loop-pattern template row.
   - Enter `expectedValue` and `measuredValue` for points at 0% and 100% of the loop, using **literal values** from the seeded template's range that produce a deterministic pass at 0% and a deterministic fail at 100% (or both passes — the dev decides and pins the values in the YAML).
   - Tap `Salvar loop`.
   - Open the report screen.
   - Tap `Enviar para fila local`.
   - Capture a final screenshot on success or failure.

### D. Technician golden-path flow assertions

8. The flow asserts (via Maestro `assertVisible` / `assertNotVisible` / `extendedWaitUntil`):
   - After tapping the loop template row, the loop execution screen is reached (`assertVisible: Teste de loop` or equivalent screen marker).
   - After tapping `Enviar para fila local`, a submit feedback message is visible (e.g., `Enviado para fila local` or the message Story 8.7 ships).
   - The report card visibly reflects local-queue state after submit (e.g., `Em fila local` pill or equivalent).
9. The flow uses semantic locators first: visible PT-BR text. It falls back to `testID` only for the elements enumerated in AC 5 or where text is ambiguous (multiple "Salvar" buttons on one screen).
10. The flow uses `maestro studio` recordings as the starting point for selector authoring; the YAML is then hand-trimmed.

### E. Supervisor smoke flow (objective gate)

11. **If** the technician flow (AC 7+8) runs end-to-end green within 30 minutes of selector tuning, the dev authors `mobile/maestro/02-supervisor-smoke.yaml`:
    - Sign in as `supervisor@tagwise.local` / `TagWise123!`.
    - Open the review queue.
    - `assertVisible` that the queue list renders in any state — populated, the PT-BR empty-state copy, or the connected-required state — without app crash.
    - YAML comment documents that real queue content depends on backend reachability and prior technician submissions.
12. **Otherwise**, document the gap in `README.md` and exit the supervisor track. This story prefers shipping one solid flow over two shaky ones.

### F. Backend reachability precheck

13. `mobile/maestro/run.ps1` performs an `Invoke-WebRequest http://<laptop-lan-ip>:4100/health/ready -TimeoutSec 5` precheck **before** invoking `maestro test`. On failure, the script prints a clear PT-BR-friendly message ("Backend não acessível em `<url>`. Verifique se `cd backend && npm run dev` está rodando e se o aparelho está na mesma rede.") and exits non-zero so Maestro never runs against a stale or unreachable backend.
14. The script accepts an optional `-Device <udid>` parameter forwarded as `maestro --device <udid>` so the dev can target a specific emulator or USB-tethered phone when multiple are attached. `adb devices` discovery is documented in the README.

### G. Failure semantics — what the harness catches and what it does not

15. The harness fails (non-zero exit) on any of these:
    - The loop execution screen is not the first screen reached after selecting a loop-pattern template (Story 8.7 AC 6/7 routing).
    - Submit feedback is not visible after `Enviar para fila local`.
    - Backend reachability precheck (AC 13) fails — the harness aborts before Maestro runs.
16. The harness's Story 8.7 regression-guard assertions (logo-tap → dashboard, hardware-back → in-app history, bottom `Calcular` does not open the measurement screen) are **authored against Story 8.7's target behavior**. Until Story 8.7 merges, these assertions ship **commented out** with a `# unblock when 8.7 ships` marker. Once Story 8.7 merges, the dev uncomments them as the very next commit. This avoids the chicken-and-egg of asserting unshipped behavior.
17. The harness is **not** required to catch font scaling, keyboard overlap, camera permission flows, exact pixel layout, or LAN reachability nuances beyond the precheck. Those remain in the manual smoke.

### H. Documentation and traceability

18. `mobile/maestro/README.md` includes:
    - A link to the Prerequisites section of this story.
    - How to install Maestro on Windows (see Dev Notes below for the three viable routes).
    - The exact run command (via `run.ps1`).
    - How `adb devices` discovery and `-Device <udid>` selection work.
    - How to interpret pass/fail (where Maestro writes output, `--debug-output` location for screenshots).
    - The `testID` naming convention (AC 6).
    - Known limitations (AC 17).
19. [`_bmad-output/implementation-artifacts/tests/test-summary.md`](tests/test-summary.md) is updated with a new section "Maestro golden-path harness" using the existing table schema verbatim. The section lists each flow file, its scenarios, and the run command.
20. Story 8.7 references this story as a required Validation gate (already wired in the Story 8.7 draft).

### I. Fallback path if Maestro is not installable

21. If Maestro install fails in the dev environment after the dev attempts the three Windows routes documented in Dev Notes, the story still ships `mobile/maestro/MANUAL-FALLBACK.md` containing:
    - A 14-step phone smoke checklist (technician + supervisor combined) using **Story 8.7's "Manual Phone Smoke Checklist"** as the structural template (numbered steps with expected results per step).
    - A statement at the top: *"Device E2E is not currently automated for this project. Each Story 8.7 PR must run this checklist by hand on a physical phone before merge, with a signed checklist attached to the PR description."*
    - The story must **not** claim device E2E coverage in this case. `tests/test-summary.md` reflects the fallback explicitly.

## Tasks / Subtasks

- [ ] 1. Install Maestro on the dev machine (AC: 1)
  - [ ] Attempt the three Windows install routes in this order:
    - **Route A (recommended):** WSL2 + `curl -fsSL "https://get.maestro.mobile.dev" | bash` inside WSL, then expose `maestro` to Windows PowerShell via a wrapper alias.
    - **Route B:** Scoop install — `scoop install maestro` (if Scoop is available).
    - **Route C:** Manual JAR + Java 11+ from the Maestro release page; add to PATH.
  - [ ] Verify `maestro --version` returns successfully from PowerShell.
  - [ ] **EXIT IF install fails after all three routes → skip to Task 8 (fallback); otherwise continue to Task 2.**

- [ ] 2. Set up `mobile/maestro/` directory, `.gitignore`, and `run.ps1` (AC: 2, 4, 13, 14)
  - [ ] Create `mobile/maestro/`.
  - [ ] Add `mobile/maestro/.gitignore` excluding `maestro-output/`, `logs/`, `*.mp4`, `*.png`, `*.local.*`.
  - [ ] Write `mobile/maestro/run.ps1`: reachability precheck + optional `-Device` forwarding + `--debug-output mobile/maestro/maestro-output`.

- [ ] 3. Add `testID` props to `VisualProductShell.tsx` (AC: 5, 6)
  - [ ] Add the pre-enumerated set from AC 5.
  - [ ] Verify naming convention (AC 6) — no collisions.
  - [ ] If `TagWiseLogo` is still a plain `<Text>` (Story 8.7 not yet merged), wrap it in a Pressable that calls a no-op (or `onPress` from props if it accepts one), with `testID="tagwise/header/logo-home"`. Document in the dev notes that Story 8.7 will wire the `onPress` to `goHome()`.

- [ ] 4. Write technician golden-path flow `mobile/maestro/01-technician-golden-path.yaml` (AC: 7, 8, 9, 10, 16)
  - [ ] Pin seeded scenario (work-package, tag, template, expected/measured values) in YAML header comment.
  - [ ] Use `maestro studio` to record initial selectors.
  - [ ] Author the procedure (AC 7) and the assertions (AC 8).
  - [ ] Mark Story 8.7-dependent assertions as commented out with `# unblock when 8.7 ships`.
  - [ ] Iterate against an emulator or device until stable.

- [ ] 5. Author supervisor smoke flow `mobile/maestro/02-supervisor-smoke.yaml` only if the objective gate is met (AC: 11, 12)
  - [ ] Apply the 30-minute objective gate from AC 11.
  - [ ] If gated out, document the gap in `README.md` and exit Track 5.

- [ ] 6. Document the harness (AC: 18, 19, 20)
  - [ ] Write `mobile/maestro/README.md` covering all items in AC 18.
  - [ ] Update `_bmad-output/implementation-artifacts/tests/test-summary.md` with a "Maestro golden-path harness" section using the existing table schema verbatim.
  - [ ] Cross-reference from this story file and confirm Story 8.7's Validation references this harness.

- [ ] 7. Verify "no product behavior change" guardrail
  - [ ] Run `git diff mobile/src -- ':!*.test.*'` and visually confirm the diff shows **only** added `testID="..."` lines and the optional `Pressable` wrapper around `TagWiseLogo`. Anything else is out of scope and must be reverted.

- [ ] 8. Fallback path if Maestro install fails (AC: 21) — execute only if Task 1 EXIT triggered
  - [ ] Create `mobile/maestro/MANUAL-FALLBACK.md` using Story 8.7's "Manual Phone Smoke Checklist" as the structural template (14 numbered steps, expected results per step).
  - [ ] Add the "not automated" notice at the top.
  - [ ] Update `tests/test-summary.md` to reflect the fallback rather than claim automation.
  - [ ] Update Story 8.7's Validation to require the manual checklist instead.

- [ ] 9. Validation (see Validation section below)

## Dev Notes

### Why Maestro

- YAML-driven, no native compile, no Node bridge, no Appium server, no flake-prone WebDriver. The author can read the flow file and know exactly what it does.
- Works against either an Android emulator or a USB-tethered physical phone.
- Free, MIT-licensed, actively maintained.
- The team has been bitten three times by "tests pass, phone fails." Maestro's selector model is built around visible text and `testID` — the exact layer that has been failing.

### Maestro on Windows — the three viable routes

Native PowerShell install is not first-class on Windows. Attempt in this order:

1. **WSL2 + bash installer (recommended):** install WSL2 (`wsl --install`), then inside WSL run `curl -fsSL "https://get.maestro.mobile.dev" | bash`. Expose `maestro` to Windows by aliasing in PowerShell (`function maestro { wsl maestro $args }`). `adb` must still be reachable from inside WSL or the Maestro flow must run against an emulator visible to WSL.
2. **Scoop:** `scoop install maestro` if Scoop is already on the machine.
3. **Manual JAR + Java 11+:** download the Maestro release JAR, drop it somewhere on PATH, wrap with a `maestro.cmd` shim that invokes `java -jar maestro.jar`.

`adb` must be on the Windows PATH so Maestro can target the emulator/device. Verify with `adb devices` from PowerShell.

### Selector strategy

- Prefer visible PT-BR text (e.g., `Entrar`, `Iniciar`, `Salvar loop`, `Enviar para fila local`, `Aprovado`, `Devolver`).
- Use `maestro studio` to record initial selectors interactively against a running app; port to YAML afterwards.
- Fall back to `testID` only when text is ambiguous (multiple "Salvar" buttons on one screen) or absent (icon-only elements like the TagWise logo).
- Naming convention (AC 6): `testID="tagwise/<screen>/<element>"`. Screen segment matches a `VisualRoute` literal or `header` for cross-screen items. Element is kebab-case noun-only.

### What the harness must catch — anchored to Story 8.7 acceptance criteria

The harness is the executable gate for Story 8.7's highest-risk behavior:

- Logo tap returns to dashboard.
- Android back navigates in-app history before exit.
- The bottom `Calcular`/`Medir` action does not route to the measurement screen by mistake.
- Selecting a loop template opens the loop execution screen.
- Submit produces visible feedback.

The harness does **not** assert: PT-BR completeness, keyboard overlap, camera permissions, font scaling, exact pixel layout. Those remain manual or in unit/component tests.

### Repository structure

- `mobile/maestro/` is the canonical location.
- `mobile/maestro/01-technician-golden-path.yaml` — required.
- `mobile/maestro/02-supervisor-smoke.yaml` — only if the AC 11 objective gate is met.
- `mobile/maestro/README.md` — required.
- `mobile/maestro/run.ps1` — required (reachability precheck + device selection).
- `mobile/maestro/.gitignore` — required.
- `mobile/maestro/MANUAL-FALLBACK.md` — required only if Task 8 is triggered.

### Risks and Mitigations

- **Risk:** Maestro install fails in the dev environment. **Mitigation:** Task 1 EXIT condition + Task 8 fallback explicitly documents the manual checklist. Story does not pretend device E2E exists in that case.
- **Risk:** Selectors break when Story 8.7 changes labels (`Calcular` → `Medir`). **Mitigation:** Selectors target both pre-8.7 and post-8.7 label sets where possible; Story 8.7-dependent assertions are commented out with `# unblock when 8.7 ships` until 8.7 merges (AC 16).
- **Risk:** Backend not reachable from emulator causes Maestro to fail for the wrong reason. **Mitigation:** `run.ps1` precheck aborts before Maestro runs with a clear PT-BR-friendly message (AC 13). The reachability self-check in Prerequisites is the manual variant.

## Validation

Run from repo root. Backend must be running locally per Prerequisites.

```powershell
# 1. Verify Maestro is installed (one-time per machine)
maestro --version

# 2. Verify the device/emulator is attached
adb devices
# Expected: at least one device in 'device' state.

# 3. Verify the APK was built against the LAN URL and is installed on the target
#    EXPO_PUBLIC_TAGWISE_API_BASE_URL=http://<laptop-lan-ip>:4100 must be set at build time.
#    Build: cd mobile; npx eas-cli build --platform android --profile preview
#    Install: adb install <apk-path>

# 4. Run the technician golden-path flow
cd mobile
./maestro/run.ps1
# Optional: target a specific device when multiple are attached
# ./maestro/run.ps1 -Device emulator-5554

# 5. (If supervisor flow was authored under AC 11)
./maestro/run.ps1 -Flow maestro/02-supervisor-smoke.yaml

# 6. Existing automated regression must continue to pass
npm run typecheck
npm test
npx expo-doctor

# 7. Verify the diff contains only testID props (no product behavior change)
cd ..
git diff mobile/src -- ':!*.test.*'
# Expected: only added testID="..." lines and (optionally) a Pressable wrapper around TagWiseLogo.
```

If Maestro install fails (Task 8 fallback):

```
Replace steps 1, 4, 5 above with a hand-run of mobile/maestro/MANUAL-FALLBACK.md.
Attach the signed checklist to the PR.
```

Backend code is not touched. Skip backend validation.

## Definition of Done

- Maestro is installed AND `mobile/maestro/01-technician-golden-path.yaml` runs end-to-end with **all uncommented assertions green** — OR `MANUAL-FALLBACK.md` is delivered with the equivalent manual checklist using Story 8.7's 14-step template.
- Story 8.7-dependent assertions in the YAML are commented with `# unblock when 8.7 ships` and ready to be uncommented as the very next commit after Story 8.7 merges.
- `mobile/maestro/README.md`, `run.ps1`, and `.gitignore` are present and complete.
- `_bmad-output/implementation-artifacts/tests/test-summary.md` has a "Maestro golden-path harness" section using the existing schema.
- `git diff mobile/src -- ':!*.test.*'` shows only `testID` additions and (optionally) the `TagWiseLogo` Pressable wrapper. No other product behavior changes.
- `cd mobile && npm run typecheck && npm test && npx expo-doctor` all green.
- `git diff --check` clean.
- Story 8.7's Validation block references this harness as a required gate.

**Not acceptable as "done":** a harness that fails with a "flaky selector" or "environment issue" excuse. The flow must run end-to-end and either pass all uncommented assertions OR fail with a precisely identified Story 8.7 defect documented in the PR description.

## References

- [`_bmad-output/planning-artifacts/live-phone-story-8-6-regression-root-cause-analysis.md`](../planning-artifacts/live-phone-story-8-6-regression-root-cause-analysis.md) — primary architect source.
- [`8-7-live-phone-field-workflow-repair.md`](8-7-live-phone-field-workflow-repair.md) — companion repair story whose target behavior this harness asserts.
- [`8-6-live-phone-guided-workflow-test-pattern-pt-br-and-submission-ux-repair.md`](8-6-live-phone-guided-workflow-test-pattern-pt-br-and-submission-ux-repair.md) — phone-blocking findings the harness protects against.
- [`tests/test-summary.md`](tests/test-summary.md) — automated regression baseline; updated by this story.
- `backend/src/config/env.ts` — seeded user credentials referenced in Prerequisites.
- `backend/src/modules/work-packages/seedData.ts` — seeded work-package + template scenarios referenced in AC 7.

## Dev Agent Record

### Agent Model Used

(To be filled by dev agent when implementation starts.)

### Debug Log References

### Completion Notes List

### File List
