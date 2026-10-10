# Bootstrap recovery and unattended launch acceptance

## Scope

S29 tests normal launch update defaults and safe recovery from the exact reported fatal workspace-routing bootstrap401 envelope. It does not establish why a real provider returned401 or reconstruct the original incident's unsaved terminal bytes.

Implementation: complete ECMA-48 CSI stripping, bounded raw-tail normalization across output chunks, and explicit-opt-in update checks. The fatal matcher, account selection/exclusions, credential replacement, bound-thread policy and goal helper are unchanged. Raw output remains in bounded process memory (65,536 characters); exported invocation output remains capped at20,000 normalized characters. No terminal transcript is newly persisted.

## Old-fails/new-passes

With the new fake fixture/tests but unchanged runtime, three checks fail: default update checks fetch/prompt/install; private/intermediate native teardown defeats the fatal envelope matcher; split escape sequences stop quota→authorization recovery on account B instead of resuming C. The patched focused detection/update/bootstrap suite passes20/20; CLI/update checks pass47/47. These synthetic cases prove normalization defects, not the original incident's exact byte layout.

An isolated actual Codex0.162.1 configuration-failure rendering probe emitted CSI `<1u`, `<u`, `>4;0m`, and `0 SP q`. The older strip-ansi implementation leaves fragments such as `1u`, `u`, `4;0m`, and `q` behind. The fixture combines these verified control sequences with the user-supplied fatal message. No real credentials or conversation content were loaded.

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

`npm run build` passes. Full suite with `SHELL=/bin/bash` and selected Codex0.162.1 native goal tests enabled passes192/192. Native tests use isolated homes and a localhost fake provider.

Unqualified `npm test` in this Fish environment:186 pass,3 timeouts,3 native tests skipped. All three timeout cases also fail on an archived unchanged34cab84 baseline: quota-before-exit pipe lifecycle, delayed noninteractive binding, and the pipe-backed Ctrl-C case. No timeout increase or unrelated lifecycle change was made. Separate real Fish-terminal cases pass as listed above; those do not turn the failing pipe tests into passes.

Security/diff review: no change to account paths, symlink handling, credential persistence, subprocess command construction, remote destinations, or run-lifetime authorization exclusions. Default update checks now avoid npm registry access entirely; deliberate opt-in retains the existing updater trust boundary. Recovery still requires failed invocation plus the exact fatal terminal-tail envelope; generic/historical progress controls remain negative. Local incident reports, their diagnostic copies and `.pi/` state stay unstaged.
