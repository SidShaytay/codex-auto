# Task Memory

## Resume entrypoint

**See TASKS.md and continue**

- Workspace: current repository, branch `main`. Owner: root/integration owner. History: `TASKS.log`. Next ID: 36.
- Objective: implement and verify both S33 quota-detection defects below so a normal interactive launch can recover from a fresh quota error without waiting for Codex to exit, without switching on historical or unrelated errors, and without resuming the wrong conversation.
- Current request: prepare this implementation handoff now; do not implement runtime changes in this planning turn. On the user's subsequent “See TASKS.md and continue”, start the local implementation plan below. Do not stop at diagnosis.
- Scope/authority: focused local source/tests/docs changes and local commits. No push, installation, release, architectural migration, real credential/config access, login/refresh, live provider quota requests or delegation approved for this new work. Historical task-specific approvals do not transfer.
- Live-session safety: leave TotalRecall and all other existing sessions untouched. The completed read-only snapshot is sufficient to start. Do not inspect live sessions again, send input, resize, restart, kill unrelated processes or open GUI windows. Ask for separate approval before isolated real terminal regression; continue independent implementation/testing meanwhile. Fake accounts and temporary homes only.
- Never stage `ISSUE.report.md`, `bug-reports/`, `.pi/` or other private incident files. Preserve unrelated changes.

## S33 — TotalRecall quota recovery milestone [ ]

Owner: root/integration owner. Children: S34 and S35. Complete only when both defects and their joint recovery/negative-control acceptance pass. Do not claim the original S31 incident is explained by this recurrence.

### Preserved evidence and limits

- Private snapshot: `bug-reports/2026-10-13-totalrecall/pane.txt`; selected lifecycle metadata: `native-error-metadata.json`. Read only necessary allowlisted metadata; do not print transcripts, prompts, objectives, credentials or raw identifiers.
- Wrapper PID565930 launched2026-10-13 at19:12:31Z with `resume=false`, `sessionBound=false`, default intercepted PTY transport. Inspection found its running record still unbound and only a launch event in the wrapper log; no quota detection or switch.
- Main CLI thread completed with fresh `usage_limit_exceeded` at22:15:37.902Z. A separate subagent completion failed at22:16:00.466Z; do not substitute subagent ownership for main-thread evidence.
- Console snapshot displays quota followed by a prompt. Synthetic reconstruction matches quota over the whole text but not after latest-prompt slicing. Original PTY bytes were not retained: this proves a detector blind spot, not the exact incident byte sequence.
- Installed package was0.4.0, clean38a3dc1. This is on-disk provenance, not independent verification of loaded bytes. Diagnosis checkpoint1ec857c changes documentation only.

### S34 [ ] — Console detection discards fresh quota before a redraw prompt

Owner: root/integration owner.

**Defect:** `src/lib/session.ts` evaluates `getOutputSinceLatestPrompt(sanitizedOutput)`; `src/lib/detection.ts` slices after the last `›`/`>` prompt. Codex can display a new quota error and then redraw its prompt. The detector drops that real error as though it were historical replay. This affects the text fallback whether a conversation ID is known or unknown.

**Required outcome:** a fresh quota followed by a prompt triggers recovery while the child stays alive. Historical quota replay must not trigger recovery. A prompt redraw alone is not proof that earlier output is historical.

**Plan:**
1. Inspect existing replay/freshness tests and PTY normalization before designing a replacement. Create a failing synthetic regression for quota→prompt, LF/no-LF cursor redraw and split chunks, independent of the structured reader.
2. Replace the latest-prompt heuristic with an explicit, evidence-backed freshness model. Prefer causal turn/error evidence where available; document the text-only limits. Do not blindly scan all accumulated history, disable replay guards or present a larger timeout as a fix.
3. If terminal bytes alone cannot distinguish fresh and replayed errors safely, record that limitation explicitly and define safe behavior; S35 must provide normal-launch coverage. Do not claim universal text-only detection without evidence.

**Verification:** old-fails/new-passes positives; historical replay including delayed replay beyond five seconds; ordinary quoted/tool quota text; chunked ANSI/control sequences; repeated redraws; prompt after genuine error; immediate exit and child staying alive; cancellation without unintended rotation. Reuse `tests/runtime/detection.test.ts`, `tests/session/session.test.ts`, and `tests/fixtures/fake-codex.mjs` where appropriate.

**Next:** inspect these tests and current output state, then add failing quota→prompt regressions before source edits.

### S35 [ ] — Plain unbound launches lack structured monitoring while running

Owner: root/integration owner. Can proceed independently of S34 design; integrate under S33.

**Defect:** `runInvocation` creates `createQuotaEventReader` only when `boundSessionId` exists before launch. `runManagedSession` discovers an initial unbound conversation after invocation exit. Plain launch and unbound picker paths therefore miss fresh structured errors while Codex waits at its prompt. Existing bound-resume tests do not cover this path.

**Required outcome:** monitor the actual main conversation during the initial invocation, detect its fresh structured quota error before child exit, stop the child through the existing lifecycle, and switch/resume that same conversation with policy and goal continuity preserved.

**Plan:**
1. Inspect `src/lib/session.ts` discovery/launch paths, `src/lib/quota-events.ts`, run persistence/logging, and selected native Codex capabilities. Consult the debugging journal first; use relevant pinned official source/schema and isolated probes where needed.
2. Establish explicit invocation-owned main-thread identity during execution, or a supported error stream directly owned by the launched process. Do not select by newest shared session file, workspace/mtime alone, remembered last-thread state, or subagent errors. Existing discovery after exit is not sufficient ownership proof.
3. Register monitoring without a startup gap: snapshot/baseline before launch and retain enough attributable fresh events to catch an error written before binding completes. Handle serialized polling, cancellation, exit races, replaced/truncated files and cleanup without leaked readers/helpers.
4. Specify behavior for plain launch, explicit resume, `--last`, bare picker, and in-TUI thread changes. Verify current selected-thread ownership or stop safely; never resume a guessed thread. Unsupported ownership transitions must be documented and tested, not silently ignored.
5. Add sanitized diagnostics for monitoring enabled/disabled, binding provenance/transitions and recovery decisions. Do not log transcripts, secret hashes, raw account/thread IDs or configuration contents.

**Verification:** old-fails/new-passes normal no-resume launch with fresh main-thread quota→redraw and a still-running child; correct same-thread account switch; error before binding notification; concurrent unrelated main threads/subagents; historical/replaced/truncated records; picker selection differing from remembered thread; missing/ambiguous binding safe stop; explicit resume unchanged; thread-change ownership controls; interrupted invocation no switch; exactly one switch for duplicate console/event evidence.

**Next:** inspect available native ownership signals and existing file discovery; implement an isolated failing normal-launch regression, then select the smallest proven ownership mechanism. Do not start S27/S28 architectural migration as an implicit workaround.

## Ordered integration and completion gates

1. Read `AGENTS.md`, `docs/testing/auto-switch-debugging-journal.md`, and relevant source/tests. Verify Git state and selected Codex executable locally without touching live sessions. Checkpoint chosen design and evidence in this file before implementation.
2. Establish failing regressions against unchanged baseline for both defects. Label synthetic traces versus actual-native probes accurately. Implement the smallest coherent change; checkpoint findings and remaining uncertainties.
3. Run focused tests, `npm run build`, and `npm test`; use explicit Bash/native checks as appropriate. Report default Fish failures separately and compare baseline before assigning causality. Previous passing counts are historical, not verification of this change.
4. Update `README.md` and `README.zh-CN.md` together for user-visible behavior/limits; `CHANGELOG.md`; compatible-fix version in `package.json` and root lock entries; debugging journal; `docs/testing/real-terminal-regression.md`. Preserve launch policy, credential isolation, safe resume, bounded shutdown and goal restoration.
5. Ask for a separate isolated real terminal with fake accounts/synthetic conversations. Required acceptance: normal launch, fresh quota→prompt, same-thread switching, replay/unrelated-thread negatives, cancellation and Bash/Fish terminal-mode restoration on the latest workspace build. Existing-session inspection permission is not GUI/terminal-driving approval. If unavailable, mark acceptance pending and do not declare interactive recovery fixed.
6. Review diff/security boundaries and staged files; commit focused local changes. No push/install without new authorization. Update this record before handoff with source revision, actual check results, failed/pending acceptance and a concrete next action.

## Refreshed baseline and other work

- Baseline HEAD before this planning checkpoint:1ec857c; runtime source inherited from38a3dc1/41cfafe, version0.4.0. Last recorded S32 full Bash/native suite213/213; actual-TTY exit-notice12/12 and bootstrap17/17. None rerun for S33.
- S32 is delivered: update notices occur only after interactive exit. Its old final-checkpoint next actions are superseded by38a3dc1. This is unrelated to quota detection.
- S31 remains unresolved: older incident had different requested/monitored threads. Adjacent picker fix delivered and verified, but original causal ownership history is missing. S33 does not retrospectively prove S31's cause.
- S27/S28 private app-server architecture remains deferred, not authorized implementation scope. S17 unbound/eventless detection overlaps S33; broader IME/narrow/concurrent terminal acceptance remains pending.
- Other residuals: provider-effective identity/live reset evidence, broader credential/daemon and visual/input acceptance, baseline Fish pipe-lifecycle timeouts. Do not expand this task without evidence or approval.
- Completed task details, scoped historical approvals and older verification records are preserved in `TASKS.log`; archived “Next” instructions are not current.
