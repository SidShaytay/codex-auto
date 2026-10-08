# Security review

Reviewed on October 8, 2026. This is a source and dependency assessment of the current checkout, not a certification of the upstream publisher or installed Codex binary. No runtime fixes were made during this review.

## Malware and credential theft assessment

The reviewed first-party runtime contains no observed credential-upload endpoint, unrelated credential-store harvesting, encoded executable payload, or scheduled persistence mechanism. Account credential copying is an intended feature. It is not, by itself, evidence of credential theft.

The wrapper necessarily gives its selected Codex process access to account credentials. That process, the shell that starts it, imported configuration, MCP servers, and npm dependencies remain trust boundaries. Reviewing this repository cannot establish that those external components are harmless.

### Credential flow

| Operation | Source | Destination or recipient | Evidence |
| --- | --- | --- | --- |
| First-run import | Selected `CODEX_HOME/auth.json`, plus optional `config.toml` | `CODEX_AUTO_HOME/accounts/default/` | `src/lib/accounts.ts:165–200` |
| Explicit import | User-selected `--auth` and `--config` files | Named account directory | `src/cli.ts:198–222`, `src/lib/accounts.ts:83–99` |
| Login | External Codex login process | Account directory provided through `CODEX_HOME` | `src/lib/codex-bin.ts:36–57` |
| Session and switch | Selected account's `auth.json` | Private instance directory consumed by Codex | `src/lib/runtime.ts:22–73` |
| Activate | Selected account's `auth.json` | Selected native `CODEX_HOME/auth.json` | `src/lib/accounts.ts:138–164` |
| Session logging | Account names, session IDs, event metadata | Local `logs/` and `runs/` | `src/lib/logger.ts:11–28`, `src/lib/run-state.ts:22–35`; logger call sites in `src/lib/session.ts` |

Auth contents are read to check that they are nonempty and copied locally. No first-party code sends these contents through `fetch`, includes them in update requests, or intentionally logs them. The child inherits the parent environment, including any secrets already present there. Shared configuration and session history are linked into each instance; account switching does not isolate conversations or configuration between accounts.

### Network and execution inventory

- The only first-party runtime HTTP request is a GET to `https://registry.npmjs.org/<package-name>/latest`, requesting JSON version metadata (`src/lib/update-check.ts:82–105`). It sends the package name and ordinary connection metadata, not an auth body or credential header. The request is normally limited to interactive runs and cached for 24 hours. `CODEX_AUTO_UPDATE_CHECK=0` disables it.
- Accepting an update runs `npm install -g codex-auto@latest` (`src/lib/update-check.ts:120–127`). npm uses its own registry configuration and may execute downloaded install hooks. This crosses a package-publisher trust boundary; see F4.
- Login and sessions run a login shell, then the resolved Codex command (`src/lib/codex-bin.ts:48–56`, `src/lib/session.ts:597–598,644–686,822–832`). Shell startup files execute with the user's privileges. Child network traffic is outside this wrapper's source-level inventory.
- Root `prepare` and `prepack` hooks run the TypeScript build. The build deletes the local `dist/` output then compiles (`package.json:33–37`). `node-pty`, `esbuild`, and optional `fsevents` are marked with install scripts in the lockfile. Their downloaded payloads are not covered by the first-party source conclusion above.
- CI checks out source, installs dependencies, tests, builds, packs, and installs the packed CLI (`.github/workflows/ci.yml`). It uses `pull_request`, not `pull_request_target`, and contains no explicit secret forwarding. Action tags are mutable; pinning actions to reviewed commit SHAs would reduce supply-chain exposure.
- Static signature checks found no matching private-key blocks or common OpenAI/GitHub/AWS credential formats in reviewed runtime, tests, documents, and CI. This is a heuristic check, not a comprehensive secret-history scan. No first-party cron, systemd, shell-profile modification, or unrelated startup persistence was found.

After dependencies were installed with scripts disabled, targeted inspection also covered the unused nested `node_modules/codex-auto` 0.1.0 JavaScript credential/session paths and the native package install scripts. The nested CLI uses local account/runtime copies and shell execution; no HTTP uploader was observed in that inspected code. Its old interactive implementation records local terminal transcripts, but the fork does not import it. `node-pty/scripts/prebuild.js` checks bundled binaries (or removes them when explicitly rebuilding), and `post-install.js` cleans its own build directory and copies bundled Windows files. Neither inspected script uploads credentials. Its fallback invokes `node-gyp`, which can retrieve build prerequisites. `esbuild/install.js` can install/download its platform binary from npm and execute a version check; its inspected download request has no credential body. This targeted inspection does not verify the native binary contents or every dependency.

## Findings

Severity describes the stated impact and prerequisites. Local configuration control is not equivalent to unauthenticated remote exploitation.

### F1 — High: special account names can delete the entire account store

**Evidence:** `src/lib/accounts.ts:21–25` accepts `.` and `..`; `src/lib/paths.ts:16–18` normalizes them with `path.join`. Failure cleanup at `src/lib/accounts.ts:111–113` and removal at `src/lib/accounts.ts:117–125` recursively delete the resulting path through `src/lib/fs.ts:44–46`.

`add ..` targets the whole application home; `add .` targets the accounts root. A failed import/login can therefore remove other accounts, credentials, state, and logs. A successfully registered special name can trigger the same deletion when removed. `state.json` also accepts arbitrary account strings (`src/lib/state.ts:10–18`), so tampered/imported state can supply broader traversal paths.

**Prerequisites:** The user or automation invokes a special name, or an actor already able to modify application state supplies unsafe names. This is a local data-loss flaw; no remote entry point was identified.

**Verification:** A non-destructive Node check confirmed both names pass the exact validator and normalize to the accounts root/application home. No real account deletion or login was performed.

**Recommendation:** Reject `.` and `..`; apply one account-name schema to CLI input and persisted state; verify resolved account paths are strict descendants of the accounts root before any write or removal. Add temporary-directory tests for failed add and remove.

### F2 — Medium: executable selection is interpreted as shell code

**Evidence:** `src/lib/codex-bin.ts:3–18` accepts an environment override or PATH-resolved executable. `buildCodexShellCommand` quotes arguments but inserts the executable unquoted (`src/lib/codex-bin.ts:27–34`). Login and session launch pass this string to a shell with `-lc`.

A semicolon, substitution, or other shell metacharacter in the override or resolved executable path becomes executable shell syntax. Ordinary executable paths containing spaces also break. Tests currently use this behavior to pass `node <fixture>` as a command, so changing it requires adjusting the command contract and fixtures.

**Prerequisites:** Control over the command override, the relevant PATH entry/executable pathname, or the caller's launch configuration. An actor with full shell/environment control may already have execution capability; this finding concerns unintended interpretation of a value documented as an executable path.

**Recommendation:** Launch an executable and argument vector directly where possible. If a shell remains necessary, quote the executable as well and represent fixture/runtime arguments separately. Treat shell configuration and executable overrides as trusted code.

### F3 — Medium: copied credentials retain permissive source permissions

**Evidence:** `copyFileAtomic` uses `copyFile` without enforcing `0600` (`src/lib/fs.ts:37–41`); initial instance auth copying does the same (`src/lib/runtime.ts:60`). `ensureDir` requests `0700` only when creating directories and does not tighten existing directory permissions (`src/lib/fs.ts:5–7`). Activation copies credentials into an existing Codex home (`src/lib/accounts.ts:158`).

An imported `0644` credential file retains that mode. Newly created `0700` account/instance directories normally prevent other users from traversing to it. However, activation into an already traversable Codex home, or an existing permissive application directory, can expose the copy to another local user. Intended credential switching is not the finding; insufficient permissions on the destination are.

**Prerequisites:** A permissive source file and traversable destination directory, with another local user/process able to read it. Same-user processes are not isolated by Unix file permissions.

**Verification:** A dummy `{}` file copied in a temporary directory retained `0644`. No real credentials were inspected.

**Recommendation:** Enforce `0600` on every credential copy and private permissions/ownership on managed directories. Refuse unsafe symlink/ownership layouts where appropriate. Use exclusive temporary files rather than predictable filenames in shared or untrusted directories.

### F4 — Medium: a fork's updater installs the upstream package

**Evidence:** `package.json:2` keeps the upstream package name; `src/cli.ts:23–24,113–122` supplies it to the updater; `src/lib/update-check.ts:120–127` installs that name's registry `latest`. `package.json:41` also unnecessarily depends on the registry's older `codex-auto` package, locked to `0.1.0` at `package-lock.json:1045–1062`; no runtime import uses it.

Accepting the update can replace a separately installed fork with the upstream registry release, bypassing the fork's reviewed source and patches. The unused self-dependency introduces another published CLI into the dependency tree. Neither fact demonstrates malicious upstream intent.

**Prerequisites:** An interactive user accepts an offered update, or installs dependencies containing the unused upstream package.

**Recommendation:** Give a redistributed fork its own package identity/update channel, or disable registry installation for fork builds. Remove the unused self-dependency after verifying packaging behavior. Review native install hooks and publisher provenance before executing them.

### F5 — Medium: automatic resume drops explicit execution restrictions

**Evidence:** The initial invocation receives the forwarded arguments (`src/lib/session.ts:1061–1074`), while subsequent account-switch invocations use only `['resume', '--no-alt-screen', sessionId, 'Continue']` (`src/lib/session.ts:560–582`). Explicit `--sandbox`, `--ask-for-approval`, profiles, and configuration overrides are not forwarded.

If the external Codex version does not persist and reapply these restrictions on resume, the next account runs with configuration defaults instead of the caller's explicit policy. The wrapper's omission is confirmed; a policy downgrade in actual Codex was not reproduced and depends on its resume semantics/version.

**Prerequisites:** A quota-triggered switch during a session started with explicit restrictions and a Codex version/configuration that does not preserve those restrictions.

**Recommendation:** Define and preserve the security-relevant launch policy across resume, then verify with the supported Codex version and real-terminal regression. Do not blindly re-forward every initial argument: prompts and subcommand-specific options need separate handling.

## Dependency advisory results

The live npm advisory service reported the following for the committed lockfile. The full audit exited 1 because advisories were found. The production-only audit exited 0 with no reported vulnerabilities.

| Locked development package | npm severity | Main advisory conditions |
| --- | --- | --- |
| `vitest` 3.2.4 | Critical | UI server exposure permits file read/execution; also inherits mocker/tinypool advisories |
| `tinypool` 1.1.1 | Critical | Prototype-pollution gadgets affecting worker/run options; requires a pollution/options path |
| `nanoid` 3.3.11 | High | Invalid generator sizes/integer handling |
| `postcss` 8.5.10 | High | Processing attacker-controlled source-map comments |
| `source-map-js` 1.2.1 | High | Malicious indexed source-map offsets |
| `vite` 7.3.2 | High | Windows development-server paths and UNC handling |
| `@vitest/mocker` 3.2.4 | Moderate | Redirect-mock path traversal |
| `esbuild` 0.27.7 | Low | Windows development-server file handling |

These are eight affected package nodes: two critical, four high, one moderate, and one low. They are not eight independently demonstrated exploits in this application. The configured test command is `vitest run`, not a UI server, and the reviewed runtime does not directly process CSS/source maps or call Nano ID. Upgrade and re-audit the development tree; npm's `fixAvailable` indication is not proof that an update is compatible or safe to apply blindly.

Sources returned by npm include [Vitest UI advisory](https://github.com/advisories/GHSA-5xrq-8626-4rwp), [Tinypool worker advisory](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), [Tinypool run advisory](https://github.com/advisories/GHSA-85c8-ppgw-ccpr), [mocker traversal advisory](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), [PostCSS advisory](https://github.com/advisories/GHSA-6g55-p6wh-862q), and [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). Package severities and conditions above summarize the live npm response; advisory pages were not independently validated in this review.

Reproduce without installing packages or running lifecycle hooks:

```sh
npm audit --json --ignore-scripts
npm audit --omit=dev --json --ignore-scripts
```

## Coverage and limitations

Build verification passed with Node 26.11.0 and npm 11.20.0 after installing the lockfile with lifecycle scripts disabled. The existing suite, rerun outside the sandbox with `SHELL=/bin/bash` and a writable npm cache, passed 82 of 83 tests. The remaining failure is the assertion expecting `Unable to safely resume bound session` in captured stderr (`tests/session/session.test.ts:868`). Initial sandbox runs failed more broadly; the outside-sandbox rerun resolved those other failures. No runtime code was changed to address the remaining failure. Documentation link, code-fence, and whitespace checks passed. Real terminal regression was not run because this effort changed documentation and a Python test docstring only.

Reviewed all first-party runtime modules, package/lock metadata, release script, CI configuration, and test execution/fixture surfaces; scanned tracked source and document content for common secret and execution indicators. The orphaned Python test references an absent `conftest`/older implementation and is excluded by the current Vitest configuration. It is not evidence of active credential harvesting.

The audit queries and dummy permission/path checks ran without real account login or executing Codex. This review did not inspect every byte of downloaded dependency tarballs, native binaries, shell startup files, external Codex/MCP code, existing user configuration, or all Git history. It did not dynamically capture child network traffic or run terminal acceptance scenarios. No remediation has been implemented or verified. A clean production advisory result and absence of source-level exfiltration indicators do not prove the repository or its supply chain is safe.
