# codex-auto Account Retry Time Display Design

Date: 2026-04-18
Status: draft

## 1. Overview

`codex-auto` currently switches to the next account when quota is exhausted, but `codex-auto list` does not show when an account is expected to become available again. Codex already includes messages such as `or try again at 11:10 PM.`; `codex-auto` should capture this information and show it to users.

This design introduces one capability:

- When an account hits a quota limit and Codex reports a retry time, show the original time string after that account in `codex-auto list`.

Two constraints apply:

- Preserve the time string from Codex's message, such as `11:10 PM`.
- This is temporary status: remove it when the time arrives or the account subsequently runs successfully.

## 2. Goals and Non-goals

### 2.1 Goals

- Extract the next retry time from quota exhaustion messages
- Persist the original display string in `state.json`
- Also store a comparable internal expiration time for automatic cleanup
- Show account retry times in `codex-auto list`
- Remove the status when it expires without manual cleanup
- Clear the status immediately after the account next runs successfully

### 2.2 Non-goals

- Complex natural-language time parsing; support only the observed `or try again at <time>.` format for now
- Converting display times to relative time or another format
- Blocking manual starts of accounts still waiting for availability; this iteration adds visibility without hard scheduling restrictions
- Inferring time zones or calibrating against server time

## 3. Options

### Option A: Store Retry Status in `state.json`

- Key retry information by account name.
- Each record includes:
  - `displayText`: the original time string shown to users, such as `11:10 PM`
  - `availableAt`: an internal ISO timestamp

Advantages:

- Rendering `list` requires only one state read.
- Quota updates, successful-run cleanup, and expiration cleanup share one state store.
- Testing and normalization remain centralized.

Disadvantage: more complex `state.json` structure.

### Option B: Store Retry Status in `accounts/<name>/meta.json`

Advantage: account-private metadata remains together.

Disadvantages:

- `list` must read each account's extra file.
- Expiration cleanup and runtime updates spread across multiple files.
- This differs from the existing account list logic driven by `state.json`.

### Option C: Derive Retry Status from Logs on Every `list`

Advantage: no new state fields.

Disadvantages:

- Fragile dependency on log format
- Difficult to clear status accurately after successful recovery
- Unsuitable as a product capability

Recommendation: Option A.

## 4. State

Add a field to `state.json`:

```json
{
  "version": 1,
  "accounts": ["default", "work"],
  "currentIndex": 1,
  "preferredAccountName": "work",
  "lastSuccessfulAccount": "work",
  "lastSessionId": "session-123",
  "retryAvailabilityByAccount": {
    "default": {
      "displayText": "11:10 PM",
      "availableAt": "2026-04-18T23:10:00.000Z"
    }
  },
  "updatedAt": "2026-04-18T10:00:00.000Z"
}
```

- `displayText` goes directly into `list`, preserving the original Codex time string.
- `availableAt` allows comparison with the current time to determine whether the retry point has passed.

Normalization:

- Remove the corresponding record when an account is deleted.
- Remove expired retry records when loading state.
- Treat a missing field in legacy files as an empty object.

## 5. Parsing

### 5.1 Text Source

Extract retry times only from output already recognized as quota exhaustion.

Observed format:

```text
You've hit your usage limit.
or try again at 11:10 PM.
```

### 5.2 Extraction

- Match `or try again at <time>` in sanitized output.
- Save `<time>` unchanged as `displayText`.
- Then attempt to parse `<time>` as local time.

### 5.3 Internal Timestamp

Convert strings such as `11:10 PM` into an internal time point for expiration cleanup.

- Use the current local date as the reference.
- If the parsed time today is later than now, use today.
- If the parsed time today is earlier than now, use tomorrow.

This covers the common case of receiving a retry-time message near midnight.

## 6. Behavior

### 6.1 Quota Exhaustion

- If a retry time is extracted, update `retryAvailabilityByAccount[currentAccount]`.
- Otherwise, keep existing account switching behavior without adding a retry-time label.

### 6.2 Successful Run

Clear the account's record from `retryAvailabilityByAccount` after a successful run. A successful run means the account is no longer waiting to become available.

### 6.3 Expiration Cleanup

When `list` or a new managed run calls `loadState()`, remove records whose `availableAt <= now`.

The status therefore expires even if the user has not successfully used that account again.

## 7. Account List

Append retry information after the account name in `codex-auto list`.

Suggested output:

```text
* default (default, retry at 11:10 PM)
  work
```

Rules:

- Combine default and retry labels in one set of parentheses when both apply.
- Show `(retry at 11:10 PM)` when only retry information applies.
- Do not display the internal ISO timestamp.

## 8. Testing

Automated tests must cover at least:

- Extracting a retry-time string from quota exhaustion output
- Parsing the string into an internal time point
- Saving retry information after quota exhaustion
- Clearing the account's retry information after success
- Clearing expired retry information when loading state
- Showing retry labels alongside `(default)` in `list`
- Removing retry records when deleting accounts

README updates must explain that `list` shows accounts waiting for availability and their retry time, using product-focused language.

## 9. Risks and Trade-offs

- Extraction depends on Codex's current output format. Upstream wording changes may prevent extraction, but must not affect the existing automatic account switching flow.
- Storing both `displayText` and `availableAt` adds some state complexity but supports both unchanged display and automatic expiration.
- Users may still manually try accounts that have not yet become available. This conservative iteration addresses visibility first.
