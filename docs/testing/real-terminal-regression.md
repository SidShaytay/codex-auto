# Real-terminal regression checklist

## Purpose

This checklist defines the interactive terminal regression requirements for `codex-auto`. These checks are interactive end-to-end regressions, manual acceptance checks, or terminal UI / TTY regressions. They supplement unit tests and non-TTY integration tests.

Run these checks whenever a change affects terminal display, input, PTY hosting, or interactive account rotation.

## When checks are required

Run real-terminal regressions after any of these changes:

- Changes to `src/lib/session.ts`.
- Changes to PTY, TTY, shell startup, raw mode, resizing, or control-sequence handling.
- Changes to CLI logic that reads input or displays interactive prompts on a real TTY.
- Changes to interactive quota detection, account rotation, or session recovery.
- Fixes for split panes, Chinese input, redraw corruption, misplaced prompts, or stale status lines.

## Prepare the build

1. Run the automated tests:

   ```bash
   npm test
   ```

2. Build the current source:

   ```bash
   npm run build
   ```

3. Ensure the real terminal runs the current build rather than an older global installation. Either install the current checkout:

   ```bash
   npm install -g .
   ```

   Or run the built entry point directly from the checkout:

   ```bash
   node dist/index.js
   ```

   If using the direct entry point, replace `codex-auto` below with `node /absolute/path/to/checkout/dist/index.js`.

## Required scenarios

### 1. Startup without leaked control sequences

Run `codex-auto` in a real terminal application.

Accept when:

- No literal control sequences such as `^[[...`, `^[]...`, or `ESC [` appear.
- Terminal query responses are not printed as ordinary text.
- The first Codex screen displays correctly.

### 2. Normal input echo

Enter a short string such as `123` at the prompt, then press Enter.

Accept when the input appears in the input area without reordered or duplicated characters or partial control sequences.

### 3. Chinese input

Enter Chinese text, such as `你好`, then mixed text, such as `你好 hi 123`.

Accept when:

- Text alignment is correct, with no stale characters or cursor drift.
- Wide Chinese characters do not disrupt the layout.

### 4. Split panes

Split the real terminal or narrow its pane, start `codex-auto` again, and enter short text while watching dynamic updates.

Accept when:

- The screen stays clean, with no duplicate drawing or misplaced prompt.
- Refreshed regions do not retain old content.

### 5. Dynamic status updates

Watch startup, MCP startup, and dynamic states such as `Working...`.

Accept when status updates are smooth, old frames disappear, and redraw control sequences do not appear as literal text.

### 6. Interactive account rotation and recovery

Required whenever a change affects interactive quota detection, rotation, or recovery.

Use a controllable repository fixture or reproducible account setup to trigger quota exhaustion on the first account. Also test startup or recovery that replays old quota text before reaching the current prompt. Observe rotation and recovery.

Accept when:

- A clear quota message triggers detection and rotation to the next account.
- Recovery resumes the same session.
- Replayed quota text from an old transcript does not incorrectly mark the current account as newly exhausted.
- A newly interactive session whose recovery target becomes visible shortly afterward is given time to bind before recovery is abandoned.
- The terminal display remains correct after rotation.

### 7. Interactive update prompt

Required whenever a change affects update prompts, confirmation input, or skipping updates on a real TTY.

Trigger a controlled new-version prompt in a real terminal. Test postponement or an empty Enter response, skipping the version, and updating now when feasible. Enter short text after returning to the shell.

Accept when:

- Update prompts appear only in interactive terminals and do not contaminate exact output such as `--version`.
- `s` or `skip` records the skipped version and prevents repeated prompts for it.
- An empty Enter response dismisses the prompt without blocking the command.
- Shell input, Enter, and Backspace work normally afterward.

### 8. Concurrent terminals in the same project

Required whenever a change affects interactive session binding, rotation, or recovery.

Open two real terminals in the same project. Start an independent `codex-auto` session in each and give them distinguishable context. Trigger quota exhaustion in only one session and observe recovery.

Accept when:

- The exhausted terminal resumes only its own original session.
- It does not take over or attach to the other terminal's session.
- Display and input remain correct after rotation.

### 9. Concurrent terminals in different projects

Required whenever a change affects interactive session binding, rotation, or recovery.

Open real terminals in two different projects and start independent `codex-auto` sessions. Trigger quota exhaustion in one session and observe recovery.

Accept when:

- The exhausted terminal resumes only its own original session.
- The other project's session is neither resumed by mistake nor otherwise affected.
- Display and input remain correct after rotation.

### 10. Normal shell input after exit

Required whenever a change affects interactive PTY exit, forced stops, control-sequence handling, or cleanup after rotation.

Start `codex-auto` in a real terminal. Exit normally, or trigger a quota-driven rotation or stop. Back in the shell, enter short text such as `code 123`, then Chinese or mixed text such as `你好 hi`.

Accept when:

- Control sequences such as `c9;1:...u`, `^[[...`, and `^[>...m` do not appear as ordinary input.
- Shell input, Enter, and Backspace work normally.
- Bracketed paste, extended keyboard protocols, and application cursor mode do not leave abnormal echo behavior behind.

### 11. Ctrl-C during a quota prompt

Required whenever a change affects interactive quota detection, rotation cleanup, or `Ctrl-C` / SIGINT handling.

Start `codex-auto` in a real terminal and trigger a clear quota prompt. Press `Ctrl-C` once before rotation or exhausted-account handling finishes. Back in the shell, enter short text and test an arrow key or Delete key.

Accept when:

- The managed run exits as a user cancellation.
- It does not continue printing `All configured accounts are exhausted` or recovery text such as `and resuming...`.
- Keyboard-protocol fragments such as `9;5:3u` and `;1:1A` do not appear in the shell.

## Record results

- When a real-terminal regression reveals a new scenario, add it to this checklist before fixing the code.
- Add any new acceptance method or high-risk scenario introduced by a fix.
- A completion report must state which automated tests ran, which real-terminal scenarios ran, and the terminal environment used, such as Terminal.app, iTerm2, or split panes.
