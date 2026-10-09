# Task Memory

## Context

- Workspace: `/var/mnt/data/projects/personal/codex-auto`, branch `main`, origin `git@github.com:SidShaytay/codex-auto.git`.
- Objective: fix run-lifetime exhaustion after supported reset times and explain every account-selection decision. Do not equate local observations with live provider capacity.
- Authority: local implementation, documentation, tests and checkpoint commit. No new push or installation approval for this checkpoint. Existing prohibition remains: DO NOT inspect, access, drive, send input to, resize, or restart Zellij `sid-main`. No GUI launches, live credential/configuration/transcript inspection, network quota queries, unrelated process kills or releases. Never stage `ISSUE.report.md`.
- Owner/writer: root/integration owner. History: `TASKS.log`. Next ID:24.
- Resume: See TASKS.md and continue.

## Current work

- [ ] S23 — Root: investigate goal continuity after quota-driven resume; user reports an overnight pause around01:40 (date/timezone not established). Scope: source diagnosis and proposed fix only. Confirmed: `launchResumeInvocation` always supplies ordinary prompt `Continue`; wrapper has no goal-state reader or goal-reactivation path. This explains a missing recovery mechanism, not independently the reported incident or native Codex semantics. Constraints: existing live-session/transcript prohibition remains; no installation, push, terminal input or restart. Recommendation: verify selected Codex's supported goal-state and reactivation interface, retain same-thread goal recovery intent on quota, restore only a quota-suspended previously active goal, and verify restored state before declaring recovery. Never enable absent/completed/user-paused goals; do not directly edit native goal database or assume a slash command works as a CLI prompt. Required verification for implementation: old-fails/new-passes fake regressions, build/full suite, current-Codex compatibility and approved real terminal regression. Next: obtain permission for narrowly scoped historical event/goal-state metadata inspection, establish incident date/timezone, and verify native resume semantics before implementation.

- [!] S22 — Root: reset-aware rotation and switch-state evidence implemented locally as0.3.3. Scope: rotation/session/logger/diagnostics, fake regressions, README translation, versions/changelog and terminal checklist. Per-run quota observations retain reset evidence independently of state normalization. Selection reconsiders elapsed supported resets, replaces evidence on fresh errors, and uses current account order. Missing/invalid/non-future reset times remain blocked against immediate loops. Switch/stop snapshots record candidate eligibility and quota/reset timestamps, with `liveQuotaRefreshed: false`; reports/debug output alias identifiers and cap64 candidates. Need: real terminal regression permission; existing test failures remain unresolved. Focused diff reviewed; implementation checkpoint623c1ed committed locally and unpublished. Next: seek permission for terminal scenarios6/13 before declaring interactive acceptance. No install/push/restart.
- [!] S19 — Effective provider identity, authenticity of earlier quota errors and precise reset timing remain unverified. Latest saved timeline proves an old exclusion caused the skipped retry; user-reported100% capacity was not independently captured. Do not claim provider exhaustion or universal recovery.

## Verified state

- Six reset-crossing regressions fail against unmodified74762b8 and pass with the patch, covering Bash pipes, Bash/Fish PTYs and repeated quota with stale reset evidence. Focused30 tests pass.
- Build passes. Final full Bash145/146; only pre-existing S16 missing-session warning assertion fails. Default Fish run139/142 before four extra PTY cases: S16 and two pipe-lifecycle timeouts. Both timeouts reproduce against the unchanged Git baseline. No larger-timeout workaround applied.
- Docs links/fences, translated selection fields, version/lockfile consistency and whitespace pass. Real terminal regression has NOT run. No live session or real credentials touched. Installed binary remains0.3.2+git.5ccc0cafeb48, verified outside checkout; local changes are not installed.
- S20 journal checkpoint5ccc0ca and S21 saved-evidence diagnosis are archived in `TASKS.log`. Local incident report remains untracked/excluded.

## Pending follow-up

- [!] S17 — Causal detection for unbound/eventless sessions and broader real Codex IME/narrow/concurrent acceptance. Five-second text fallback remains a mitigation.
- [ ] S16 — Existing missing-session warning assertion; preserve safe-resume behavior.
- [!] S07/S14 — Broader credential/daemon-policy scenario12 acceptance.
- [!] S11 — Scenario13 display/input acceptance; automated privacy/retention checks pass.
- [ ] Fish subprocess-stop/timeouts — Baseline-confirmed pipe lifecycle failures need isolated investigation.
- Live quota refresh needs a verified interface and explicit credential/provider trust-boundary review; no usage-percentage refresh is implemented.
