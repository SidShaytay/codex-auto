# Bootstrap recovery and unattended launch acceptance

## Scope

S29 tests normal launch update defaults and safe recovery from the exact reported fatal workspace-routing bootstrap401 envelope. It does not establish why a real provider returned401 or reconstruct the original incident's unsaved terminal bytes.

Implementation: complete ECMA-48 CSI stripping, bounded raw-tail normalization across output chunks, and explicit-opt-in update checks. The fatal matcher, account selection/exclusions, credential replacement, bound-thread policy and goal helper are unchanged. Raw output remains in bounded process memory (65,536 characters); exported invocation output remains capped at20,000 normalized characters. No terminal transcript is newly persisted.

## Old-fails/new-passes

With the new fake fixture/tests but unchanged runtime, three checks fail: default update checks fetch/prompt/install; private/intermediate native teardown defeats the fatal envelope matcher; split escape sequences stop quota→authorization recovery on account B instead of resuming C. The initial patched focused detection/update/bootstrap suite passes20/20; CLI/update checks pass47/47. A later regression adds the unmodified native bootstrap-error tail to default coverage. These synthetic cases prove normalization defects, not the original incident's exact byte layout.

An isolated actual Codex0.162.1 configuration-failure rendering probe emitted CSI `<1u`, `<u`, `>4;0m`, and `0 SP q`. The older strip-ansi implementation leaves fragments such as `1u`, `u`, `4;0m`, and `q` behind. The fixture combines these verified control sequences with the user-supplied fatal message. No real credentials or conversation content were loaded.

## Native bootstrap reproduction closes the incident evidence gap

The initial completion audit rejected an incident-specific claim based only on assembled terminal sequences. The follow-up reproduces the actual selected Codex0.162.1 `account/read` bootstrap failure, rather than placing guessed sequences around an error string.

`tests/helpers/native-bootstrap.mjs` creates fake ChatGPT auth in isolated homes and a localhost backend returning401 for `/backend-api/wham/accounts/check`. The selected native executable runs only as account B; quota account A, goal-state bridge and continuation account C remain controllable fixtures. Native subprocess environment omits real API keys/configuration and overrides ChatGPT routing to the localhost origin. No live account or session is accessed. The native process itself emits the exact reported fatal envelope plus `<1u`, `<u`, `>4;0m`, `0 SP q` teardown; no error text or control sequences are injected into its output.

Against archived unchanged34cab84, the wrapper records native exit1 with authorization false and stops at B after two launches. The same native/backend setup on the patch records authorization true (quota false), switches B→C on the bound thread, preserves goal/policy, and completes synthetic autonomous progress after three launches. [Old/new metadata](evidence/bootstrap-native-old-new.json) records this comparison. [The unmodified native tail](../../tests/fixtures/native-bootstrap-401-tail.json) is a credentials-free default regression fixture; `tests/runtime/bootstrap-native.test.ts` reruns the actual executable when `CODEX_GOAL_NATIVE_BIN` is supplied.

[Native real-terminal evidence](evidence/bootstrap-native-terminal.json) repeats old-fails/new-passes in approved Ghostty on Bash and Fish: four control assertions pass, meaning baseline recovery fails twice and patched recovery succeeds twice. All streams are actual TTYs and terminal modes restore. Driver: `scripts/test-bootstrap-native-terminal.mjs`; its optional third argument selects the archived baseline `dist/lib/session.js`. Reports bind runtime, fixture/driver and baseline code hashes. This establishes recovery for the reported native failure path without claiming the original incident bytes were recovered or explaining the real provider's401.

## Real terminal regression

Approved separate Ghostty terminal; stdin/stdout/stderr are actual TTYs. Driver: `scripts/test-bootstrap-terminal.mjs`. Evidence: [sanitized report](evidence/bootstrap-recovery-terminal.json), including build provenance and SHA-256 hashes of tested compiled code.

```sh
npm run build
# Run in a separately approved real terminal:
node scripts/test-bootstrap-terminal.mjs /tmp/bootstrap-recovery-terminal.json
```

17/17 cases pass:

- Bash/Fish plain quota→401→third-account recovery and split-native-control recovery, preserving bound thread, explicit approval/sandbox/model/config policy, one no-daemon flag, goal objective/accounting and synthetic autonomous progress.
- Bash/Fish all-unauthorized and quota-plus-unauthorized stops, generic-error stops, unbound safe-stop, and historical-quota replay without rotation.
- Cached newer npm release does not block normal startup or resume without an update-disable setting.
- Explicit opt-in update later/skip/install choices work with injected answers and a fake installer; skipping suppresses a repeated reminder. No registry request or npm installation occurs.
- Terminal modes restore after every case. Isolated homes are removed afterward; existing sessions remain untouched.

This covers changed checklist scenarios7/15 and relevant synthetic rotation/goal/cleanup controls. It does not claim physical keyboard/backspace/IME, split-pane visual acceptance, live effective identity/quota, or all broader pre-existing checklist scenarios. The fixture goal progress is synthetic; native goal behavior is checked separately below.

## Automated checks and limits

`npm run build` passes. Full suite with `SHELL=/bin/bash` and selected Codex0.162.1 native goal tests enabled passes194/194, including the actual native bootstrap regression. Native tests use isolated homes and a localhost fake provider.

Final unqualified `npm test` in this Fish environment:187 pass,3 timeouts,4 native tests skipped. All three timeout cases also fail on an archived unchanged34cab84 baseline: quota-before-exit pipe lifecycle, delayed noninteractive binding, and the pipe-backed Ctrl-C case. No timeout increase or unrelated lifecycle change was made. Separate real Fish-terminal cases pass as listed above; those do not turn the failing pipe tests into passes.

Security/diff review: no change to account paths, symlink handling, credential persistence, subprocess command construction, remote destinations, or run-lifetime authorization exclusions. Default update checks now avoid npm registry access entirely; deliberate opt-in retains the existing updater trust boundary. Recovery still requires failed invocation plus the exact fatal terminal-tail envelope; generic/historical progress controls remain negative. Local incident reports, their diagnostic copies and `.pi/` state stay unstaged.
