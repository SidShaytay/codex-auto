# What is codex-auto?

`codex-auto` is a wrapper around `codex` CLI to auto-switch accounts when your current account runs out of tokens. Buy as many accounts as you need to keep your work ongoing. Credentials stay local on your machine.

English | [简体中文](./README.zh-CN.md)

## Prerequisites

- Node.js 20+ recommended. The package declares Node.js 18+, but its Commander 14 dependency requires Node.js 20+.
- macOS or Linux terminal environment; on Windows, run `codex-auto` inside WSL instead of native `cmd.exe` or PowerShell
- `codex` CLI installed and executable
- `codex login` and `codex resume` working properly

## Installation

Install globally via npm:

```bash
npm install -g codex-auto
```

Verify the installation:

```bash
codex-auto --help
codex-auto --version
```

Upgrade to the latest version:

```bash
npm install -g codex-auto@latest
```

Uninstall:

```bash
npm uninstall -g codex-auto
```

To run your fork from source, see [Build and run this checkout](#build-and-run-this-checkout).

## Quick Start

Start a managed session right away:

```bash
codex-auto
```

On first run, if your source `CODEX_HOME` already has a usable login, `codex-auto` imports it as `default` automatically.

Add more accounts:

```bash
codex-auto add a
codex-auto add b
```

List accounts:

```bash
codex-auto list
```

`codex-auto list` marks the active account with `*`. When an account is still waiting for quota to reset, the list shows the retry time from Codex next to that account.

Start a managed session:

```bash
codex-auto
```

Start with a specific account:

```bash
codex-auto --account b
```

Save a default start account for future runs:

```bash
codex-auto use b
```

Activate an account for the native `codex` CLI:

```bash
codex-auto activate b
```

`codex-auto activate <name>` writes that account's `auth.json` to the source `CODEX_HOME`, so running `codex` directly uses the same account. `codex-auto activate` without a name re-syncs the account marked with `*`.

Start from a custom source `CODEX_HOME`:

```bash
codex-auto --codex-home /path/to/.codex
```

Remove an account:

```bash
codex-auto remove b
```

Show the installed version:

```bash
codex-auto --version
codex-auto version
```

Source builds include their Git revision in version output, for example `0.3.0+git.abcdef123456`. A `.dirty` suffix means tracked files had uncommitted changes when built. The revision is saved in the installed snapshot, so it still identifies that build outside the checkout. Builds without Git metadata show the base package version.

In an interactive terminal, `codex-auto` periodically checks npm for a newer `codex-auto` release. When one is available, it prompts you to update now, skip that version, or postpone the reminder. Set `CODEX_AUTO_UPDATE_CHECK=0` to disable the check.

## Use Cases

- You have multiple Codex accounts available
- You don't want to manually edit `auth.json` or `config.toml`
- You want automatic account rotation and session recovery when quota is exhausted
- You want to keep your original Codex sessions, plugins, and MCP configuration

## Features

- Manage multiple account configurations
- Run `codex login` automatically when adding a new account
- Bootstrap a `default` account from your existing Codex setup on first run
- Import existing `auth.json` and `config.toml` files
- Start managed runs even when the source `CODEX_HOME` has not been initialized yet
- Launch managed `codex` sessions
- Keep interactive Codex sessions usable in normal terminal workflows, including clean shell input after automatic rotation or forced stops
- Save a default start account for future runs
- Activate a managed account for the native `codex` CLI by writing only that account's `auth.json`
- Prompt for available `codex-auto` updates in interactive terminals, with update, skip, or later choices
- Automatically switch to the next account on rate limit
- Recognize current Codex quota prompts, including upgrade/purchase messages with retry times
- Show retry times for accounts that are still waiting for quota to reset
- Bind each active managed session to its own recovery target across same-project and cross-project concurrent runs
- Resume only the session ID already bound to the current managed run instead of guessing from the latest session
- Give a fresh run a brief chance to capture its own recovery target before automatic recovery is abandoned
- If you cancel an interactive quota prompt with `Ctrl-C`, exit that managed run cleanly instead of forcing an exhausted-accounts flow
- Stop automatic recovery when the original session cannot be confirmed or its session ID is no longer valid
- Automatically send `Continue` on resume
- Record local session events and recovery state
- Pass through all `codex` arguments and subcommands (e.g. `exec`, `review`, `--model`, `--full-auto`)

## Passing Through Codex Arguments

Any arguments not recognized as `codex-auto` commands (`activate`, `add`, `remove`, `list`, `use`, `version`, `diagnostics`) are forwarded directly to `codex`:

```bash
# Pass a prompt
codex-auto "fix the login bug"

# Use a specific model
codex-auto --model o3 "refactor the auth module"

# Non-interactive exec mode
codex-auto exec "add unit tests"

# Full-auto with a specific account
codex-auto --account b --full-auto "migrate to TypeScript"

# Code review
codex-auto review
```

All passthrough invocations retain multi-account rotation: if the current account hits a rate limit, `codex-auto` automatically switches to the next account and resumes.

`--account <name>` is a one-run override. `codex-auto use <name>` changes the default start account for later runs.

## Importing Existing Configurations

If you already have account credentials, import them directly:

```bash
codex-auto add work --auth /path/to/auth.json --config /path/to/config.toml
```

Rules:

- `--auth` imports account credentials
- `--config` imports account configuration
- If `--auth` is not provided, `codex login` runs automatically
- `config.toml` is guaranteed to include `cli_auth_credentials_store = "file"`

## How It Works

`codex-auto` is a wrapper around your installed `codex` CLI. Codex still handles the conversation, model requests, tools, and authentication to its configured provider. The wrapper manages local account credentials, starts and supervises the Codex process, watches terminal output for quota errors, and restarts the same session with another account when needed.

### One shared setup, separate credentials

Each managed run gets a temporary Codex home under `~/.codex-auto/instances/<id>/`. The wrapper launches Codex with `CODEX_HOME` pointing there and puts a real copy of the selected account's `auth.json` in that directory. Account imports and swaps are local file operations; the wrapper does not upload credentials. The launched Codex process uses those credentials for its normal provider authentication.

The rest of the run's setup comes from your existing Codex home, normally `~/.codex`, or the source directory you specify with `CODEX_HOME`. This lets account changes reuse your configuration, MCP settings, plugins, and saved sessions instead of creating a separate installation and conversation history for every account.

`codex-auto` maintains its own data directory, by default at:

```bash
~/.codex-auto
```

Directory structure:

```text
~/.codex/                  # source Codex home; activate replaces auth.json
├── auth.json
├── config.toml
├── sessions/
└── ...

~/.codex-auto/
├── accounts/
│   ├── a/
│   │   ├── auth.json
│   │   ├── config.toml
│   │   └── meta.json
│   └── b/
├── instances/
│   └── <timestamp-pid-uuid>/
│       ├── auth.json
│       ├── config.toml -> ~/.codex/config.toml
│       ├── session_index.jsonl -> ~/.codex/session_index.jsonl
│       ├── sessions -> ~/.codex/sessions
│       └── ...
├── logs/
├── runs/
│   └── <run-id>.json
└── state.json
```

- `accounts/<name>/` — per-account auth/config storage
- `instances/<id>/` — per-run overlay used as `CODEX_HOME` and reused across account switches in that run
- `runs/<run-id>.json` — current managed process status, bound session ID, and recovery state
- `state.json` — account order, current index, default start account, last successful account, and the latest successfully bound session ID
- `logs/` — local session event logs

### Why the symlinks?

The wrapper creates a symlink for **each existing top-level entry** in the source Codex home, with two exceptions: `auth.json` is copied from the selected account, and `models_cache.json` is left for Codex to recreate for that run. It also ensures that `sessions/`, `history.jsonl`, and `session_index.jsonl` exist before linking them.

It does not walk every subfolder and create individual links. A single link such as `sessions -> ~/.codex/sessions` makes the whole directory tree accessible. This avoids copying potentially large histories and keeps managed runs and native Codex using the same saved sessions. Entries created later in the source home are not automatically added as new top-level links to an already running instance.

**These links share live data; they are not backups or a sandbox.** Writes through a linked directory can change the original files, and accounts using the same source home share its configuration and conversation history. A program that replaces a linked file with an atomic rename can instead create a run-local file; this is why the model cache is excluded. Managed runs use the source `config.toml`, not the stored per-account configuration. Use separate source homes when you need separate histories or setups; the wrapper does not enforce isolation between accounts.

### What happens when an account hits its limit?

The wrapper keeps the same temporary home, replaces only its local `auth.json`, and launches `codex resume --no-daemon --no-alt-screen <session-id> Continue` for the session bound to that run. It removes the temporary home when the managed run finishes; shared files in the source home remain. Normal managed runs do not replace the source home's `auth.json`.

`codex-auto activate <name>` is the explicit command that writes an account's `auth.json` back to the source `CODEX_HOME` for native `codex` usage. It does not copy account `config.toml`.

Interactive sessions keep the standard Codex terminal experience, including full-screen and split-pane workflows, while `codex-auto` continues automatic account rotation and session recovery in the background and returns control to your shell in a normal input state after a forced stop or quota-driven switch.

### A fresh local server for each run

The wrapper enforces `--no-daemon` on interactive launches and automatic resumes, keeping one copy if supplied repeatedly. You do not need to type it. A running shared server does not automatically read externally replaced credentials, so switching accounts requires a fresh server. Codex must support this flag; unsupported versions fail rather than falling back to a shared server.

`--remote` (including `--remote=...`), `--remote-auth-token-env`, and server commands (`agents`, `app-server`, `remote-control`) are incompatible and rejected before account import or launch. Use native `codex` to connect to another server or browse shared agents. Non-interactive commands such as `exec` keep their existing arguments.

### Inline terminal display

`--no-alt-screen` tells Codex to draw its interface in the normal terminal buffer instead of a separate full-screen buffer. This preserves scrollback, so you can scroll back through output after exiting. It changes display behavior, not credentials, daemon use, approvals, or sandbox policy. See the [Codex CLI reference](https://developers.openai.com/codex/cli/reference).

This wrapper adds the flag by default for interactive launches and automatic recovery. Inline display keeps output in scrollback when Codex exits and restarts during recovery. The repository also records terminal redraw and split-pane compatibility concerns, though it does not establish the original author's exact reason for choosing this flag. It is not required for credential switching.

## Account Switching & Session Recovery

The current version only triggers a switch when a genuine rate-limit message is detected, avoiding false positives from warning-like output.

When a rate limit is hit:

1. Mark the current account as exhausted
2. Switch to the next available account
3. Replace the current run overlay's `auth.json` with the next account
4. Resume only the session ID already bound to that managed run
5. Run:

```bash
codex resume --no-daemon --no-alt-screen <session-id> Continue
```

Recovery preserves explicitly supplied approval, sandbox, configuration, profile, model, and provider settings. For example, when you start with:

```sh
codex-auto --no-daemon -a never --no-alt-screen -s danger-full-access
```

`--no-daemon` also applies after a quota switch: Codex runs without its shared background server. The approval and sandbox settings also carry over. Original prompts, image attachments, and session-picker selection flags are not replayed; recovery uses the session ID bound to this run. This prevents a switch from silently changing the launch policy, but does not establish that all stale quota or account-status behavior in external Codex is resolved.

If a fresh run has already triggered quota handling but its recovery target is still catching up, `codex-auto` gives that run a short window to capture its own session ID before surfacing a recovery failure. If the current managed run still has not safely captured its own session ID, or if that bound session ID is no longer available, `codex-auto` stops automatic recovery and surfaces the failure instead of falling back to `codex resume --last`.

If an interactive quota prompt is already on screen and you press `Ctrl-C`, `codex-auto` treats that as a user cancel for the current managed run. It restores the terminal state and exits cleanly instead of continuing into automatic exhausted-account handling.

To prevent stale transcript interference, rate-limit detection switches to only the output after the most recent live prompt once startup or recovery has reached that prompt.

Concurrent run behavior:

- Multiple `codex-auto` sessions in different terminals for the same project each keep their own recovery binding
- Multiple `codex-auto` sessions in different terminals for different projects also recover independently
- Recovery decisions are always scoped to the active managed process, not to the latest project-level or global session

## Environment Variables

- `CODEX_AUTO_HOME`
  Data directory for `codex-auto`. Default: `~/.codex-auto`

- `CODEX_HOME`
  Source Codex home used as the overlay base. Default: `~/.codex`

- `CODEX_AUTO_CODEX_BIN`
  Path to the `codex` executable. Default: `codex`

- `CODEX_AUTO_UPDATE_CHECK`
  Set to `0` to disable interactive update prompts.

- `CODEX_AUTO_DEBUG`
  Set to `1` for live sanitized launch and recovery details on stderr. Automatic incident collection is always enabled.

- `CODEX_AUTO_DIAGNOSTICS_RETENTION_DAYS`
  Generated report retention in days. Default: `30`; for example, `7` keeps unpinned reports for one week.

Example:

```bash
CODEX_AUTO_HOME=/tmp/codex-auto \
CODEX_HOME=/Users/me/.codex \
CODEX_AUTO_CODEX_BIN=/opt/homebrew/bin/codex \
codex-auto --account a
```

## Command Reference

```bash
# Account management (codex-auto own commands)
codex-auto add <name>
codex-auto add <name> --auth /path/to/auth.json --config /path/to/config.toml
codex-auto list
codex-auto use <name>
codex-auto activate [name]
codex-auto remove <name>
codex-auto version
codex-auto --version
codex-auto diagnostics

# Managed session (default)
codex-auto
codex-auto --account <name>
codex-auto --codex-home /path/to/.codex

# Passthrough to codex (all other arguments)
codex-auto [any codex arguments...]
codex-auto --account <name> [any codex arguments...]
codex-auto --codex-home /path/to/.codex [any codex arguments...]
```

## Development

### Build and run this checkout

Use Node.js 20+ and run these commands from your fork's directory:

```sh
npm ci
npm run build
env CODEX_AUTO_UPDATE_CHECK=0 node ./dist/index.js --help
```

`npm ci` installs the dependencies pinned in `package-lock.json`; it still downloads dependencies from npm. The CLI you run with `node ./dist/index.js` is built from **this checkout**, regardless of any globally installed `codex-auto`. Installation runs the project's build hook and dependency setup hooks, including `node-pty`'s bundled-binary check or native compilation fallback. To install without executing lifecycle hooks, use `npm ci --ignore-scripts`, then build explicitly; native dependencies may need their reviewed setup steps before interactive use.

Start the local build from the project you want Codex to work on:

```sh
cd /path/to/project
env CODEX_AUTO_UPDATE_CHECK=0 node /path/to/your/fork/dist/index.js
```

The working directory determines the project Codex opens. These examples work in bash and fish. Disabling update checks keeps development runs from offering to replace your fork with the upstream npm release. Runs still use your configured accounts and source Codex home unless you override them.

### Test changes before committing

After editing `src/`, rebuild and restart the CLI:

```sh
npm run build
npm test
env CODEX_AUTO_UPDATE_CHECK=0 node ./dist/index.js --help
```

Run a focused test when debugging a particular area:

```sh
npm test -- tests/session/session.test.ts
```

For a JavaScript debugger, start the built entry point with `node --inspect-brk ./dist/index.js` (and disable update checks with `env CODEX_AUTO_UPDATE_CHECK=0` as above). The debugger pauses before startup so you can attach a Node-compatible debugger. The current build does not emit source maps, so stepping uses compiled files in `dist/`.

Changes affecting interactive behavior also require the [real terminal regression checklist](./docs/testing/real-terminal-regression.md), using the freshly built entry point in a real terminal. Automated tests alone do not verify terminal behavior. Keep bug fixes and their focused tests separate from unrelated working-tree changes when staging a commit.

### Make the local build available as a command

Optionally, from the fork directory:

```sh
npm link --ignore-scripts
command -v codex-auto
realpath (command -v codex-auto)
```

The last command uses fish syntax; in bash, use `realpath "$(command -v codex-auto)"`. The resolved path should end at this checkout's `dist/index.js`. `npm link` makes the global command point to the local checkout ([npm link reference](https://docs.npmjs.com/cli/v11/commands/npm-link/)); it can replace the existing command in that npm prefix. Rebuild after source edits; the link stays valid, and the build keeps the CLI entry point executable. If another installation appears earlier on `PATH`, use the explicit `node /path/to/your/fork/dist/index.js` command.

### Install this fork as your system command

From the fork directory, run:

```sh
npm run install:local
command -v codex-auto
codex-auto --version
```

This builds the checkout and installs a snapshot into your configured npm global prefix. It uses the local package, not the published `codex-auto` release. Dependencies still come from the configured npm registry. Installation disables lifecycle scripts; native dependencies may need reviewed setup steps on platforms without a suitable bundled binary.

After changing source, run `npm run install:local` again to update the installed command. `npm run build` alone updates only the checkout; the installed snapshot stays unchanged. `npm link` is an optional alternative for a live development link.

Start the installed fork with your chosen Codex settings:

```sh
codex-auto --no-daemon -a never --no-alt-screen -s danger-full-access
```

Use `env CODEX_AUTO_UPDATE_CHECK=0 codex-auto ...` to disable upstream update prompts when running the fork. The install command uses [npm's `--install-links` option](https://docs.npmjs.com/cli/v11/commands/npm-install/) to install a copy rather than a link to the checkout.

## Automatic diagnostics

The wrapper records launch and recovery context from the start of each run. A quota switch, exhausted-account stop, recovery failure, or abnormal exit automatically saves a sanitized report and prints its location. No debug flag or post-incident command is required.

Reports live in `~/.codex-auto/diagnostics/` (or `<CODEX_AUTO_HOME>/diagnostics/`). They include wrapper/build identity, recent events, session-binding state, and explicit launch-policy summaries. Account/run identifiers are anonymized. Reports exclude credentials, configuration contents, environment values, prompts, transcripts, workspace paths, and raw session IDs. They do not capture the external Codex daemon's internal state or network traffic.

Attach the generated `incident-*.json` file when reporting a problem. You can also export current sanitized context:

```sh
codex-auto diagnostics > codex-auto-diagnostics.json
```

Reports expire after 30 days by default. To use 7 days, set this environment variable when launching the wrapper:

```sh
env CODEX_AUTO_DIAGNOSTICS_RETENTION_DAYS=7 codex-auto --no-daemon -a never --no-alt-screen -s danger-full-access
```

Keep the latest report while investigating, then release it when finished:

```sh
codex-auto diagnostics --keep latest
codex-auto diagnostics --release latest
```

You can use a report's filename instead of `latest`. Kept reports survive age and count cleanup. Cleanup runs at session startup and when diagnostics are collected; it does not use a background service. Generated reports are also bounded to 20 unkept files. Retention applies to generated reports, not underlying event logs or run records.

For live sanitized launch/switch details on stderr, enable optional debug output before starting:

```sh
env CODEX_AUTO_DEBUG=1 codex-auto --no-daemon -a never --no-alt-screen -s danger-full-access
```

A hard kill or power loss cannot trigger a final report; the already recorded events remain available for manual export. Automatic collection is best effort and does not prevent account recovery if writing a report fails.

## Troubleshooting

- **No accounts configured:** run `codex-auto add <name>` and complete the login, then start `codex-auto` again.
- **Codex executable not found:** ensure `codex` is on `PATH`, or set `CODEX_AUTO_CODEX_BIN` to its executable path.
- **Recovery cannot confirm a session:** use Codex's session picker to select the intended session. Automatic recovery stops when it cannot safely identify that session.
- **All accounts exhausted:** check `codex-auto list` for recorded retry times and confirm current availability in Codex. Interactive startup allows five seconds for history replay before acting on quota text without a recognized prompt; old messages before the latest prompt do not exhaust the resumed account. This timing safeguard can still misclassify replay that takes longer than five seconds.

## Known Limitations

- Rate-limit detection relies on known failure messages in terminal output, not official structured events
- If the underlying `codex` session ID has been lost, `codex-auto` stops automatic recovery instead of falling back to `resume --last`
- Account rotation is based on local state order, with no weighting, priority, or health checks

## Reference

- [Real-terminal regression checklist](./docs/testing/real-terminal-regression.md)
- [Security review and credential flow](./docs/security-review.md)
- [Changelog](./CHANGELOG.md)

## Future Directions

Shared-daemon and ChatGPT desktop-app compatibility are deferred. Possible approaches include a wrapper-owned server or local app-server APIs for configuration and login changes. A separate server needs separate credential storage and explicit rules for sharing history; a different connection address alone does not provide isolation.

Before adopting either approach, verify saved ChatGPT-account activation without repeated browser login, credential refresh, in-flight requests, conversation resume across servers, and effects on other clients. The wrapper currently switches its own Codex sessions and does not manage desktop-app login. See [OpenAI’s guidance on credential updates](https://github.com/openai/codex/issues/49651#issuecomment-5966427084).

## License

MIT
