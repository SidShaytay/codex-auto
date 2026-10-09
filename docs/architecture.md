# Architecture and recovery direction

## Current design

codex-auto supervises the native Codex TUI, retaining its terminal experience and using a fresh local process with an account-specific credential overlay for each account attempt. It passes `--no-daemon`; it does not switch credentials underneath a shared background server. Recovery binds one thread and retains launch policy. Quota and fatal bootstrap authorization failures have separate bounded eligibility rules.

The control path currently combines terminal/process observation with saved structured events. PTY handling remains responsible for forwarding input/output, resize, cancellation and terminal restoration. Terminal text is a compatibility fallback, not an authoritative protocol when structured evidence is available.

### Short-lived goal-state bridge

Quota-interrupted goal recovery is a deliberate exception to the embedded-server-only pattern:

```text
quota-stopped TUI and embedded server exit
  → independent stdio app-server starts in the account overlay
  → initialize with experimental API capability
  → thread/goal/get for the bound persisted thread
  → only usageLimited: thread/goal/set(status=active), then verify get
  → helper exits
  → fresh account-isolated TUI resumes the same thread with one Continue
```

The helper never loads/resumes a thread or starts a turn. It changes persisted goal status, preserves objective/budget/accounting, and terminates before the new TUI starts. There is no live-session transfer between servers. The resumed native runtime owns autonomous execution. The helper does not inject `/goal resume` into terminal input, refresh credentials or attach to a shared daemon.

This API route avoids guessing when the TUI is ready for a slash command and avoids racing with user input. It adds a second configuration/control path, so it is an interim bridge rather than the target architecture. Native app-server tooling is labeled experimental; goal access uses `experimentalApi: true`. Capability and behavior must be checked against the selected executable, not inferred solely from an upstream version label.

Profile-selected launches (`-p`/`--profile`) retain the explicit conversation-only/manual-goal fallback. Profile-aware automatic restoration is deferred by user direction. Do not flatten, ignore or substitute the selected profile merely to enable recovery. Unsupported APIs also warn; a detected quota-limited goal whose restoration fails verification stops safely. Concurrent controllers editing the same goal are unsupported because the API lacks a conditional status update.

See [goal acceptance](testing/goal-recovery-acceptance.md) and the [terminal checklist](testing/real-terminal-regression.md) for evidence and limits.

## Candidate redesign: wrapper-owned isolated app-server

After delivery, investigate a private Codex app-server supervised by codex-auto (or a future codex-auth owner), with the native TUI connected through Codex's supported remote transport and a structured wrapper control connection to the same backend. No migration is authorized by this design note. The current native TUI remains the product interface; this is not a proposal to rebuild it.

The value comes from structured lifecycle/error/goal operations on the actual execution backend, not from making a process persistent. JSON-RPC over stdio is structured control; parsing rendered TUI stdout is not. Native TUI input/rendering still needs terminal handling even if recovery no longer interprets those streams.

### Required gates

1. **Clean rate-limit evidence:** demonstrate that the actual app-server emits structured quota/rate-limit errors or notifications for the failures that stop turns, with thread/turn attribution and usable reset data where available. Merely finding account/rateLimits/read or a method in a schema does not prove execution-failure coverage. Distinguish quota, transient provider errors, bootstrap authorization failures, historical replay and cancellation. Use local synthetic providers first; do not query live accounts without authorization.
2. **Cleaner lifecycle:** demonstrate a supervisor simpler and safer than current CLI supervision: bounded startup/readiness, explicit ownership, cancellation/settlement, deterministic shutdown, crash cleanup and recovery, and no leaked server or terminal modes. Measure removed complexity against new reconnect/socket/controller complexity rather than assuming a daemon is simpler.

Additional acceptance requires native TUI launch-policy/configuration equivalence, thread/goal continuity, account identity and workspace routing, approval ownership, event delivery to multiple clients, manual input precedence, safe socket permissions and isolated concurrent runs. Verify all against the selected executable in separate authorized terminals.

Start by evaluating **a fresh private server per account attempt**, not one permanent daemon that swaps live credentials. On account replacement, settle and stop the old server, create the new account-isolated server, restore the bound thread/goal, then reconnect or relaunch the TUI. This retains today's process-isolation boundary until a different identity-switch mechanism proves safe.

A Unix-domain socket is a candidate local transport, subject to permission and multi-client verification. Do not use or modify the user's shared Codex daemon for the prototype. No provider proxy, credential refresh service or credential uploads are implied.

## Comparison: pi-multi-account

[pi-multi-account](https://github.com/Sarrius/pi-multi-account), inspected at commit `ae7be3eb8b23fa346ab28993dd4526be53a70ffd`, is primarily an in-process Pi extension, not a native CLI supervisor. Its source uses Pi lifecycle hooks and model-selection interfaces; continuation uses continueAgent when present and a host follow-up message fallback otherwise. Pi retains the live session. codex-auto must instead establish native process identity and persisted thread ownership across restarts.

The transferable principles are host-supported control interfaces, session-local ownership, invalidating stale recovery after manual actions, bounded retries, separate temporary/auth/quota classifications, and explicit guarantee-to-regression mapping. Its integration advantage does not prove a Codex daemon will preserve approvals, identity or configuration. No external repository code was executed as part of this comparison.
