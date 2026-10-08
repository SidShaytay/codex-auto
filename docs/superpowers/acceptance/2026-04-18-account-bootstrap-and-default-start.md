# Acceptance Criteria: Account Bootstrap And Default Start

**Spec:** `docs/superpowers/specs/2026-04-18-account-bootstrap-and-default-start-design.md`
**Date:** 2026-04-18
**Status:** Approved

---

## Criteria

| ID | Description | Test Type | Preconditions | Expected Result |
|----|-------------|-----------|---------------|-----------------|
| AC-001 | A first managed run automatically imports an account named `default` when `state.json` has no accounts and source `CODEX_HOME/auth.json` exists and is non-empty. | API | `~/.codex-auto/state.json` is missing or its account list is empty; source `CODEX_HOME/auth.json` exists and contains valid JSON; run `codex-auto` or an equivalent managed entrypoint. | Create `~/.codex-auto/accounts/default/auth.json`; set `state.json.accounts` to `["default"]`; continue the current run rather than report “No accounts configured”. |
| AC-002 | First-use bootstrap also imports source `CODEX_HOME/config.toml` into `accounts/default/config.toml` if present. | Logic | AC-001 preconditions hold and source `CODEX_HOME/config.toml` exists. | `accounts/default/config.toml` exists and matches the source `config.toml`. |
| AC-003 | After first-use bootstrap, persist `default` as the default starting account. | Logic | AC-001 preconditions hold and bootstrap succeeds. | `state.json.preferredAccountName` equals `"default"` and `state.json.currentIndex` is `0`. |
| AC-004 | With a persistent default starting account, bare `codex-auto` starts with that account rather than the account at `currentIndex`. | API | At least two accounts exist in `state.json.accounts`; `preferredAccountName` names one and `currentIndex` points to another; run a managed session without `--account`. | Start with the `auth.json` of `preferredAccountName`; a different `currentIndex` must not change the starting account. |
| AC-005 | The one-run `--account <name>` override takes precedence over the persistent default starting account. | API | At least two accounts exist; `preferredAccountName` is set; run `codex-auto --account <other-name>`. | Start with the account named by `--account`; preserve `state.json.preferredAccountName`. |
| AC-006 | `codex-auto use <name>` persists the specified account as the new default starting account. | API | `state.json.accounts` includes `<name>`; run `codex-auto use <name>`. | Exit with code `0`; print confirmation; set `state.json.preferredAccountName` to `<name>`. |
| AC-007 | `codex-auto use <name>` fails without changing state when the account does not exist. | API | `state.json.accounts` does not include `<name>`; run `codex-auto use <name>`. | Exit with a nonzero code; report the missing account on stderr; preserve the previous `state.json.preferredAccountName`. |
| AC-008 | `codex-auto list` marks both the current rotation cursor and the default starting account. | API | At least two accounts exist; `currentIndex` and `preferredAccountName` may refer to the same or different accounts; run `codex-auto list`. | Prefix the current cursor account with `*` and mark the default starting account with `(default)`; both are identifiable. |
| AC-009 | Removing the default starting account selects the first remaining account as the new default if any accounts remain. | Logic | At least two accounts exist and `preferredAccountName` names one of them; remove that account. | After removal, `state.json.preferredAccountName` equals the new `accounts[0]`. |
| AC-010 | Removing the last account clears both the default starting account and the current rotation cursor. | Logic | One account remains and is also `preferredAccountName`; remove it. | `state.json.accounts` is empty; `currentIndex` and `preferredAccountName` are `null`. |
| AC-011 | Successful automatic switching and resume update rotation state without changing the user's default starting account. | Logic | At least two accounts exist; `preferredAccountName` is set; trigger quota-driven switching and successfully resume. | `currentIndex` and `lastSuccessfulAccount` may update to the account used, while `preferredAccountName` retains its value from before switching. |
| AC-012 | The README presents first-use `default` bootstrap and choosing a default starting account as user capabilities. | Logic | Repository documentation is updated. | Both `README.md` and `README.zh-CN.md` describe first-use bootstrap and setting the default starting account, focusing on capabilities and usage rather than implementation details. |
