# Repository collaboration guidelines

## Basics

Respond in English. Write documentation and contributor guidance in English, and keep `README.zh-CN.md` as its Chinese translation.

Read the relevant source, tests, and repository state before editing, and preserve unrelated user changes. Keep changes focused on what was asked, and report unresolved issues and anything you couldn't verify.

## What needs Sid's permission

Ask before you publish, push, release, create tags, or change live account credentials. Once Sid approves pushing for a task, that approval lasts for the rest of the task. A version bump never implies permission to publish.

Ask before touching a live Codex session in any way: inspecting it, opening new terminal windows, changing layouts, typing into it, or restarting it. Permission to inspect a session doesn't cover the other actions. If Sid has said not to touch a live session, that overrides any earlier permission and includes read-only inspection; work from evidence you already have until access is granted again.

Researching upstream Codex code doesn't permit running unreviewed source, changing upstream repositories, reading private session content, refreshing live credentials, or interrupting a running session.

## Researching Codex behavior

You may read the official Codex source at https://github.com/openai/codex to understand native behavior, including its TUI, app-server, protocol, goal runtime, authentication, and workspace routing code. Use the tag or commit that matches the selected Codex executable, and treat upstream `main` only as a reference. Check assumptions against the executable's actual help output, generated protocol schemas, and isolated tests, because a matching version label doesn't prove identical behavior.

Prefer supported native APIs and structured lifecycle and error events. Avoid parsing terminal text, injecting slash commands, or editing Codex's database directly, because those break silently when Codex changes. If a text fallback is unavoidable, keep it narrow and document its limits. Keep the native TUI experience and account and process isolation until a replacement proves that it preserves identity, routing, launch policy, and safe session ownership.

## Learning from mistakes

Before investigating quota detection, account switching, or resume failures, read [the auto-switch debugging journal](docs/testing/auto-switch-debugging-journal.md). Keep it current: add dated lessons backed by evidence, correct assumptions that turned out wrong, and keep confirmed causes separate from open hypotheses.

When Sid corrects you or an incident is confirmed, write the lesson into the relevant guidance, regression checklist, or task record before handing off, because conversation memory doesn't survive. Keep lessons as narrow as the evidence. Separate confirmed causes, hypotheses, mitigations, and missing verification, and revise earlier claims when new evidence changes the picture.

Turn confirmed defects into regression tests where practical, and show that each test fails on the old code and passes on the new.

A longer timeout is not a complete fix for a race condition. Prefer explicit state, causal events, or structured protocol evidence. If you must use a timing workaround, document its assumptions, how it can still fail, and the task for replacing it.

Record local incidents in `ISSUE.report.md` and never stage that file.

## Tasks

Track every code change in `TASKS.md`, however small. Before editing code, create or update a task there with a stable ID, owner, intended outcome, scope, required verification, and a concrete next action. Update it when scope changes, after important findings or checks, and before committing or handing off. Record the objective, workspace, constraints, approvals, verified state, and remaining checks, but keep secrets and full command logs out. Keep compact history in `TASKS.log`.

Mark a task complete only when its outcome is achieved and its required checks pass. Resuming should never need more than "See `TASKS.md` and continue".

Delegate only when Sid asks or other instructions require it. Give each agent separate files to edit and assign one integration owner.

## Finishing work

Carry approved work all the way through: implementation, diff review, verification, documentation, task updates, and the Git handoff. Don't stop at a diagnosis or a local install while steps you can do remain.

Commit focused changes. Before committing, review the staged diff for unrelated edits, secrets, generated files, and temporary reports. Put separately requested edits in their own commit where useful. With push permission, push before handing off; without it, commit locally and say the work is unpublished. After pushing, confirm the remote branch matches the intended commit and report anything still uncommitted.

Report failing checks and incomplete acceptance plainly. A checkpoint commit can save a tested mitigation with known limits, but it doesn't make the task complete.

If the installed build embeds Git provenance, rebuild and reinstall after the final commit, then confirm outside the checkout that the installed version matches the committed source. Leave running sessions alone unless Sid asks for a restart.

## Verification

For runtime changes, run `npm run build` and `npm test`, plus focused tests as needed. For documentation-only changes, check technical accuracy, local links, and that the translation is complete, and don't claim runtime verification that didn't happen.

Some changes also need a **real terminal regression** test (also called interactive end-to-end regression or terminal acceptance testing), in addition to unit and integration tests. This covers changes to:
- `src/lib/session.ts` or interactive PTY management
- stdin, stdout, stderr, raw mode, or resize handling
- Codex launch behavior, TTY wrappers, or terminal control sequences
- quota detection, automatic account switching, or resume recovery in interactive mode
- anything that affects redraws, input echo, prompts, or status-line refreshes

To run it:
1. Build, and confirm the binary you test comes from the current workspace rather than an older global install.
2. Start `codex-auto` in a real terminal application. Background shells, fake streams, and unit tests alone don't count.
3. Cover at least the required scenarios in `docs/testing/real-terminal-regression.md`.

An interactive change is complete only after this passes. If you lack permission or a suitable terminal, record the test as pending; never launch a GUI to get around the restriction.

`docs/testing/real-terminal-regression.md` is the authoritative checklist. Add new real-world scenarios you discover (terminal compatibility, input methods, split panes, dynamic redraws), and update steps or acceptance criteria when a change affects an existing scenario.

## User documentation

When a change adds, removes, or alters user-visible behavior, commands, runtime requirements, or usage, update `README.md` and `README.zh-CN.md` together. The README is a product guide, not a bug-fix log: lead with what users get and common tasks, and mention internals such as PTYs, symlink overlays, or transport names only when installation, compatibility, or reference material needs them. Keep paths, commands, and historical facts intact when translating.

## Security and sensitive data

Account authentication files, tokens, session transcripts, and runtime configuration are sensitive. Never copy their contents into documentation, task records, test fixtures, logs, or review output. Tests use temporary directories and fake credentials. Security scans must not log in, rotate real accounts, or run live sessions without permission.

Credential import, activation, and switching stay local filesystem operations. Don't add credential uploads, telemetry containing secrets, remote credential backups, or unexpected executable downloads. The Codex CLI's own authentication with its provider is a separate trust boundary; document any change to it explicitly.

When changing a trust boundary, review path validation, symlink handling, permissions, subprocess arguments, credential persistence, and network destinations. Inspect package scripts and lockfile changes before installing, never run unreviewed lifecycle scripts, and explain any required native build step.

Write security findings with the evidence, affected scope, prerequisites, impact, and a practical recommendation. Keep confirmed defects separate from conditional risks and unverified concerns.

## Versions and changelog

Follow Semantic Versioning: patch for compatible fixes, minor for compatible features, major for incompatible changes. Before 1.0, use a minor bump for incompatible changes and a patch for compatible fixes, and describe the change clearly.

Update `package.json` and the root entries in `package-lock.json` together. Record user-visible changes and migration notes in `CHANGELOG.md`. Keep build commit hashes as metadata rather than changing the base version.
