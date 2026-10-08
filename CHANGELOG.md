# Changelog

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
