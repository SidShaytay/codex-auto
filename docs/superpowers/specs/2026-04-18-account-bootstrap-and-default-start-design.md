# codex-auto Account Bootstrap and Default Starting Account Design

Date: 2026-04-18
Status: draft

## 1. Overview

Currently, `codex-auto` requires users to run `codex-auto add <name>` first and uses the rotation cursor, `currentIndex`, to select the default starting account. Both behaviors expose implementation details rather than match first-time and everyday use:

- Users who already have a working sign-in in their original `CODEX_HOME` should not have to add it manually.
- Users want to choose which account future runs start with, rather than always start where the previous rotation stopped.

This design introduces two behaviors:

1. Automatically import an account named `default` from the source `CODEX_HOME` on first use.
2. Persist a default starting account and prefer it whenever the user runs bare `codex-auto`.

## 2. Goals and Non-goals

### 2.1 Goals

- Allow first use without `add` when a working local Codex sign-in already exists
- Consistently name the imported account `default`
- Let users explicitly set a persistent default starting account
- Keep `--account <name>` as a one-run override without changing the persistent preference
- Preserve quota detection, automatic switching, session resume, and the overlay `CODEX_HOME` architecture
- Let `list` show both the default starting account and the current rotation cursor

### 2.2 Non-goals

- Account weights, priority groups, or health scores
- Automatically changing the default preference based on the last successful account
- An interactive wizard; bootstrap should be unobtrusive
- Redesigning account ordering

## 3. User Experience

### 3.1 First-use Bootstrap

On the first `codex-auto` run or any managed passthrough command, bootstrap when:

- `state.json` has no accounts
- The source `CODEX_HOME/auth.json` exists and is non-empty

Automatically:

- Create the `default` account
- Copy source `CODEX_HOME/auth.json` to `accounts/default/auth.json`
- Copy source `CODEX_HOME/config.toml` to `accounts/default/config.toml` if it exists
- Add `default` to the account list
- Set the default starting account to `default`

The program may print a brief notice that it imported `default`, but should not require additional confirmation.

### 3.2 Default Starting Account

New command:

```bash
codex-auto use <name>
```

- Persist `<name>` as the default starting account.
- Affect subsequent default starts without changing account order.
- Leave rotation results outside this run unchanged.

### 3.3 Startup Priority

Select the starting account in this order:

1. `--account <name>`, if provided, for this run only
2. The default starting account, if configured
3. `currentIndex`
4. The first account, if the preceding choices cannot be resolved

This separates user preference from the runtime rotation position.

### 3.4 Account List

Keep the account list and add a default starting account marker.

Suggested output:

```text
* default (default)
  work
  backup
```

- `*` marks the current rotation cursor, `currentIndex`.
- `(default)` marks the default starting account.

Show both when they refer to different accounts so users can distinguish where future runs start from where rotation currently stands.

## 4. State

Add a field to `state.json`:

```json
{
  "version": 1,
  "accounts": ["default", "work", "backup"],
  "currentIndex": 1,
  "preferredAccountName": "work",
  "lastSuccessfulAccount": "work",
  "lastSessionId": "session-123",
  "updatedAt": "2026-04-18T10:00:00.000Z"
}
```

Field meanings:

- `accounts`: rotation order
- `currentIndex`: current rotation cursor, advanced at runtime
- `preferredAccountName`: user-selected default starting account
- `lastSuccessfulAccount`: account that ended the most recent successful run

Normalization:

- An empty account list requires both `currentIndex` and `preferredAccountName` to be `null`.
- Correct `preferredAccountName` during loading or removal if it no longer names an account in the list.
- Treat a missing `preferredAccountName` in legacy files as `null`.

## 5. CLI Contract

### 5.1 `codex-auto`

- Import `default` automatically if there are no accounts and source `CODEX_HOME/auth.json` exists.
- Continue the current run after bootstrap; do not ask the user to retry.
- Prefer `preferredAccountName` for default startup.

### 5.2 `codex-auto add <name>`

Keep existing behavior, with these additional state rules:

- Make the first account the default starting account automatically.
- Do not replace an existing default preference when adding further accounts.

### 5.3 `codex-auto use <name>`

- Fail if `<name>` does not exist.
- Update `preferredAccountName` on success.
- Print a clear result, such as `Default start account set to <name>`.

### 5.4 `codex-auto remove <name>`

When removing the default starting account:

- Fall back to the first remaining account.
- Set the preference to `null` if no accounts remain.

When removing any other account, preserve the default preference.

## 6. Data Flow and Implementation Boundaries

### 6.1 Bootstrap Flow

At the managed entrypoint, before normal account-state handling:

1. Check whether `state.json` already has accounts.
2. If not, check source `CODEX_HOME/auth.json`.
3. If source credentials exist, create `accounts/default/`.
4. Copy credentials and optional configuration.
5. Initialize `state.json`.
6. Continue normal startup.

Trigger this only when no accounts exist, so it does not overwrite an explicitly managed account set.

### 6.2 Runtime Selection

`runManagedSession` must resolve `preferredAccountName` and `--account` rather than depend only on `currentIndex` for startup.

Quota-triggered rotation still follows existing `accounts` order and `pickNextAccount` logic.

### 6.3 State After Successful Rotation

After automatically switching and successfully resuming:

- Update `currentIndex`.
- Update `lastSuccessfulAccount`.
- Do not automatically change `preferredAccountName`.

Users retain stable control over the default starting account.

## 7. Error Handling

- If source `auth.json` is missing, empty, or cannot be copied, preserve the existing state and do not leave an incomplete `default` account.
- After bootstrap failure, keep the existing no-accounts message that directs users to `add` manually.
- Return a nonzero exit code when `use <name>` names a missing account.
- Allow automatic bootstrap only when the current account list is empty, avoiding conflicts with an existing account named `default`.

## 8. Testing

Automated tests must cover at least:

- Automatic `default` bootstrap with no accounts
- Copying source `auth.json` and optional `config.toml`
- Default startup preferring `preferredAccountName`
- `--account` taking precedence over `preferredAccountName`
- `use <name>` persisting the default starting account
- Fallback after removing the default starting account
- `list` showing both the rotation cursor and the default starting account

Documentation must cover at least:

- First-use automatic import of `default` in the README
- How to set the default starting account
- Product capabilities and usage, rather than internal state fields as selling points

## 9. Risks and Trade-offs

- Automatically importing `default` makes a completely empty account state less common, but significantly improves first use.
- Keeping both `preferredAccountName` and `currentIndex` adds some state complexity in exchange for stable, explainable behavior.
- A one-run `--account` override supports both scripts and persistent preferences.
