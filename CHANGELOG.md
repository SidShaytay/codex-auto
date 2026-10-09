# Changelog

## 0.3.5

### Fixed

- Fatal workspace-routing authorization401 during native TUI bootstrap now skips the unavailable account for this run and retries another eligible account on the same bound thread. Authorization failures are distinct from quota observations and cannot cause an unbounded retry loop. No login or credential refresh is attempted.
- Failed non-quota launches no longer update the successful-account marker or clear saved retry evidence. Authorization switches and eligibility reasons appear in sanitized diagnostics.
- The existing missing-session regression now drains all buffered stderr chunks instead of checking only the first diagnostic chunk; safe-resume behavior remains unchanged.

### Verification and architecture

- Added native0.162.1 autonomous-goal positive/negative controls and a reproducible isolated real-terminal goal driver. Completion-event checks now wait for the required persisted goal state instead of assuming goal finalization precedes turn completion.
- Documented the temporary goal-state bridge and deferred profile recovery. A future wrapper-owned isolated-server investigation must prove clean structured rate-limit signals and simpler lifecycle management before migration.

No credential migration is required. Installation affects future launches only; running sessions remain unchanged.

## 0.3.4

### Fixed

- Automatic quota recovery restores the bound session's `usageLimited` goal to active through native Codex goal APIs before resuming. The objective, budget and usage counters are preserved; other goal states are unchanged. Native API support is verified with Codex 0.161.0. An unavailable API produces an explicit conversation-only warning; a failed restoration of a confirmed quota-limited goal stops recovery. Profile launches also warn and use conversation-only recovery because the native app-server cannot accept the TUI profile selector.
- Goal recovery uses an independent local server without loading the thread, connecting to a shared daemon, injecting terminal input, or starting tools. It verifies active-state acknowledgement and closes before the resumed TUI starts. Sanitized diagnostic outcomes omit objectives and raw errors.

No credential migration is required. Existing running sessions are not changed by this patch or an installation. Use the new build for future launches when convenient. The native API has no conditional update; concurrent goal edits by another controller of the same thread are unsupported. Automated, isolated native API, and 11 fake-account cases in a real Ghostty terminal pass. Native provider goal-loop and visual/IME acceptance remain untested.

## 0.3.3

### Fixed

- Previously quota-limited accounts become eligible again after a supported recorded retry time passes during the same managed run. New quota errors replace prior reset evidence; missing, invalid or non-future reset times remain excluded to prevent immediate retry loops. Selection uses the latest configured account order.

### Added

- Switch and no-eligible-account diagnostics record the considered accounts, quota-observation/reset timestamps, eligibility reasons, and whether live quota was refreshed. Exported reports and debug output anonymize accounts and bound snapshot size. The stop message distinguishes local eligibility from actual provider capacity; no live provider usage query is added.

No credential migration is required. Running wrappers must be exited and resumed to load this build when convenient; installation does not update an existing process. Automated reset-crossing regression passes, but real terminal regression remains pending.

## 0.3.2

### Fixed

- Bound interactive sessions detect newly appended structured `usage_limit_exceeded` completion errors even when Codex redraws the prompt below the quota message. Existing transcript records and other threads do not trigger this event path. No credential migration is required; running wrappers must be exited and resumed to load the new build.
- Screen-text detection remains the fallback when a bound session or structured event is unavailable. The five-second history-replay limitation remains; this patch does not establish complete event-based detection or full real terminal acceptance.

## 0.3.1

### Fixed

- Interactive quota detection recognizes cursor-positioned prompts and allows five seconds for startup history replay before acting on quota text without a recognized prompt. This mitigates the reproduced false account-exhaustion stop; replay that exceeds the grace period can still be misclassified. No account migration is required. Event-based detection and broader terminal acceptance remain pending.

## 0.3.0

### Changed

- Managed interactive launches and automatic resumes always use `--no-daemon`. Explicit repeats are deduplicated. Codex must support this flag; older versions fail rather than silently using a shared server.
- `--remote`, `--remote-auth-token-env`, and server commands (`agents`, `app-server`, `remote-control`) are rejected for managed sessions, before account import or launch. Use native Codex for shared-server connections and agent browsing. Non-interactive commands such as `exec` keep their existing arguments.

This pre-1.0 minor version changes server compatibility. Existing local accounts need no migration. Real terminal acceptance of account recovery remains pending; this release does not establish that the originally reported quota mismatch is fully resolved.

## 0.2.8 — Fork additions

- Source snapshot installation with `npm run install:local` and executable build output.
- Preserve explicit launch policy across automatic account recovery.
- Automatic sanitized local incident reports, retention controls, and optional debug output.
- Build-time Git revision in version output and diagnostic reports.
- Updated English documentation, Chinese README, security review, and terminal regression checklist.

This section summarizes the fork additions; earlier upstream release history is not reconstructed here.
