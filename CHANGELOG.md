# Changelog

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
