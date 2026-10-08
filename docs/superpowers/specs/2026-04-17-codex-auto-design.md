# codex-auto Design

Date: 2026-04-17
Status: draft

## 1. Overview

`codex-auto` is a macOS terminal CLI that hosts native `codex` sessions. When the current account reports an explicit quota or rate-limit error, it switches to the next account in a configured sequence, resumes the same Codex session, and automatically sends `继续` (Chinese for “continue”). The literal prompt is preserved throughout this historical design.

The first version focuses on these capabilities:

- `codex-auto`: enter a managed conversation directly
- `codex-auto list`: view accounts and the current rotation position
- `codex-auto add <name>`: create and sign in to a new account
- `codex-auto remove <name>`: remove an account, including the last account
- `codex-auto --account <name>`: choose the account to use first for this run

## 2. Goals and Non-goals

### 2.1 Goals

- Manage sequential rotation across multiple Codex accounts
- Let users onboard accounts with `add`, without manually copying credentials
- Switch accounts automatically only for clearly identified quota or rate-limit errors
- Continue the same session after switching, rather than create a new thread
- Automatically send `继续` after resuming, without manual confirmation
- Leave the user's existing `~/.codex` unchanged; store managed state in `~/.codex-auto`

### 2.2 Non-goals

- Windows or Linux support
- A GUI or a replacement TUI
- Automatic switching for non-quota failures such as network errors, permission errors, or expired sign-in
- Account priorities, primary/backup groups, or weighted scheduling
- Protocol-level app-server integration; the first version only hosts a PTY

## 3. External Constraints

These facts are based on official documentation and local tests with `codex-cli 0.121.0` on 2026-04-17.

### 3.1 Official Documentation

- User configuration defaults to `~/.codex/config.toml`; `--profile <name>` loads a profile from that file.
- `codex resume --last` resumes the latest interactive session in the current working directory and accepts a first prompt after resuming.
- Credentials may be cached in `~/.codex/auth.json` or the system keyring. Setting `cli_auth_credentials_store = "file"` uses `auth.json` under `CODEX_HOME`.
- File-based credentials are sensitive and must be treated like passwords.

### 3.2 Local CLI

- Installed version: `codex-cli 0.121.0`
- `codex --help` exposes `--profile`, `--no-alt-screen`, `resume`, and `login`.
- `codex resume --help` confirms support for `--last` and a follow-up prompt.
- Native binary strings include `CODEX_HOME`, `auth.json`, and `session_index.jsonl` path identifiers.
- Binary strings include error/event identifiers such as `usageLimitExceeded` and `rateLimits`.

### 3.3 Design Conclusions

- Multiple profiles in one `config.toml` do not replace separate authentication caches.
- A separate complete `CODEX_HOME` per account cannot directly serve as the runtime layout, because `resume --last` would not reliably reconnect to the same managed session.
- Separate shared runtime session state from account-private credentials and configuration.

## 4. Architecture

Implement `codex-auto` in Node.js and TypeScript as a foreground wrapper around native `codex`.

The architecture has three layers:

1. Account management
   - Maintain accounts, rotation order, and the current cursor
   - Provide `list`, `add`, and `remove`
2. Runtime orchestration
   - Synchronize the selected account's credentials and configuration into the shared runtime before starting
   - Select the next account and rebuild the runtime context when quota is exhausted
   - Execute `codex resume --last "继续"`
3. Terminal hosting
   - Start native `codex` in a PTY
   - Forward stdin/stdout/stderr
   - Watch output for quota exhaustion signals

## 5. Directories and State

Store all managed state under `~/.codex-auto/`.

### 5.1 Shared Runtime

Path: `~/.codex-auto/runtime/`

Purpose:

- Serve as `CODEX_HOME` for managed `codex` processes
- Preserve shared files needed for session continuity

Expected contents:

- `session_index.jsonl`
- `sessions/`
- `history.jsonl`
- `state_*.sqlite`
- `logs_*.sqlite`
- `auth.json`
- `config.toml`

Rules:

- Keep session files in the runtime across account switches.
- On each switch, replace `auth.json` and runtime `config.toml` with the selected account's contents.

### 5.2 Account-private Directory

Path: `~/.codex-auto/accounts/<name>/`

Store each account's independent authentication cache and account configuration here.

Expected contents:

- `auth.json`
- `config.toml`
- `meta.json`

Notes:

- The first version requires accounts added with `add` to use file-based credentials. Depending on the system keyring would prevent orchestration of account switching.
- `meta.json` holds non-sensitive display metadata such as account name, creation time, and last-used time.

### 5.3 Global State File

Path: `~/.codex-auto/state.json`

Suggested structure:

```json
{
  "version": 1,
  "accounts": ["a", "b", "c"],
  "currentIndex": 0,
  "lastSuccessfulAccount": "a",
  "updatedAt": "2026-04-17T10:00:00.000Z"
}
```

Rules:

- `accounts` defines rotation order.
- `currentIndex` selects the default starting account.
- When there are no accounts, `currentIndex` is `null`.
- Use atomic replacement for every write.

## 6. CLI Contract

### 6.1 `codex-auto`

- With no accounts, fail and instruct the user to run `codex-auto add <name>`.
- Otherwise, start with the account at the current cursor in `state.json`.
- `--account <name>` overrides the starting account for this run.
- Automatically rotate to the next account when quota exhaustion is detected.

### 6.2 `codex-auto list`

Show account order, the current cursor, and each account's name. Never display sensitive credentials.

### 6.3 `codex-auto add <name>`

- Create `~/.codex-auto/accounts/<name>/`.
- Write a minimal account `config.toml`.
- Run `codex login` in that account's directory context.
- Append the account to the rotation list only after sign-in succeeds and credentials are saved.

Failure handling:

- Roll back `add` if sign-in fails or credentials are missing.
- Do not write incomplete accounts to `state.json`.

### 6.4 `codex-auto remove <name>`

- Remove the account from `state.json` and delete its private directory.
- Allow removal of the last account.
- If the list becomes empty, set `currentIndex` to `null`.
- If the current account is removed, select the account now at the same position. If no account occupies that position, return to index 0, except for an empty list.

## 7. Account Onboarding

`add` must explicitly configure file-based credentials so `codex-auto` can manage switching.

Suggested minimal account `config.toml`:

```toml
cli_auth_credentials_store = "file"
```

Future account-specific settings, such as model, approval policy, or sandbox mode, may live in the account's own `config.toml`. The first version does not require a separate profile management UI.

## 8. Managed Run Flow

### 8.1 Startup

1. Read `state.json`.
2. Select the account at the current cursor.
3. Replace runtime `auth.json` with that account's credentials.
4. Combine the runtime base template and account configuration into runtime `config.toml`.
5. Start native `codex` with `CODEX_HOME=~/.codex-auto/runtime`.
6. Append `--no-alt-screen` by default to make PTY output easier to observe.

### 8.2 Normal Conversation

- Forward user input directly to native `codex`.
- Buffer logs and identify quota errors without rewriting normal interaction content.

### 8.3 Account Switch

When an explicit quota/rate-limit error is detected:

1. Add the current account to the set of accounts exhausted in this session.
2. Gracefully terminate the current `codex` process.
3. Select the next account in order that has not been exhausted in this session.
4. Replace runtime credentials and account configuration with the new account's data.
5. Execute `codex resume --last "继续"`.
6. Repeat if another quota error occurs.

### 8.4 All Accounts Exhausted

Exit the managed session and print a clear message that every account is exhausted.

## 9. Session Continuity

Continue the same session after switching accounts rather than starting a new one.

- Always use one shared runtime `CODEX_HOME`.
- Replace only runtime credentials and account configuration during switching.
- Preserve runtime session indexes and history.
- Use `codex resume --last "继续"` consistently.

This depends on two conditions:

- `resume --last` can still find the previous thread in the shared runtime.
- The follow-up prompt sends `继续` as the first user message after resuming.

If later testing finds `--last` unreliable in edge cases, record and use an explicit `SESSION_ID`. Do not add this complexity in the first version.

## 10. Error Detection

### 10.1 Errors That Trigger Switching

Switch only for explicit errors in these categories:

- `usage limit exceeded`
- `usageLimitExceeded`
- `rate limit reached`
- `quota exceeded`
- `limit reached`
- Equivalent Chinese quota exhaustion or rate-limit messages

The first version checks both live output and the trailing output buffer after a failed process exit.

### 10.2 Errors That Do Not Trigger Switching

- Network connection failures
- Expired sign-in
- Permission or sandbox errors
- Workspace command failures
- User-requested exit

Switch only when the current account clearly cannot continue consuming quota. Do not mistake transient failures for exhaustion.

## 11. Configuration and Synchronization

### 11.1 Runtime `config.toml`

Combine stable base configuration controlled by `codex-auto` with the current account's configuration.

First-version base setting:

- `cli_auth_credentials_store = "file"`

Default launch argument:

- `--no-alt-screen`

A future `codex-auto config` command could manage runtime base settings if users need it; it is outside the first version.

### 11.2 Synchronization Rules

Synchronize only:

- `accounts/<name>/auth.json` -> `runtime/auth.json`
- `accounts/<name>/config.toml` -> input to generated `runtime/config.toml`

Never overwrite:

- `runtime/session_index.jsonl`
- `runtime/sessions/`
- `runtime/history.jsonl`
- `runtime/state_*.sqlite`

## 12. Reliability

### 12.1 Atomic Writes

Use a temporary file followed by atomic rename for:

- `state.json`
- `runtime/config.toml`
- `runtime/auth.json`
- `accounts/<name>/meta.json`

### 12.2 Single-instance Lock

Add a runtime lock file in the first version, for example `~/.codex-auto/runtime/.lock`.

This prevents two wrappers from manipulating the same runtime or overwriting each other's credentials and configuration. If an active lock exists, fail with a message that a managed session is already running.

### 12.3 Logs

Suggested location: `~/.codex-auto/logs/`

Record at least:

- Starting account
- Switch time
- Signal that triggered switching
- Resume command result
- Final session exit reason

Never log complete tokens or the contents of `auth.json`.

### 12.4 Directory Permissions

Restrict account and runtime directories to the current user's access when creating them, to prevent credential exposure.

## 13. Technology Choices

Suggested stack:

- Node.js 20+
- TypeScript
- `commander` for command parsing
- macOS `script` for interactive PTY hosting
- Plain shell subprocesses as a non-interactive test fallback
- `zod` or an equivalent library for `state.json` / `meta.json` validation

Do not base the first implementation primarily on shell scripts: PTY management, recovery across steps, and atomic state writes would become fragile.

Implementation note: the initial implementation tried `node-pty`, but it could not start reliably in the current macOS environment, so it switched to the system `script` tool for interactive PTY hosting.

## 14. Testing

### 14.1 Unit Tests

Cover:

- `state.json` reads, writes, and schema validation
- `currentIndex` correction
- Removing the current account and the last account
- Rotation using the session's exhausted-account set
- Quota error text detection

### 14.2 Integration Tests

Use a fake `codex` executable that:

- Emits a quota exhaustion error and exits on the first run
- Accepts `resume --last "继续"` and continues normally on the second run

Verify switching, correct runtime credential replacement, execution of the resume command, and delivery of `继续` as the resumed prompt.

### 14.3 Manual Acceptance

Scenarios:

- Full `add/list/remove` flow
- Normal conversation with one account
- Automatic switching between two accounts
- Exit message when every account is exhausted
- Error message from bare `codex-auto` after removing the last account

## 15. Known Risks and Mitigations

### Risk 1: `--no-alt-screen` Does Not Expose Every Quota Error

- Keep a trailing buffer of the last N output lines for checks after exit.
- Centralize the error phrase list and make it extensible.

### Risk 2: Some Environments Default to Keyring Credentials

- Force `cli_auth_credentials_store = "file"` in the account directory during `add`.
- Check for `auth.json` after sign-in; fail `add` if it is missing.

### Risk 3: `resume --last` Depends on Working-directory Scope

- Pass the same working directory during startup and resume.
- Persist an explicit `SESSION_ID` in a second version if later testing requires it.

### Risk 4: Concurrent Sessions Overwrite Runtime State

- Prohibit multiple instances sharing the same runtime in the first version.

## 16. Suggested Implementation Stages

### Stage 1

- Initialize state directories
- Implement `list/add/remove`
- Add a minimal runtime lock

### Stage 2

- Host `codex-auto` in a PTY
- Synchronize runtime credentials
- Implement automatic switching and `resume --last "继续"`

### Stage 3

- Complete logging
- Add fake `codex` integration tests
- Address edge cases

## 17. References

Official documentation:

- Config Basics: https://developers.openai.com/codex/config-basic
- Authentication: https://developers.openai.com/codex/auth
- Command Line Options: https://developers.openai.com/codex/cli/reference

Key evidence:

- Config Basics describes `~/.codex/config.toml` as the default user configuration path and `--profile` as loading profiles from that file.
- Authentication describes `auth.json` or system credential storage and locates file-based credentials under `CODEX_HOME`.
- Command Line Options describes `codex resume --last`, the follow-up prompt, and disabling the alternate screen with `--no-alt-screen`.
