# Repository Collaboration Guidelines

## Communication and scope

- Respond in English. Write primary documentation and contributor guidance in English; maintain `README.zh-CN.md` as the Chinese translation.
- Inspect relevant source, tests, and repository state before editing. Preserve unrelated user changes.
- Keep changes focused on the requested outcome. Report unresolved issues and verification limits explicitly.
- Never publish, push, release, or change live account credentials unless the user authorizes that action.

## Learning from corrections

- Before investigating quota detection, account switching, or resume failures, read [the auto-switch debugging journal](docs/testing/auto-switch-debugging-journal.md). Maintain it as a living guide: append dated evidence-backed lessons, revise disproved assumptions, and keep confirmed causes separate from unresolved hypotheses. Record local incidents in `ISSUE.report.md` without staging that file; keep execution state in `TASKS.md`.
- A current prohibition on touching a live session overrides earlier access/driving permission and includes read-only inspection. Use already collected evidence until the user grants access again.

- Treat user corrections and confirmed incidents as inputs to durable improvement. Record the specific lesson in the relevant repository guidance, regression checklist, or task record before handing off; do not rely on conversational memory alone.
- Turn a confirmed defect into a regression test where practical. Establish that the test fails with the previous implementation and passes with the proposed change.
- Keep lessons scoped to the evidence. Distinguish confirmed causes, hypotheses, mitigations, and missing verification; revise earlier claims when new evidence changes the conclusion.
- Do not describe a longer timeout as a complete race-condition fix. Prefer explicit state, causal events, or structured protocol evidence. If a timing workaround is necessary, document its assumptions, remaining failure modes, and the task for replacing it.

## Development workflow and handoff

- Carry authorized development work through implementation, review of the diff, appropriate verification, documentation, task checkpoints, and Git handoff. Do not end at diagnosis or local installation when required steps remain executable.
- Commit focused changes as the standard handoff. When the user has authorized pushing, that authorization persists within the task: commit and push before handing off without asking again. Without push authorization, commit locally and report the unpublished state. Commit and push do not authorize releases, tags, or package publication.
- Before committing, inspect the staged diff for unrelated edits, secrets, generated artifacts, and temporary reports. Preserve user changes; include separately requested edits in their own commit where useful. Never stage `ISSUE.report.md`.
- Record failing checks and incomplete acceptance explicitly. A checkpoint commit may preserve a tested mitigation with known limits, but does not make its task complete or its checks pass.
- After pushing, verify the remote branch matches the intended commit and inspect repository status. Report remaining changes explicitly; do not silently leave requested work uncommitted.
- When a locally installed build embeds Git provenance, rebuild and reinstall after the final source commit, verify its version outside the checkout, and confirm the installed revision reflects the committed source. Keep existing live sessions running unless the user requests a restart.

## User documentation

- Whenever a change adds, removes, or alters user-visible behavior, commands, runtime requirements, or usage, update `README.md` and its maintained Chinese translation `README.zh-CN.md` together.
- Describe capabilities, behavior, and usage in the README. It is a product guide, not a bug-fix log or development journal.
- Lead with user value and common tasks. Include implementation details such as PTYs, symlink overlays, or internal transport names only when installation, compatibility, or reference material requires them.
- Preserve valid paths, copyable commands, and historical facts when translating documents.

## Security and sensitive data

- Treat account authentication files, tokens, session transcripts, and runtime configuration as sensitive. Never copy their contents into documentation, task records, test fixtures, logs, or review output.
- Use temporary directories and fake credentials for tests. Do not log in, rotate real accounts, or run live sessions as part of a security scan without authorization.
- Credential import, activation, and switching must remain local filesystem operations. Do not add credential uploads, telemetry containing secrets, remote credential backups, or unexpected executable downloads. The selected Codex CLI's normal authentication to its configured provider is a separate trust boundary; document changes to that boundary explicitly.
- Review filesystem path validation, symlink handling, permissions, subprocess arguments, credential persistence, and network destinations when changing those boundaries.
- Do not execute unreviewed dependency lifecycle scripts. Inspect package scripts and lockfile changes before installation; explain any required native build step.
- Security findings must include evidence, affected scope, prerequisites, impact, and a practical recommendation. Separate confirmed defects from conditional risks and unverified concerns.

## Versions and changelog

- Follow Semantic Versioning: patch for compatible fixes, minor for compatible features, major for incompatible changes. Before 1.0, use a minor bump for incompatible behavior and a patch for compatible fixes; document the change clearly.
- Update `package.json` and root package entries in `package-lock.json` together. Record user-visible changes and migration notes in `CHANGELOG.md`; keep build commit hashes as metadata rather than changing the base version.
- Version changes do not authorize publishing, release tags, or npm releases. Keep README usage current and changelog history separate.

## Verification

- Run checks appropriate to the change. For runtime changes, use `npm run build` and `npm test`, plus focused tests as needed.
- For documentation-only changes, check technical accuracy, local links, and translation completeness. Do not claim runtime verification unless it actually ran.
- Any change affecting interactive terminal behavior must pass both automated tests and real terminal regression before it can be declared complete.
- Permission to inspect an existing terminal session does not authorize new terminal windows, layout changes, input injection, or restarting that session. Ask before those actions unless the user explicitly requested them. If permission or a suitable terminal is unavailable, record real terminal regression as pending rather than launching a GUI to bypass the limitation.

### Changes requiring real terminal regression

- Changes to `src/lib/session.ts` or interactive PTY management.
- Changes to stdin, stdout, stderr, raw mode, or resize handling.
- Changes to Codex launch behavior, TTY wrappers, or terminal control sequences.
- Changes to quota detection, automatic account switching, or resume recovery in interactive mode.
- Any logic that changes redraws, input echo, prompts, or status-line refreshes.

### Required procedure

1. Build and verify that the tested binary comes from the latest workspace, rather than an older global installation.
2. Start `codex-auto` in a real terminal application. Background shells, fake streams, and unit tests alone are insufficient.
3. Cover at least the required scenarios in `docs/testing/real-terminal-regression.md`.
4. Declare an interactive issue fixed only after real terminal regression passes. If that check cannot run, record the missing verification explicitly.

## Regression checklist maintenance

- `docs/testing/real-terminal-regression.md` is the authoritative interactive terminal regression checklist.
- Add newly discovered real-world scenarios involving terminal compatibility, input methods, split panes, or dynamic redraws.
- Update steps or acceptance criteria whenever a change affects an existing scenario.
- Use the terms **real terminal regression**, **interactive end-to-end regression**, or **terminal acceptance testing**. These checks are additional to unit and integration tests, not replacements.

## Durable task memory and delegation

- Every code change, bug fix, and feature addition must be tracked through `TASKS.md`, including small or single-session changes. Before editing code, read `TASKS.md` and create or update a task with a stable ID, owner, intended outcome, scope, required verification, and concrete next action.
- Keep `TASKS.md` as the authoritative execution record. Update it when scope changes, after material findings and verification, and before committing or handing off. Record remaining checks explicitly; mark a task complete only after its required outcome and verification are satisfied.
- Resume instructions must be exactly as simple as `See TASKS.md and continue`.
- Record the objective, workspace, constraints, approvals, verified state, and concrete next action. Keep secrets and full command logs out of task records.
- Give tasks stable IDs and clear owners. Delegate only when requested or required by applicable instructions; assign disjoint edit scopes and a single integration owner.
- Checkpoint material discoveries and handoffs. Mark work complete only after its required outcome and verification are satisfied; preserve compact history in `TASKS.log`.
