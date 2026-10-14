# Task Memory

## Resume entrypoint

**See TASKS.md and continue**

- Workspace: current repository, branch `main`. Owner: root/integration owner. History: `TASKS.log`. Next ID: 36.
- Objective: implement and verify both S33 quota-detection defects below so a normal interactive launch can recover from a fresh quota error without waiting for Codex to exit, without switching on historical or unrelated errors, and without resuming the wrong conversation.
- Current request: implementation resumed on2026-10-14. Baseline regressions and isolated native ownership probes are implemented; runtime design remains unresolved. Continue development within the recorded safety boundaries.
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

### S34 [!] — Console detection discards fresh quota before a redraw prompt

Owner: root/integration owner.

**Defect:** `src/lib/session.ts` evaluates `getOutputSinceLatestPrompt(sanitizedOutput)`; `src/lib/detection.ts` slices after the last `›`/`>` prompt. Codex can display a new quota error and then redraw its prompt. The detector drops that real error as though it were historical replay. This affects the text fallback whether a conversation ID is known or unknown.

**Required outcome:** a fresh quota followed by a prompt triggers recovery while the child stays alive. Historical quota replay must not trigger recovery. A prompt redraw alone is not proof that earlier output is historical.

**Plan:**
1. Inspect existing replay/freshness tests and PTY normalization before designing a replacement. Create a failing synthetic regression for quota→prompt, LF/no-LF cursor redraw and split chunks, independent of the structured reader.
2. Replace the latest-prompt heuristic with an explicit, evidence-backed freshness model. Prefer causal turn/error evidence where available; document the text-only limits. Do not blindly scan all accumulated history, disable replay guards or present a larger timeout as a fix.
3. If terminal bytes alone cannot distinguish fresh and replayed errors safely, record that limitation explicitly and define safe behavior; S35 must provide normal-launch coverage. Do not claim universal text-only detection without evidence.

**Verification:** old-fails/new-passes positives; historical replay including delayed replay beyond five seconds; ordinary quoted/tool quota text; chunked ANSI/control sequences; repeated redraws; prompt after genuine error; immediate exit and child staying alive; cancellation without unintended rotation. Reuse `tests/runtime/detection.test.ts`, `tests/session/session.test.ts`, and `tests/fixtures/fake-codex.mjs` where appropriate.

**Verified:** four synthetic regressions fail against unchanged runtime9489433: bound/text-only and unbound/structured, each LF and cursor-positioned quota→prompt. Every case waits for its8s natural exit and reports zero switches. Fixture `FAKE_CODEX_OMIT_STRUCTURED_QUOTA` keeps S34 independent of structured detection. Tests currently use explicit `test.fails.each`; their green result means the defects remain, not that recovery passes. Remove `.fails` when implemented.

**Need:** causal freshness/ownership design. Text alone cannot distinguish identical fresh errors, replay and quoted output; scanning accumulated output violates negative controls. Split-chunk and delayed replay>5s additions remain pending.

**Next:** integrate S35's proven causal signal, then implement safe text-only behavior with explicit limits; do not promise universal detection from terminal bytes.

### S35 [!] — Plain unbound launches lack structured monitoring while running

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

**Verified:** normal-launch LF/no-LF regressions fail on unchanged9489433. Selected native0.162.1 and clean official `/tmp/codex-src` at `rust-v0.162.1`/092d3ac expose SessionStart hooks. Maintained opt-in `tests/runtime/quota-ownership-native.test.ts` passes2/2 against that executable: untrusted hook blocks at approval without invoking helper/provider; bypass enabled only in the isolated probe yields startup session metadata before the first localhost request. Fake homes, no real accounts/config, no external provider, no real terminal. This proves a startup capability, not recovery or current selection after in-TUI thread changes. Never add blanket `--dangerously-bypass-hook-trust` to wrapper launches.

**Design limits:** hooks need a scoped approval and a way to preserve existing user hook/config behavior. TUI recorder is unsuitable: it serializes outbound input and omits selected-thread IDs from inbound app-event records. No supported complete current-selection signal has been established. Current scope prohibits implicit app-server migration or real configuration access.

**Need:** user decision before changing hook approval/config behavior or extending scope to a native bridge. Neither approach yet proves every required transition.

**Next:** obtain a decision on the allowed integration boundary (scoped hooks versus isolated native bridge investigation), then prove main ownership, transition controls and policy preservation before runtime integration. S33 remains incomplete.

## Ordered integration and completion gates

1. Read `AGENTS.md`, `docs/testing/auto-switch-debugging-journal.md`, and relevant source/tests. Verify Git state and selected Codex executable locally without touching live sessions. Checkpoint chosen design and evidence in this file before implementation.
2. Establish failing regressions against unchanged baseline for both defects. Label synthetic traces versus actual-native probes accurately. Implement the smallest coherent change; checkpoint findings and remaining uncertainties.
3. Run focused tests, `npm run build`, and `npm test`; use explicit Bash/native checks as appropriate. Report default Fish failures separately and compare baseline before assigning causality. Previous passing counts are historical, not verification of this change.
4. Update `README.md` and `README.zh-CN.md` together for user-visible behavior/limits; `CHANGELOG.md`; compatible-fix version in `package.json` and root lock entries; debugging journal; `docs/testing/real-terminal-regression.md`. Preserve launch policy, credential isolation, safe resume, bounded shutdown and goal restoration.
5. Ask for a separate isolated real terminal with fake accounts/synthetic conversations. Required acceptance: normal launch, fresh quota→prompt, same-thread switching, replay/unrelated-thread negatives, cancellation and Bash/Fish terminal-mode restoration on the latest workspace build. Existing-session inspection permission is not GUI/terminal-driving approval. If unavailable, mark acceptance pending and do not declare interactive recovery fixed.
6. Review diff/security boundaries and staged files; commit focused local changes. No push/install without new authorization. Update this record before handoff with source revision, actual check results, failed/pending acceptance and a concrete next action.

## Refreshed baseline and other work

- Implementation baseline9489433; runtime inherited from38a3dc1/41cfafe, version0.4.0. Current build and diff whitespace check pass. Full Bash suite reports213 passed/6 skipped:209 ordinary passes plus4 expected failures; native probes2/2 pass separately. Focused existing structured/replay controls8/8 pass (including bound Fish case). Default Fish full suite and real terminal acceptance were not run. No runtime change, install or push. Private untracked files remain untouched.
- S32 is delivered: update notices occur only after interactive exit. Its old final-checkpoint next actions are superseded by38a3dc1. This is unrelated to quota detection.
- S31 remains unresolved: older incident had different requested/monitored threads. Adjacent picker fix delivered and verified, but original causal ownership history is missing. S33 does not retrospectively prove S31's cause.
- S27/S28 private app-server architecture remains deferred, not authorized implementation scope. S17 unbound/eventless detection overlaps S33; broader IME/narrow/concurrent terminal acceptance remains pending.
- Other residuals: provider-effective identity/live reset evidence, broader credential/daemon and visual/input acceptance, baseline Fish pipe-lifecycle timeouts. Do not expand this task without evidence or approval.
- Completed task details, scoped historical approvals and older verification records are preserved in `TASKS.log`; archived “Next” instructions are not current.
