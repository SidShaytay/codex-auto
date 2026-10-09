# Auto-switch debugging journal

This is a living investigation guide, not a claim that all recovery issues are fixed. Read it before diagnosing quota detection, account rotation, or resume failures. Add a dated lesson after each material investigation; update the procedure when evidence invalidates an assumption.

Execution state belongs in [TASKS.md](../../TASKS.md). Terminal acceptance belongs in [the real terminal regression checklist](real-terminal-regression.md). Temporary incident details belong in local `ISSUE.report.md`, which must never be staged.

## Safety and permission gate

- Confirm the user's current permissions before accessing a live session. A newer prohibition overrides earlier driving approval. “Do not touch” includes read-only inspection; use previously collected evidence instead.
- Diagnostic permission does not authorize new windows, pane/layout changes, input injection, hook approval, or restarts. Ask unless explicitly authorized. Never launch a GUI to work around missing terminal permission.
- Do not print credential files, tokens, runtime configuration, environment values, prompts, or raw transcripts. Keep exported evidence to allowlisted metadata and conclusions. Even ordinary local logs can contain account names and raw session IDs; prefer sanitized incident reports.
- Use fake credentials and isolated temporary homes for tests. Never activate/import/rotate real credentials, log in, kill unrelated processes, approve hooks, or change provider settings as an incidental diagnostic step.

## Start with the actual symptom

Ask what should have happened and classify the observed failure:

| Evidence | Investigate next |
| --- | --- |
| Quota visible, no invocation end or switch | Freshness, prompt-redraw classification, session binding, detector transport |
| Quota detected, child does not stop | PTY shutdown and process lifecycle; test the real launch shell |
| Switch recorded, resumed launch missing | Rotation selection, exhausted set, safe binding and recovery errors |
| All exhausted after a long run, earlier account now available | Age of each exhaustion mark, reset evidence, and whether selection expires those marks |
| Resumed launch recorded, fresh quota on second account | Effective credential/provider identity and real availability; do not call it a missed switch |
| Only old quota visible after recovery | Historical replay; never infer current exhaustion from the viewport alone |
| Pane has returned to shell | Inspect completed invocation timeline before assuming a live stalled wrapper |

A successful retry does not explain the previous failure. Preserve the unresolved alternatives instead of naming a phantom bug or claiming both accounts genuinely exhausted.

## Establish provenance and binding

With permission, identify the actual wrapper PID, entry point, start time, Codex executable, shell/transport, launch policy, working directory and bound thread. Pane titles and remembered session IDs can be stale. Compare them locally; export only necessary conclusions.

A newly installed build does not replace code already loaded by a running wrapper. Record both installed revision and running invocation provenance. `CODEX_AUTO_INTERACTIVE_TRANSPORT=direct` inherits terminal streams and does not provide the PTY detector's output/event interception.

Safe repository/installation checks:

```bash
git status --short
git log -8 --date=iso --format='%h %ad %s'
git log --oneline -- src/lib/session.ts src/lib/detection.ts src/lib/quota-events.ts
(cd /tmp && env CODEX_AUTO_UPDATE_CHECK=0 codex-auto --version)
```

Use the exact executable involved if PATH may resolve another installation. Do not run the affected conversation merely to inspect version metadata.

## Correlate causal events

Build one timeline per wrapper invocation:

1. `launch`: account selection, resume state, session binding, sanitized policy.
2. Fresh bound-thread provider error, if available.
3. `invocation_end`: quotaDetected, interrupted, exitCode, missingSessionError.
4. `quota_switch`: transition to the next account or no eligible account.
5. Resumed `launch`, then current-turn progress or a second fresh error.
6. `all_exhausted`, `recovery_failed`, or normal `exit`, if present.

Sources and limits:

- `<CODEX_AUTO_HOME>/diagnostics/`: automatically generated sanitized incident JSON. Default home is `~/.codex-auto`; see [README diagnostics](../../README.md#troubleshooting) and current CLI help for supported commands.
- `<CODEX_AUTO_HOME>/logs/`: local JSONL wrapper events. These are not export-safe by default. Select explicit metadata keys instead of dumping whole rows. Do not assume the newest log belongs to the reported pane; correlate run and time first.
- `<CODEX_AUTO_HOME>/runs/`: per-run binding/status. Compare locally; avoid copying raw account names, workspace paths, or thread identifiers into public artifacts.
- Bound Codex session JSONL: inspect only approved, selected event metadata. A supported fresh completion has `type=event_msg`, `payload.type=task_complete`, and `payload.error.codex_error_info=usage_limit_exceeded`. Do not copy message/tool/response payloads.
- Goal state can corroborate `usage_limited`, but does not prove a new provider request or current effective account identity. Inspect databases read-only and omit objective text.

The0.3.2 event reader snapshots the bound file before launch, reads appended records, filters timestamps, and skips existing replacement/truncation contents. Missing/oversized completion records, unavailable history, unbound runs, and unsupported event formats remain evidence gaps. Text fallback still has a five-second replay grace; it is not causal freshness proof.

## Separate identity from detection

A local account label is not proof of the effective provider account. A fresh provider quota event proves a current error on that invocation, not that the intended second account is truly exhausted.

If rotation occurred but the second account also fails:

- Confirm the intended transition and original/resumed `--no-daemon`, approval/sandbox and supported launch overrides.
- Review the selected Codex executable and local overlay/credential replacement boundary in source. Normal Codex authentication remains external to the wrapper.
- With renewed permission, compare selected account and overlay credentials locally without printing contents or hashes of secrets. File equality verifies a copy, not provider identity.
- Verify effective identity and availability in Codex's current account/status/usage views with permission; treat private identifiers as sensitive. Do not approve hooks or change configuration to reach those views.
- Keep wrong identity, routing/configuration, provider quota/reset state and external process state as hypotheses until evidence separates them.

Do not patch the detector merely because a second invocation returned another genuine error.

## Reproduce, review, verify

Use `tests/fixtures/fake-codex.mjs` with separate temporary app/Codex homes. Check existing tests before inventing a new fixture switch.

Cover quota-before-prompt, LF and no-LF cursor redraw, split chunks, incomplete JSONL, historical replay (including longer than five seconds), other threads, replaced/truncated files, oversized tool records, immediate exit and a child that otherwise stays alive. An8s natural-exit fixture with recovery below4s demonstrates that detection stopped the child rather than waiting for normal exit. Include fish when available and Ctrl-C cancellation; do not paper over lifecycle failures with larger timeouts.

For each confirmed defect, establish old-fails/new-passes using the previous implementation. Compare Git parent and patch behavior with synthetic terminal bytes; viewport screenshots cannot reconstruct the original PTY byte stream. Keep synthetic data separate from private transcripts.

```bash
npm run build
npm test
SHELL=/bin/bash npm test -- tests/runtime/quota-events.test.ts tests/session/session.test.ts
```

Bash is a comparison environment, not a substitute for testing the user's shell. Record known failing checks rather than weakening safe-resume assertions. Interactive changes also need approved real terminal regression on the current build; unit tests and fake streams alone are insufficient.

## Goal continuity after quota recovery

A same-thread resume does not itself prove that autonomous goal execution resumed. The wrapper currently supplies an ordinary `Continue` prompt and has no explicit goal-reactivation path. Distinguish conversation progress from confirmed goal-state recovery. For a reported overnight pause, correlate quota, switch, resumed launch and goal status without exporting objective text. Verify the selected native Codex's supported goal interface before choosing a recovery mechanism; a slash command passed as a CLI prompt is not proven equivalent to an interactive slash command. Restore only a previously active goal suspended by quota, never an absent, completed or user-paused goal. Require explicit recovery acknowledgement/state and real terminal regression; fixed delays and prompt injection alone do not establish restoration. With subsequently granted read-only log permission, Oct09 metadata establishes a01:26 PDT quota interruption, automatic same-thread resume with literal `Continue`, one task ending01:26:59, and no further task start until07:32:35. A goal-active update at07:33:55 precedes restarted execution. Prior autonomous turns restarted within milliseconds. No goal-suspended status event was recorded; do not infer the persisted enum. The screenshot's thread prefix refers to a different older thread, not the wrapper-bound overnight thread. Read-only investigation did not interrupt or drive the current session. The user subsequently confirmed that the07:33 update was their manual goal resume, not automatic recovery.

## 2026-10-09 — Goal restoration requires native state, not a continuation prompt

**Confirmed:** ordinary `Continue` completes one turn after quota recovery while a usage-limited goal remains stopped. The user confirmed manual goal restoration at07:33 PDT. The wrapper has no prior native goal restoration path. Native0.161.0's generated protocol exposes `thread/goal/get` and `thread/goal/set`; an isolated synthetic persisted thread verifies usageLimited→active without loading a thread or starting a turn, with content/budget/accounting unchanged. Automatic restoration belongs after the old child exits and before resumed TUI launch, not in the still-progressing session.

**Implementation/limits:** the helper uses an independent stdio server, modifies only status for a bound usage-limited goal, verifies active acknowledgement, suppresses raw output, and closes before resume. Other statuses are not rewritten. Unsupported APIs warn; confirmed restoration failures stop. The protocol has no compare-and-set, so another controller concurrently editing the same goal remains unsupported. Native acknowledgement is not proof of autonomous terminal progress. Eleven isolated fake-account cases in a real Ghostty terminal pass on the committed build, including Bash/Fish goal continuation and helper cancellation; all streams are TTYs, stty restores, helpers close. Native provider goal-loop and visual/IME acceptance remain untested. Results are recorded in S23.

**Correction:** do not infer installed profile semantics from a matching version tag. The installed0.161.0 binary rejects a legacy `profile` config override and its app-server CLI lacks the TUI profile selector. Profile launches therefore warn and retain conversation-only recovery rather than using a mismatched configuration. The incident's saved launch policy has no profile or config overrides. Regression evidence and final check counts belong in S23.

## 2026-10-09 — Bootstrap401 is authorization failure, not quota

Saved incident metadata confirms buildf50d791 switched and resumed the same thread at16:01:26 UTC, then exited1 at16:01:28 without quota or missing-session detection. Native fatal account/read workspace-routing401 is user-supplied evidence; the underlying credential/provider cause remains unverified. The non-quota path wrongly recorded failed invocations as successful and cleared retry evidence.

The patch recognizes only the fatal native bootstrap envelope at the end of a failed invocation, excludes the account for this run under separate authorization evidence, and retries another eligible account on the bound thread. It does not refresh credentials or guess a thread. Generic failures stop; failed invocations no longer count as successful. Five of six new tests fail on the archived previous implementation; the unbound safe-stop control passes. Eight isolated real Ghostty terminal cases pass across Bash/Fish, including goal continuity after quota→401→third-account recovery and bounded stops. This does not establish why the real account returned401. The narrow text envelope remains a compatibility fallback.

The long-standing missing-session test failure was a test false positive: one stderr.read returned only the incident chunk. Draining all chunks passes without changing safe-resume runtime behavior. A goal diagnostic test also depended on order for equal timestamps; it now locates the restored outcome explicitly. Final Bash/native suite182/182 passes; build passes. Live sessions were not touched.

## Journal maintenance

Each new dated entry should contain:

- Symptom and expected outcome, without sensitive context.
- Confirmed evidence and the exact provenance needed to reproduce.
- Confirmed cause versus hypotheses and missing evidence.
- Regression added, old/new result, automated and real-terminal checks.
- Fix or mitigation scope, remaining failure modes, and next investigation trigger.

Correct earlier claims explicitly. Keep this guide concise; move execution details to TASKS.md and compact history to TASKS.log. Never turn a user-reported successful retry into agent-verified acceptance.

## 2026-10-08 — Historical replay and fresh errors after redraw

**Confirmed:** latest-prompt slicing from6af7593 discards quota text before the latest prompt. Cursor-boundary normalization in27a36c9 broadens the blind spot: a synthetic no-LF quota+cursor-redraw trace detects quota in the parent but misses it in the patch. Both versions miss the LF variant. The affected live wrapper predates27a36c9, so that patch cannot explain that specific running instance.

**Delivered:**73ef384 adds bound-thread fresh completion-event detection in0.3.2;6a1a48a records native acceptance. Five fresh-event PTY cases and nine reader cases pass. Final Bash suite130/131; the existing missing-session warning assertion remains separate. Native Ghostty→Zellij testing observed a fresh provider error, one account switch, same-thread resume, and subsequent reasoning/tool progress.

**Limits:** a narrow-resize capture transiently duplicated Unicode input rows before clearing; full redraw/IME acceptance is not established. Unbound/eventless runs retain timing-based text fallback. The completed native reproduction proves one recovery path, not universal future account availability.

**Lesson:** check process launch time and actual thread binding before blaming the newest patch. Do not confuse a prompt redraw with proof that preceding text is historical. Use causal fresh events, not a longer grace period, where supported.

## 2026-10-08 — Reported recurrence, actual switch, later success

**Confirmed from prior authorized inspection:** two later runs switched first→second account, then the bound thread recorded a fresh `usage_limit_exceeded` for the resumed invocation. The wrapper reported all accounts exhausted and returned to the shell. This was not absence of a recorded switch or merely historical text replay.

**Unresolved:** provider-effective identity, true second-account availability, reset timing and external state were not independently verified. The user subsequently reports another retry succeeded; no agent capture established its cause. Stop reproduction unless the issue returns.

**Lesson:** separate detector, rotation, and effective-identity failures. A fresh second-account error does not prove the intended account was used. Keep the local incident checkpoint neutral; do not add speculative runtime changes. Current user instruction prohibits all Zellij access because it is doing real work.

**Next trigger:** on recurrence, obtain current permission, preserve the pane and build a new invocation timeline before input/restart. Compare identity/availability only if the timeline proves rotation occurred.

## 2026-10-09 UTC — Run-lifetime exclusion skips recovered capacity

**Confirmed:** the supplied incident reports at06:34:16 UTC identify build5ccc0ca, version0.3.2. Allowlisted metadata from the matching completed wrapper log shows that the account the user expected to recover was marked exhausted at04:47:50 UTC. The wrapper switched twice, ran the final account for about106 minutes, then reported all exhausted without retrying the earlier account. No live terminal, credentials, configuration or Codex transcripts were accessed.

**Cause of the skipped retry:** `runManagedSession` keeps an `exhausted` set for the entire run and never removes entries. `pickNextAccount` excludes every member without considering elapsed time or `retryAvailabilityByAccount`. Expiration of displayed retry metadata in state does not clear this independent set. An isolated source selection probe confirms that the retained mark blocks selection and removing it makes the account eligible.

**Limits:** restored capacity is user-reported. The exact provider reset time, effective identity and authenticity of the original quota detection remain unverified. This establishes why the wrapper skipped the account, not why it originally hit quota. The initial diagnostic checkpoint made no runtime change. The subsequent local0.3.3 patch addresses supported reset-time expiry; it does not add provider capacity refresh or verify this account's actual reset.

**Delivered locally / verification:** per-run observations retain supported retry timestamps independently of state normalization. Selection releases elapsed cooldowns, reloads account order, and blocks missing, invalid or non-future reset evidence rather than looping. Each switch and stop records candidate eligibility, observation/reset timestamps and `liveQuotaRefreshed: false`; exports anonymize identifiers. Six fake-clock managed-session regressions fail on the old implementation and pass on the patch, including Bash pipes, Bash/Fish PTYs and repeated quota with stale reset evidence. The build passes; the final full Bash suite is145/146 with the pre-existing missing-session warning assertion still failing. A default Fish run also times out in two pipe-lifecycle cases; both failures reproduce against the unmodified Git baseline. Final results belong in TASKS.md. No real terminal regression, live identity/availability inspection or installation has occurred.

**Lesson / next verification:** the old “all exhausted” status meant every configured account had failed at some point during the run, not that all were unavailable now. Log decision-time eligibility and the source/freshness of capacity evidence. Do not describe local reset eligibility as live provider quota. Terminal acceptance and a verified provider-quota interface remain separate follow-ups; unknown-reset accounts still require a new managed run.
