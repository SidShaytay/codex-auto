# Acceptance Criteria: Account Retry Time Display

**Spec:** `docs/superpowers/specs/2026-04-18-account-retry-time-design.md`
**Date:** 2026-04-18
**Status:** Approved

---

## Criteria

| ID | Description | Test Type | Preconditions | Expected Result |
|----|-------------|-----------|---------------|-----------------|
| AC-001 | Extract the original time string when quota exhaustion output contains `or try again at <time>.`. | Logic | Sanitized quota exhaustion text contains `or try again at 11:10 PM.`. | The extraction result includes `displayText: "11:10 PM"`. |
| AC-002 | Convert the extracted string into an internally comparable retry timestamp. | Logic | The current local time is known; the input time is `11:10 PM`. | Return a valid ISO timestamp; if that time has already passed today, use tomorrow. |
| AC-003 | Save retry information for an account in `state.json` when it hits quota and a retry time can be extracted. | Logic | At least two accounts exist; the first emits quota exhaustion text and a retry time during its run. | After the run, `state.json.retryAvailabilityByAccount[firstAccount]` exists and contains both `displayText` and `availableAt`. |
| AC-004 | Clear an account's retry status after its subsequent successful run. | Logic | The account has a record in `state.json.retryAvailabilityByAccount` and then completes a successful run. | After the run, the account no longer appears in `retryAvailabilityByAccount`. |
| AC-005 | Automatically clear expired retry records when loading state. | Logic | `state.json.retryAvailabilityByAccount` contains a record with `availableAt <= now`. | `loadState()` returns state without that account's retry record. |
| AC-006 | `codex-auto list` shows the retry time after the account name. | API | An account has an unexpired retry record. | That account's output line contains `retry at <displayText>`. |
| AC-007 | Preserve both labels when an account is the default starting account and is still waiting to become available. | API | `preferredAccountName === account` and the account has an unexpired retry record. | The output line includes both `(default` and `retry at <displayText>`; both are identifiable. |
| AC-008 | Removing an account also removes its retry record. | Logic | `retryAvailabilityByAccount` has a record for the account being removed. | After removal, state no longer contains that record. |
| AC-009 | Preserve automatic account switching when quota exhaustion output has no retry time. | Logic | Quota text contains only `You've hit your usage limit`, without `or try again at ...`. | Switch to the next account using existing logic; do not add a retry record for this account. |
| AC-010 | The README presents retry-time display as a user capability. | Logic | Repository documentation is updated. | Both `README.md` and `README.zh-CN.md` explain that `list` shows waiting accounts and their retry time, focusing on user capabilities. |
