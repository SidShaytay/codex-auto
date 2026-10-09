# Autonomous Codex account failover: design spike

**Recommendation: use a wrapper-owned, account-isolated app-server as the execution/control boundary, with the native TUI as a remote client. Start with one fresh server per account attempt, not a global credential-swapping daemon.**

Research completed on 2026-10-09. This is a recommended architecture and prototype plan, not an implemented or acceptance-tested replacement. Structured error delivery is verified on isolated native probes; cross-account identity, remote-TUI ownership and terminal compatibility remain implementation gates. Universal “100% autonomous” operation cannot be promised for arbitrary failures or approval policies.

## Objective and boundaries

Continue long-running Codex CLI work across exhausted/rate-limited OpenAI accounts without human intervention, including an active native `/goal`. Compare the existing wrapper against independent app-server ownership, isolated auth/server supervision, and supported native alternatives. Provider profiles and the ChatGPT GUI application are optional feasibility topics.

This spike does not implement or migrate sessions, access live credentials/configuration/session content, launch interactive sessions, or publish changes. Execution state and the next action live in [TASKS.md](TASKS.md). Resume: See TASKS.md and continue.

## Evidence baseline

- Repository baseline: `48aa15c`; source inspection only. Pre-existing `.pi/` and `ISSUE.report.md` are excluded from commits.
- Selected executable: standalone Codex CLI `0.162.1`, resolved from the local executable symlink. A version label is not proof of exact upstream behavior.
- Fresh help and experimental TypeScript schemas were generated using an empty isolated `CODEX_HOME` at `/tmp/codex-design-spike.F1OYfC/`. No provider requests or live-home reads were used. Temporary files are supporting evidence, not durable acceptance artifacts.
- Official source reference: [`rust-v0.162.1`](https://github.com/openai/codex/tree/rust-v0.162.1). Local schemas confirm available types; source explains intended behavior. Neither proves every real backend emits the expected event.
- External pattern reference: [Sarrius/pi-multi-account](https://github.com/Sarrius/pi-multi-account), inspected revision `ae7be3eb8b23fa346ab28993dd4526be53a70ffd` (1.24.0 commit). Research was selective/static, not execution or a full security audit.

## What the current wrapper actually does

The wrapper does not exclusively parse TUI characters. [`src/lib/quota-events.ts`](src/lib/quota-events.ts) reads fresh appended records for an explicitly bound thread and recognizes `task_complete.error.codex_error_info = usage_limit_exceeded`. It snapshots history before launch, rejects historical replacements/truncations, and bounds record sizes. This is structured persisted-event inspection, not a subscription to the executing app-server.

[`src/lib/session.ts`](src/lib/session.ts) also retains terminal-output quota detection and bootstrap-authorization text fallbacks. It supervises shell/PTY processes, injects `--no-daemon`, preserves launch policy and resumes the bound conversation. Eventless/unbound runs still have a timing-based replay mitigation rather than causal proof.

[`src/lib/runtime.ts`](src/lib/runtime.ts) creates an overlay with a separate copied `auth.json` and shared home entries. Fresh account attempts preserve a process boundary, but broad shared symlinks mean the home is not a fully isolated private store. Any redesign must explicitly partition credentials, configuration, session storage, caches, sockets and mutable metadata rather than assuming an account label establishes isolation.

[`src/lib/goal-recovery.ts`](src/lib/goal-recovery.ts) starts a separate short-lived stdio app-server only after the quota-stopped child exits. It gets the persisted goal, changes only `usageLimited` to `active`, verifies the result, and shuts down before resume. It never loads a thread or starts a turn. Profile launches return an explicit unsupported/manual-goal fallback. This second control/configuration path is transitional.

Prior verified evidence and unresolved limits are recorded in [the debugging journal](docs/testing/auto-switch-debugging-journal.md), [architecture notes](docs/architecture.md), and [goal acceptance](docs/testing/goal-recovery-acceptance.md). This spike does not rerun or broaden those acceptance claims.

## Structured errors: initial findings

The selected executable's experimental generated protocol exposes:

| Signal | Meaning and design implication | Evidence level |
| --- | --- | --- |
| `error` with `threadId`, `turnId`, `willRetry`, and typed `error.codexErrorInfo` | Attribute an error to current execution; let native retries finish when `willRetry=true` | Local schema and versioned source |
| `turn/completed` with terminal status and optional error | Reconcile settlement; do not rotate solely because a warning arrived | Local schema and versioned source |
| `usageLimitExceeded`, `rateLimitExceeded` | Separate exhausted capacity from shorter-lived rate limiting | Local enum; backend coverage pending |
| `serverOverloaded`, `flexUnavailable`, connection/stream errors | Temporary service failure need not imply bad account capacity | Local enum; retry-policy research pending |
| `unauthorized`, `badRequest`, sandbox/context/budget/policy errors | Not quota; classify separately rather than cycling every failure | Local enum; detailed semantics pending |
| `account/rateLimits/updated`, `account/rateLimits/read` | Capacity snapshots are separate from a failing turn | Local schema; freshness/routing verification pending |
| `thread/goal/updated`, goal get/set | Explicit goal state is available behind experimental capability | Local schema, tagged processor and isolated native tests; cross-account acceptance pending |

The versioned [app-server event handling](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/app-server/src/bespoke_event_handling.rs) records terminal errors in the turn summary, emits `error` with `will_retry=false`, and emits `turn/completed` as failed when a terminal error exists. Its stream-error path emits `will_retry=true`. Token-count events can emit structured account rate-limit updates. Interrupted turns can carry an error too: observing only `error` notifications misses some stopping conditions.

The versioned [app-server documentation](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/app-server/README.md) explicitly describes guardian circuit-breaker termination: strict mode carries `tooManyDenials` in an interrupted turn, while default mode leaves that error unset and neither emits a separate Error event. Therefore a complete controller must reconcile terminal status, typed error, goal state, pending requests and user actions. It cannot expect every stop to arrive as a quota API call.

### Actual executable probes: structured delivery works, classification is nuanced

An isolated localhost Responses HTTP provider returned controlled error bodies to native `0.162.1` stdio app-server. Each case used a fresh temporary `HOME`/`CODEX_HOME`, disabled analytics, no OpenAI auth, and native request/stream retry budgets set to zero. The client initialized, started a thread and a turn, and recorded only allowlisted metadata. Child processes and provider listeners were closed; temporary homes were removed.

| Synthetic response | Observed `codexErrorInfo` | Terminal evidence |
| --- | --- | --- |
| HTTP 429, `rate_limit_exceeded` | `responseTooManyFailedAttempts.httpStatusCode=429` | Attributed `error`, `willRetry=false`; `turn/completed.status=failed` |
| HTTP 429, `insufficient_quota` | `usageLimitExceeded` | Same attributed terminal sequence |
| HTTP 503, `server_overloaded` | `httpConnectionFailed.httpStatusCode=503` | Same attributed terminal sequence |
| HTTP 401, `invalid_api_key` | `httpConnectionFailed.httpStatusCode=401` | Same attributed terminal sequence |

**Confirmed:** these four synthetic failures reach clean API notifications without TUI character parsing. **Correction to schema-only assumptions:** a provider body saying rate-limit, unauthorized or overloaded does not guarantee the same-named enum variant. Controllers must handle HTTP-bearing fallback variants and unknown variants. HTTP 429 alone does not establish exhausted account capacity. The probe does not verify real ChatGPT backend envelopes, normal retry budgets, WebSocket failures, bootstrap workspace discovery or reset-header propagation.

Probe script/results were saved temporarily under `/tmp/codex-design-spike.F1OYfC/`; the durable evidence is the sanitized table above. This was a research probe, not a committed regression test. Phase 1 below requires converting it into maintained acceptance fixtures.

## App-server ownership: initial feasibility

Fresh isolated local help confirms that the TUI accepts `--remote` with Unix and WebSocket endpoints, and app-server accepts stdio, Unix and WebSocket listeners. These are real selected-binary capabilities, not assumed upstream APIs.

TUI `-p` layers `$CODEX_HOME/<name>.config.toml`; app-server help has no corresponding profile selector. Profile equivalence must be proved through native loading semantics, not recreated by guessing legacy `[profiles]` behavior or flattening configuration. A separately owned server may remove terminal-text recovery but add socket readiness, multiple-client ownership, approval routing and reconnect complexity. Persistence alone does not make lifecycle simpler.

## Patterns worth borrowing from pi-multi-account

Borrow recovery ownership and state patterns, not its credential/proxy implementation wholesale. This Pi extension routes numbered provider slots through shared auth storage; it does not establish OS/process account isolation or Codex-compatible session control.

| Pattern | Codex application | Pinned source |
| --- | --- | --- |
| Session epoch invalidates stale asynchronous work; manual input/model changes and abort claim control | Every switch/wake/reconnect carries a run generation; discard old completions and never override user cancellation | [index.ts](https://github.com/Sarrius/pi-multi-account/blob/ae7be3eb8b23fa346ab28993dd4526be53a70ffd/index.ts) |
| Separate account-quota, model-specific and temporary failures | Use typed Codex errors plus terminal settlement; retry service failures without marking the account exhausted | [index.ts](https://github.com/Sarrius/pi-multi-account/blob/ae7be3eb8b23fa346ab28993dd4526be53a70ffd/index.ts) |
| Usage snapshots bind freshness and credential/account identity | Keep capacity observation time and effective identity separate from local eligibility; never treat an old percentage as current capacity | [usage.ts](https://github.com/Sarrius/pi-multi-account/blob/ae7be3eb8b23fa346ab28993dd4526be53a70ffd/usage.ts) |
| Tool lifecycle witnesses prevent false stall detection | A quiet long-running tool is not an exhausted account; observe structured tool/process events before recovery | [index.ts](https://github.com/Sarrius/pi-multi-account/blob/ae7be3eb8b23fa346ab28993dd4526be53a70ffd/index.ts) |
| Lock before read-modify-write, restrictive temp-file permissions, atomic rename, recoverable publication order | Useful for local supervisor state; do not mutate native credential stores or add sidecars merely to copy the pattern | [auth-file-transaction.ts](https://github.com/Sarrius/pi-multi-account/blob/ae7be3eb8b23fa346ab28993dd4526be53a70ffd/auth-file-transaction.ts) |

Its [slot-proxy-auth.ts](https://github.com/Sarrius/pi-multi-account/blob/ae7be3eb8b23fa346ab28993dd4526be53a70ffd/slot-proxy-auth.ts) shadows child OAuth slots with placeholders while a parent retains real credentials in a sidecar. That increases secret-bearing storage and local proxy trust obligations; it is not recommended for this Codex design without a separate security case. Pi model-registry switching and compaction hooks are host-specific and cannot simply be mapped to Codex terminal input.

The root [license](https://github.com/Sarrius/pi-multi-account/blob/ae7be3eb8b23fa346ab28993dd4526be53a70ffd/LICENSE) is MIT: copied substantial code must preserve notices. This does not settle dependency or vendored-code obligations. No code reuse is proposed in this research spike. Partial inspection did not audit proxy authorization, destination validation, symlink resistance, logging or crash durability; two-file recovery ordering does not imply a fully atomic transaction.

## Architecture decision

| Approach | Structured recovery | Native user experience | Identity/lifecycle risk | Decision |
| --- | --- | --- | --- | --- |
| Current CLI/PTY wrapper plus bound persisted events | Partial; quota JSONL plus text fallbacks and separate goal helper | Preserved, with current terminal limits | Known process isolation; complicated terminal stop/binding and second control path | Maintain as compatibility fallback during prototype |
| Independent private app-server per account attempt plus remote native TUI | Direct execution errors, goal and thread APIs | Native renderer retained; attachment/policy parity must pass | Extra socket/controller ownership, but explicit server identity and generation | **Preferred prototype** |
| Long-lived isolated account-owned daemon per account | Same direct APIs | Potentially survives client detach | More idle secret-bearing processes, competing thread writers and daemon update/environment state | Optional later optimization, not prerequisite |
| One server swapping auth in place | Structured API exists, but switch safety unproved | Could avoid relaunch | Global auth/routing mutation, loaded-thread policy and stale refresh races | Reject as initial design |
| Headless app-server supervisor/custom UI or `codex exec` job loop | Direct API, or structured execution output where verified | Loses/rebuilds native interactive experience | Simpler single control owner; goal/resume semantics still matter | Good secondary headless product; not a drop-in TUI replacement |
| Provider proxy rotating credentials beneath Codex | Can see HTTP failures | Native UI largely unchanged | Expanded token/network trust boundary; opaque native goal/account state and workspace routing | Not recommended; authentication is not just a header |
| Codex plugin/MCP extension alone | No verified host-wide auth/lifecycle interception seam | Native | Cannot assume plugins intercept failed turns or change backend ownership | Insufficient evidence for core failover; helpers only |
| Upstream native multi-account support/contribution | Could remove wrapper compatibility debt | Best long-term fit | Depends on upstream scope and delivery; not presently verified | Pursue alongside a bounded adapter, not as immediate solution |

The preferred option removes terminal-character interpretation from the *recovery control plane*. It does not remove terminal management or make server process death disappear. Start with an explicit private endpoint and pinned executable; do not attach to or restart the user's shared daemon.

### Why app-server ownership can be cleaner—and when it is not

A direct owner gets attributed errors, terminal turn status, goal state and explicit initialization readiness from the server that actually executes work. It can stop observing rendered prompts, stop guessing the thread from output/files, and eliminate the separate goal-helper configuration path. This is a plausible reduction in complexity, not a demonstrated lifecycle win.

The versioned [daemon README](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/app-server-daemon/README.md) documents JSON lifecycle responses, initialize-based readiness, serialized mutations per home and bounded shutdown. It also warns that clients inherit the daemon launch environment, implicit attachment can fall back to embedded execution, and automatic updates can restart active or queued work. Managed lifecycle commands may select a different backend package from the invoking CLI.

Prefer a foreground child `app-server --listen unix://<private-path>` under the supervisor for the first prototype. Use a mode-0700 parent directory and verify endpoint permissions/ownership. Keep remote control and automatic downloads/updates out of this design. Use explicit `--remote` for TUI attachment so connection failure cannot silently change the execution owner. A stable front-end proxy that hides server replacement is a later option: it must safely remap requests, subscriptions and approvals, so it is not the “simple” first implementation.

Measure removed fallback/binding/helper code against new socket/client/controller/reconnect code. Prove bounded startup, settlement, shutdown, crash cleanup and no leaked terminal modes before calling the lifecycle cleaner.

## Account, thread and goal ownership

### Separate identities and stores

Keep an account catalog distinct from runtime capacity observations. A record should associate an opaque local handle with authentication mode, expected effective workspace/provider identity and an allowed policy—not include tokens in logs. Capacity state needs account/workspace/bucket attribution, observation time, source, reset time when available and a confidence/unknown marker. `usedPercent`, credits, spend limits and token activity are different dimensions.

Use fresh account-private credentials, caches, endpoint and environment for each attempt. Maintain one supervisor lease for the conversation. The unresolved storage gate is important: a truly separate `CODEX_HOME` cannot be assumed to see the same persisted thread ID. The current overlay shares home entries; a replacement needs a reviewed common thread-store topology with exactly one active writer, or a supported migration mechanism. Do not copy a live database, bypass writer locks or use the unstable history/path resume parameters as a casual export API.

Generated `ThreadResumeParams` prefers `threadId`, supports model/provider/policy overrides, and rejoins an already-running thread instead of always creating a new runtime. This makes ownership validation essential: a successful resume can mean attachment to an existing owner, not successful account replacement. Confirm the old owner is gone, account/routing state matches, and the resumed thread's policy remains equivalent.

### Authentication modes

Official [app-server auth documentation](https://developers.openai.com/codex/app-server) distinguishes native-managed ChatGPT login from experimental host-supplied `chatgptAuthTokens`. Local generated schemas confirm the latter and an `account/chatgptAuthTokens/refresh` server request. Managed auth lets Codex own normal refresh/persistence. External-token mode moves refresh and secret lifecycle into the host; a refresh response belongs to the original account/generation, not whichever account is currently selected.

**Recommendation:** preserve managed per-account credential ownership first. Do not introduce external-token mode merely to make switching look easier. Evaluate it only if a separate codex-auth service already has a verified local refresh and identity contract. Avoid uploads, telemetry of secrets and GUI-token extraction. Live refresh behavior, keyring/file precedence and selected-binary refresh ownership remain unverified by this spike.

Tagged [workspace-routing documentation](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/app-server/README.md#selected-workspace-routing) says saved ChatGPT workspace discovery can fail `account/read`, and a changed bootstrap origin for a workspace-bound thread requires a new thread. Therefore same-thread failover across arbitrary workspaces/providers is not guaranteed. Account/read success, routing and managed requirements must precede continuing work; a mismatched routing scope is a blocker, not permission to silently fork or weaken policy.

### Active /goal is mandatory

Goals have persisted statuses `active`, `paused`, `blocked`, `usageLimited`, `budgetLimited` and `complete`. A plain continuation prompt is not state restoration. The tagged [goal processor](https://github.com/openai/codex/blob/rust-v0.162.1/codex-rs/app-server/src/request_processors/thread_goal_processor.rs) coordinates goal/resume access and warns that activating a loaded goal can immediately start an idle turn or inject its objective. Resume restoration failures can be logged rather than making resume fail.

The existing isolated native tests were rerun against the selected `0.162.1` executable:

```bash
SHELL=/bin/bash CODEX_GOAL_NATIVE_BIN=/var/home/sid/.codex/packages/standalone/releases/0.162.1-x86_64-unknown-linux-musl/bin/codex \
  npm test -- tests/runtime/goal-loop-native.test.ts tests/runtime/goal-recovery-native.test.ts
```

Result: **3/3 passed**. Unloaded status restoration preserves goal content/accounting/budget and starts no turn. After reload, restoration permits at least three distinct autonomous turns against a synthetic localhost provider; the negative control remains usage-limited after exactly one explicit continuation turn. Repeated empty outputs ultimately block the restored goal. The test waits for final persisted state because turn-completed delivery can precede goal-state finalization. These are app-server tests, not new terminal or real-account acceptance.

Restore only a previously active goal causally suspended by quota and still `usageLimited`. Never revive user-paused, complete, budget-limited or unrelated blocked goals automatically. Preserve objective and accounting; do not submit a new objective or counterfeit user-origin authorization. Get/read-back acknowledgements are necessary but insufficient: observe native next-turn/progress evidence. Native runtime owns autonomous turns; the supervisor must not run a second unconditional turn loop or send `Continue` after native resume has already started work. No compare-and-set is exposed in generated goal-set params; one authorized controller and generation/lease discipline are required.

## Failure policy and stopping conditions

| Condition | Evidence | Default controller action |
| --- | --- | --- |
| Native error with `willRetry=true` | Structured attributed notification | Observe native retry; no concurrent account switch |
| Settled usage limit | Typed terminal error, settled turn; capacity snapshot if available | Cool down that identity/bucket, choose another eligible account, restore eligible quota-suspended goal |
| Terminal HTTP 429 without definitive quota | HTTP-bearing variant; optional capacity data | Bounded throttling retry/backoff; do not permanently exhaust account |
| 5xx/stream disconnect | Structured status/error when delivered | Bounded retry on same account first; circuit breaker for shared outage |
| Inference 401 or bootstrap account/read failure | Turn error or JSON-RPC error; routing evidence | Separate auth/routing exclusion; no automatic credential repair beyond native supported policy |
| Goal budget/context limit | Typed error/goal status | Do not evade budget by account rotation; compact only through supported policy or stop |
| User pause/cancel/manual input | User action, interrupt settlement, goal state | Cancel stale recovery and yield ownership; never restart canceled work |
| Approval, user-input, MCP OAuth or biometric request | Server request/pending-request state | Apply only preauthorized automation; otherwise waiting/blocked, not quota |
| Policy/safety denial or guardian circuit breaker | Interrupted terminal status; sometimes typed error, sometimes no separate error | Respect denial; do not rotate to bypass policy |
| Server dies or transport drops | Child exit/EOF/readiness failure | Fence owner, reconcile persisted state and possible tool effects before bounded restart |
| Silent/hung tool or disconnected network with no final event | Liveness/process/tool witnesses; no definitive quota | Watchdog may identify loss of progress, not infer exhaustion; uncertain side effects require reconciliation |
| Unknown error/type or inconsistent state | Forward-compatible union/failed reads | Fail closed with sanitized diagnostic; no blind all-account loop |
| All accounts unavailable | Decision-time observations and resets | Durable waiting with bounded rechecks at known reset/backoff, cancellable by user; stop safely if no valid recovery path |

No TUI character parsing is needed for the demonstrated executing-server failures. Current compatibility mode still needs its narrow text fallbacks for unbound/eventless quota and fatal bootstrap envelopes. An owned server exposes bootstrap RPC failures directly, but machine-readable JSON-RPC envelopes do not guarantee granular machine-readable *causes*: workspace-discovery internals may still require a narrow message fallback or an upstream structured-error improvement. Keep such a fallback versioned, non-quota and explicit.

Some stops are intentionally not errors. A completed goal, permission request or user cancellation must not trigger account selection. A watchdog cannot reliably distinguish an indefinitely slow external tool from an irrecoverably hung tool by elapsed time alone.

## Proposed recovery state machine

```text
START -> acquire conversation lease/generation -> select account
      -> launch private server -> initialize -> verify identity/routing/policy
      -> bind/resume thread -> attach TUI -> RUNNING

RUNNING -> retrying native error -> OBSERVING_NATIVE_RETRY -> RUNNING/SETTLING
RUNNING -> terminal failure -> SETTLING -> classify current attributed outcome
    quota -> snapshot goal + capacity -> fence old owner -> stop old server
          -> SELECT_NEXT -> new generation/server -> verify identity/policy/store
          -> resume/read goal -> eligible usageLimited: activate once
          -> observe native progress -> RUNNING
    transient -> bounded same-account recovery/backoff
    auth/routing -> bounded separate exclusion or BLOCKED
    user/policy/budget/uncertain effects -> STOPPED/WAITING/BLOCKED

SELECT_NEXT -> none -> WAIT_UNTIL_RESET_OR_BACKOFF -> recheck eligible state
Any state -> user cancel -> invalidate generation -> settle owned children -> STOPPED
Any state -> crash -> recover durable lease/state -> reconcile before continuing
```

Persist transitions before irreversible ownership changes. State records need phase, generation, opaque account handle, thread binding, retry reason/time, old-owner settlement, goal-recovery intent and pending-effect uncertainty. Do not persist prompts, token values or raw provider errors. Process IDs alone are insufficient ownership proof because of reuse; track the owned child lifecycle and private endpoint, and never kill a process merely matching a remembered PID.

Exactly-once external tool effects cannot be guaranteed by resuming a thread. A command may have changed files or a remote service before a crash. Preserve completed effects and tool outcomes; use idempotency keys only where the tool supports them. Do not replay an interrupted command blindly. Approval requests belong to a connection/runtime; invalidate outstanding decisions on generation change and reject stale responses.

### Single controller and native TUI

The simplest prototype uses separate supervisor and TUI connections to the private server. This is a hypothesis pending multi-client acceptance: verify subscription fanout, response ownership, approval delivery and simultaneous native goal execution. The supervisor observes and governs recovery; it must not answer TUI-owned approvals twice. If supported fanout cannot enforce this, evaluate one protocol mediation layer with explicit routing rather than silent competing controllers.

Assume TUI relaunch on backend replacement until a supported reconnect path proves otherwise. Native rendering remains native, but terminal modes, stdin ownership, resize and cancellation still need real terminal regression. Detaching the TUI should not silently change whether unattended work remains authorized.

## Provider profiles and GUI feasibility

**Profiles:** nice to have, but never flatten or silently drop launch policy. Local `0.162.1` TUI help defines `-p` as a settings-file layer; app-server help lacks it. Generated resume supports model/provider/config and permission overrides, which is not proof of equivalent profile loading. Prototype a supported policy adapter against source and fake tests, covering project/managed layers, model, sandbox, approval reviewer, writable roots, environment, hooks and provider routing. Until parity passes, failover under that profile is explicitly unsupported rather than partially autonomous. Changing providers may alter model/tool capabilities and context limits; it is not just swapping authentication.

**ChatGPT GUI:** official [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540) currently lists “ChatGPT desktop app (Codex mode)” and remote-control/workspace/device permission requirements. Therefore GUI integration is not categorically absent. However, this is rolling product documentation, not proof that a third-party supervisor can choose an arbitrary private endpoint or rotate identities. Tagged daemon documentation names remote-management clients, not a public universal GUI account-switch API.

Treat ordinary ChatGPT chats, desktop Codex mode and Codex-specific clients as different targets. This spike found no verified API to move an ordinary ChatGPT conversation into a local Codex thread or autonomously change the GUI's logged-in account. [Work with Apps](https://help.openai.com/en/articles/10119604) context/editing features are not app-server lifecycle control. Prioritize CLI; later investigate an official Codex-mode remote surface with explicit authorization. Do not use accessibility automation, browser cookies or hidden credential extraction as an implicit fallback. GUI support remains optional and unverified.

## What “100% autonomous” can honestly mean

The acceptance target is unattended continuation across *recoverable capacity failures* under preauthorized launch policy, compatible account/workspace/provider routing, durable storage, available replacement capacity and a functioning machine/network. Include autonomous reset waiting so a long run does not end simply because every account was exhausted earlier.

It cannot promise completion when every account lacks capacity indefinitely, credentials require human login, a goal budget is exhausted, workspace policy forbids work, approvals demand human action, an external effect is uncertain, the host loses power without recoverable state, or native interfaces change. Autonomous operation must not mean bypassing approval, safety, billing or provider restrictions. Verify account use complies with applicable provider and organization rules before deployment; this spike does not establish that multiple accounts confer permission to evade a limit.

## Phased implementation and acceptance gates

1. **Protocol classifier and capability adapter.** Pin executable/schema provenance; maintain fixtures for the four observed error mappings, normal retry exhaustion, ChatGPT quota/reset envelopes, bootstrap routing errors, unknown variants, cancellation and interrupted-only failures. Require zero TUI parsing on supported owned-server paths. Keep fallback behavior explicit.
2. **Private-server/headless ownership prototype.** Prove initialize readiness, version check, restricted sockets, one conversation writer, identity/routing verification, account-private secret state, reviewed common storage, deterministic shutdown, bounded cancellation and crash recovery. Do not use the user's shared daemon. Compare lifecycle complexity to the current wrapper.
3. **Goal continuity and recovery FSM.** Verify active quota suspension, no restoration of paused/blocked/budget/complete goals, no accounting reset, no duplicate turns, final-state ordering and progress after replacement. Cover all-exhausted reset waits, unknown-reset backoff, stale refresh/wake cancellation and shared outages.
4. **Native TUI integration.** Verify multiple-client event/approval ownership and supported launch-policy parity. Build the current workspace and run automated checks, then obtain permission for real terminal regression covering Bash/Fish, Ghostty/Zellij, IME, resize, Ctrl-C, reconnect/relaunch, concurrent sessions, long tools and no leaked modes/processes. This is a hard gate, not satisfied by the spike's headless probes.
5. **Security and profiles.** Audit path/symlink/permission handling, keyring/file auth precedence, destination restrictions, secret persistence, log redaction, update/download policy and concurrent recovery. Add profiles only after native-policy parity and provider compatibility tests pass.
6. **Optional daemon and GUI work.** Consider per-account persistent daemons only if measurements justify idle complexity. Investigate official GUI endpoint/account capabilities separately; no account migration or GUI automation without renewed authority.

### Go/no-go decision

Proceed with an isolated prototype, not a wholesale rewrite. The clean-API gate is partially proven by native synthetic probes and versioned event handling. The simpler-lifecycle, identity/routing, common-store, multi-client approval and real-terminal gates remain open. If those cannot pass without recreating a fragile control plane, keep the current native-TUI wrapper and pursue upstream structured integration instead.

## Verification and handoff

- Read repository task history and debugging journal before research; preserved their unresolved live-account and terminal limits.
- Generated fresh isolated help and experimental schemas for selected `0.162.1`; cross-checked versioned event handling, goal processor and daemon documentation.
- Ran four isolated localhost error probes: each emitted attributed structured error and failed-turn settlement; mapping differences are documented above.
- Reran existing isolated native goal tests: 3/3 passed. No full build/test suite was run for this documentation-only spike; no runtime source changed.
- Local links and Markdown fences pass; cited GitHub source URLs returned HTTP200. Official Help Center pages were retrieved with the fetch tool; direct Python HTTP checks were denied, so those checks alone are not evidence of broken links.
- Two bounded read-only research children produced reference and native-source briefs; parent reviewed and synthesized them. Their retention-managed outputs are not required to resume: important evidence and source links are in this report.
- No live session, real credential/configuration, GUI, provider quota query, installation, push or release was accessed/performed.

Remaining verification is deliberately an implementation plan, not a research blocker disguised as success. Every unsupported guarantee is explicit. Continue through [TASKS.md](TASKS.md), not temporary artifacts.
