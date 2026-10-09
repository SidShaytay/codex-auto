# Task Memory

## Context

- Workspace: `/var/mnt/data/projects/personal/codex-auto`, branch `main`, origin `git@github.com:SidShaytay/codex-auto.git`.
- Objective: preserve the unresolved auto-switch recurrence and maintain evidence-backed debugging guidance; no new runtime change requested.
- Authority: documentation, installation and commit/push authorized. Latest user instruction supersedes live-terminal approval: DO NOT inspect, access, drive, send input to, resize, or restart Zellij `sid-main`; it is doing real work. Use existing evidence only. No GUI launches, releases, credential changes or unrelated process kills. Never stage `ISSUE.report.md`.
- Owner/writer: root. History: `TASKS.log`. Next ID:21.
- Resume: See TASKS.md and continue.

## Current work

- [x] S20 — Root: rewrote local `ISSUE.report.md` and add [the auto-switch debugging journal](docs/testing/auto-switch-debugging-journal.md), linked from `AGENTS.md`. User reports another retry succeeded; stop reproduction and preserve unresolved cause. Scope: documentation/task records only. Required verification: source-backed procedure, links/fences/privacy/staged diff, commit/push and final installed provenance without touching live sessions. Source-backed documentation, local links/anchors/fences, privacy and whitespace checks pass. No runtime tests needed for these documentation-only changes; prior runtime limits unchanged. No Zellij access performed. Handoff: commit/push this documentation checkpoint and refresh only installed snapshot provenance without restarting the active process; resume recurrence work only after fresh permission.
- [!] S19 — Root: recurrence paused after user-reported successful retry. Version0.3.2 fresh bound-thread event recovery is delivered; native test confirmed one account switch and same-thread resume. Later prior-authorized logs confirm actual first→second rotation followed by fresh usage_limit_exceeded completions on the resumed invocation, then all_exhausted. Effective second-account provider identity and availability remain unverified; successful retry was not agent-captured. No speculative detector fix. Next if recurrence: obtain current permission and build a new causal timeline before input/restart.

## Verified state

- Runtime73ef384 and acceptance6a1a48a pushed; installed clean0.3.2+git.6a1a48a verified outside checkout. Build passed; final Bash130/131, sole known S16 warning assertion fails. Five fresh-event PTY and nine reader cases passed. Native quota-driven switch/resume succeeded on original bound thread; historical replay did not cause another switch during that acceptance.
- History review:6af7593 introduced latest-prompt slicing;27a36c9 cursor-boundary normalization broadens its blind spot. Synthetic no-LF trace changes from detect→miss across that patch; LF trace is missed by both. The older live wrapper predates the patch, so the patch cannot explain that running instance.
- Prior terminal acceptance covers focused recovery, Ctrl-C130, shell Unicode input and same/different-workspace binding. Full Codex redraw/IME acceptance is not established. Prior unwanted Ghostty launch correction is recorded; no GUI/session access is authorized now.
- Local incident report remains untracked/excluded. User reports retry success without a known cause; distinguish that from verified runtime acceptance.

## Pending follow-up

- [!] S17 — Causal classification for unbound/eventless sessions and broader real Codex IME/narrow/concurrent acceptance. Five-second text fallback remains a mitigation.
- [ ] S16 — Existing missing-session warning assertion; preserve safe-resume behavior and investigate separately.
- [!] S07/S14 — Broader credential/daemon-policy scenario12 acceptance remains pending.
- [!] S11 — Scenario13 display/input acceptance remains pending; privacy/retention checks passed.
- [ ] Fish subprocess-stop/timeouts — Investigate with fake credentials before claiming a clean default-shell full suite.
