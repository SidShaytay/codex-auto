# Task Memory

## Context

- Workspace: `/var/mnt/data/projects/personal/codex-auto`, branch `main`, origin `git@github.com:SidShaytay/codex-auto.git`.
- Objective: Security review, English documentation plus Chinese README, source installation, stale-account recovery investigation, automatic safe diagnostics, separate commits and push.
- Authority: User authorized installation, delegation, bug work, commit/push. Respond in English. Credential switching stays local. Never stage `ISSUE.report.md`; user says it is temporary. Do not inspect real credentials or kill unrelated Codex processes.
- Resume: See TASKS.md and continue.
- Owner/writer: root. History: TASKS.log. Next ID:14.

## Delivered

- Translation/guidance88950b3; review0076f0b; flag explanation62d3c9a; launch-policy patchc027439; executable buildbc80420; snapshot installere0214a1; automatic diagnostics986bec9. Code commits pushed to GitHub main through986bec9.
- `npm run install:local` installs a snapshot from this checkout. System command resolves `/var/home/sid/.local/npm/lib/node_modules/codex-auto/dist/index.js`, version0.2.8 with embedded Git revision. Re-run install:local after edits; builds alone do not update the installed copy.
- Launch settings now survive quota resume; six fake-account regressions pass. Missing flags are confirmed; entire stale-daemon/auth issue is not proven resolved.
- Diagnostic context recorded from launch, reports automatically generated on quota/recovery/abnormal exits under `<CODEX_AUTO_HOME>/diagnostics/`. Default30-day expiry, env CODEX_AUTO_DIAGNOSTICS_RETENTION_DAYS=7/30/custom,20 unpinned cap. `diagnostics --keep latest`/`--release latest` control preservation. Cleanup on startup/collection; no background service. Optional CODEX_AUTO_DEBUG=1 prints safe event details. Exports omit credentials/config/env contents/prompts/transcripts/paths/raw session IDs; account/run aliases and build hash included.

## Pending verification

- [!] S07 — Need: real terminal acceptance of account recovery, particularly scenario12 in docs/testing/real-terminal-regression.md. No graphical terminal application access in this shell tool. Next: start installed fork with user's flags, reproduce quota switch, compare /usage and /status; cover required terminal scenarios. Do not claim the reported incident fully fixed yet.
- [!] S11 — Need: real terminal acceptance of diagnostic display/input in scenario13. Code, privacy,retention,trigger and installed fake-account checks passed. Next: verify automatic report notice and optional debug lines preserve terminal redraw/input.

Build passed. Full suite100/101; existing missing-session stderr assertion still fails at tests/session/session.test.ts:1040. Focused diagnostics/CLI41 and logger3 pass. No full supply-chain/native/external-Codex audit. Markdown checks pass. ISSUE.report.md untracked and excluded. Push uses per-command HTTPS gh credential helper because SSH agent unavailable; remote unchanged. GPG prompt unavailable, commits unsigned without changing signing config.

## Completed follow-up

- [x] S12 — Add build-time Git commit/dirty provenance to version output and diagnostics. Root owns all edits. Implemented in cc00a14. Build and focused CLI/diagnostics/package checks passed, including archive fallback and packed metadata. Reinstalled clean source snapshot; both version commands verified outside the checkout. Version embeds the build-time HEAD; .dirty indicates tracked modifications. Final installed build identifies its clean build-time revision; commits are ready for push. Untracked ISSUE.report.md excluded from dirty detection and commits.

- [x] S13 — Root: AGENTS.md now requires TASKS.md for all code changes, bug fixes, and features, before code edits and through verification/commit/handoff. Checked required language and preserved simple resume instruction. Documentation-only; no runtime change.
