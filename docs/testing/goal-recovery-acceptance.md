# Goal-recovery acceptance — 2026-10-09

## Scope and limits

All checks use synthetic accounts/goals and isolated homes. Native checks use a loopback-only synthetic Responses provider. No live sessions, credentials, objectives or provider quota were inspected or changed.

The earlier 11-case temporary report is no longer available. It is historical evidence only, not the basis of this acceptance record. The replacement driver is committed as `scripts/test-goal-terminal.mjs`.

Profile-based launches remain a documented limitation. Native Codex0.162.1 describes `-p` as a separate configuration-file layer. Its app-server entrypoint passes default loader overrides and exposes neither the corresponding CLI option nor a config-read profile parameter. Do not replace it with the legacy `profile` config field or silently ignore the selected layer. The user explicitly deferred profile+goal recovery and later authorized completion with this limitation. Profile support is not part of current acceptance.

## Real terminal evidence

A separate Ghostty terminal ran the current built `dist` entrypoint with actual stdin/stdout/stderr TTYs. `scripts/test-goal-terminal.mjs` exercised eight cases on both Bash and Fish:16/16 passed. Each case checks expected exit code, launch count, same-thread resume, objective/budget/accounting preservation and restored `stty` settings. The sanitized [16-case report](evidence/goal-terminal-2026-10-09.json) is durable repository evidence.

| Scenario | Bash | Fish | Result |
| --- | --- | --- | --- |
| Active goal interrupted by quota | Pass | Pass | Restored active before same-thread resume |
| Paused goal | Pass | Pass | Left paused |
| Blocked goal | Pass | Pass | Left blocked |
| Completed goal | Pass | Pass | Left completed |
| Budget-limited goal | Pass | Pass | Left budget-limited |
| No goal | Pass | Pass | No goal created |
| Confirmed native goal-set failure | Pass | Pass | Stops before resume |
| Unsupported native goal API | Pass | Pass | Warns and resumes conversation only |

The synthetic resumed CLI schedules goal progress only when active. This terminal fixture is not evidence of the real provider's autonomous behavior; the native check below supplies that separate evidence. Terminal cancellation, visual redraw and IME behavior are not covered by this replacement driver.

The existing eight-case separate Ghostty bootstrap-authorization report also passes Bash/Fish quota→authorization→third-account recovery, all-authorization bounded exhaustion, generic failure and unbound safe-stop. Terminal settings restore in every case. Its durable [8-case report](evidence/bootstrap-terminal-2026-10-09.json) contains only shell/scenario/exit/launch/boolean metadata.

## Native execution evidence

`tests/runtime/goal-loop-native.test.ts`, explicitly enabled through `CODEX_GOAL_NATIVE_BIN`, runs the actual native executable against a local HTTP Responses fixture. It persists a synthetic usage-limited goal, unloads the thread, invokes the wrapper's recovery helper, then resumes that thread and sends one ordinary `Continue` request. Multiple distinct completed native turns occur without further user requests. Empty responses intentionally hit the native empty-continuation breaker, so the final status is blocked rather than an endless loop.

The negative control omits recovery: the same ordinary `Continue` produces one turn and retains usageLimited. The positive check requires at least three distinct completed turns; native resume may itself start an active goal before the explicit Continue, so an exact turn count would incorrectly depend on scheduling.

The separate native state test checks unchanged goal content, budget/counters and no loaded threads in the helper. This combination distinguishes state restoration from actual autonomous scheduling. The selected executable was rechecked as0.162.1; earlier0.161.0 results are historical, not current compatibility claims. The final Bash suite with native tests explicitly enabled passes184/184; build, terminal-driver syntax and documentation-link checks pass. The test waits for the persisted blocked state because a turn/completed notification can arrive before the goal breaker's state update.

Run native checks only with an explicitly selected executable. Tests isolate HOME and CODEX_HOME and do not load live credentials:

```bash
SHELL=/bin/bash CODEX_GOAL_NATIVE_BIN=/path/to/codex npm test -- tests/runtime/goal-loop-native.test.ts tests/runtime/goal-recovery-native.test.ts
```

Run the terminal driver only in an authorized separate real terminal, after `npm run build`:

```bash
node scripts/test-goal-terminal.mjs /tmp/goal-terminal-report.json
```
