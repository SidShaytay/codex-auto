#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const commandArgs = args.filter((arg) => arg !== '--no-daemon');
const codexHome = process.env.CODEX_HOME;
const logPath = process.env.FAKE_CODEX_LOG;

// The recovery helper must not act like a TUI launch or rewrite session history.
if (commandArgs[0] === 'app-server') {
  const { runGoalServer } = await import('./fake-goal-server.mjs');
  await runGoalServer();
  process.exit(0);
}

if (!codexHome) {
  process.stderr.write('missing CODEX_HOME\n');
  process.exit(2);
}

mkdirSync(codexHome, { recursive: true });

const authPath = path.join(codexHome, 'auth.json');
const sessionIndexPath = path.join(codexHome, 'session_index.jsonl');
const sessionId = process.env.FAKE_CODEX_SESSION_ID ?? 'session-from-index';
const sessionFilePath = path.join(codexHome, 'sessions', '2026', '04', '17', `rollout-2026-04-17T18-00-00-${sessionId}.jsonl`);
const authText = existsSync(authPath) ? readFileSync(authPath, 'utf8') : '';
const primaryTimestamp = new Date();
const primaryTimestampIso = primaryTimestamp.toISOString();
const competingTimestamp = new Date(primaryTimestamp.getTime() + 1000);
const competingTimestampIso = competingTimestamp.toISOString();
const delayedSessionWriteMs = Number.parseInt(process.env.FAKE_CODEX_DELAY_SESSION_WRITE_MS ?? '0', 10);
const primaryRetryAt = process.env.FAKE_CODEX_PRIMARY_RETRY_AT ?? '11:10 PM';
const oldRetryAt = process.env.FAKE_CODEX_OLD_RETRY_AT ?? '7:37 PM';
const currentRetryAt = process.env.FAKE_CODEX_CURRENT_RETRY_AT ?? '4:06 PM';
const quotaAfterPromptDelayMs = Number.parseInt(process.env.FAKE_CODEX_QUOTA_AFTER_PROMPT_DELAY_MS ?? '20', 10);
const replayOldQuotaDelayMs = Number.parseInt(process.env.FAKE_CODEX_REPLAY_OLD_QUOTA_DELAY_MS ?? '600', 10);
const livePromptDelayMs = Number.parseInt(process.env.FAKE_CODEX_LIVE_PROMPT_DELAY_MS ?? '1800', 10);
const quotaMessageVariant = process.env.FAKE_CODEX_QUOTA_MESSAGE_VARIANT ?? 'admin';
const pickerSessionId = process.env.FAKE_CODEX_RESUME_PICKER_SESSION_ID ?? null;
let pendingAsyncExit = false;

function writeQuotaMessage(retryAt) {
  if (process.env.FAKE_GOAL_STATE && existsSync(process.env.FAKE_GOAL_STATE)) {
    const goal = JSON.parse(readFileSync(process.env.FAKE_GOAL_STATE, 'utf8'));
    if (goal?.status === 'active') {
      goal.status = 'usageLimited';
      writeFileSync(process.env.FAKE_GOAL_STATE, JSON.stringify(goal));
    }
  }
  if (quotaMessageVariant === 'upgrade') {
    process.stdout.write(
      "■ You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits"
    );
    process.stdout.write(retryAt ? ` or try again at ${retryAt}.\n` : ".\n");
    return;
  }

  process.stdout.write("■ You've hit your usage limit. To get more access now, send a request to your admin.\n");
  if (retryAt) {
    process.stdout.write(`or try again at ${retryAt}.\n`);
  }
}

function replayHistoricalQuotaBeforePrompt() {
  if (process.env.FAKE_CODEX_REPLAY_OLD_QUOTA_BEFORE_PROMPT !== '1') {
    return;
  }

  writeQuotaMessage(oldRetryAt);
  process.stdout.write('› \n');
}

function exitWithQuotaAfterPrompt() {
  pendingAsyncExit = true;
  replayHistoricalQuotaBeforePrompt();
  setTimeout(() => {
    writeQuotaMessage(currentRetryAt);
    process.exit(1);
  }, quotaAfterPromptDelayMs);
}

function replayStalePromptThenQuotaBeforeLivePrompt() {
  pendingAsyncExit = true;
  process.stdout.write('› \n');
  setTimeout(() => {
    writeQuotaMessage(oldRetryAt);
  }, replayOldQuotaDelayMs);
  setTimeout(() => {
    process.stdout.write('› \n');
    process.stdout.write('resumed prompt ready\n');
    process.exit(0);
  }, livePromptDelayMs);
}

function writePrimarySessionArtifacts() {
  mkdirSync(path.dirname(sessionFilePath), { recursive: true });
  writeFileSync(
    sessionFilePath,
    `${JSON.stringify({
      timestamp: primaryTimestampIso,
      type: 'session_meta',
      payload: {
        id: sessionId,
        timestamp: primaryTimestampIso,
        cwd: process.cwd()
      }
    })}\n`,
    'utf8'
  );

  if (process.env.FAKE_CODEX_SKIP_SESSION_INDEX !== '1') {
    writeFileSync(
      sessionIndexPath,
      `${JSON.stringify({
        id: sessionId,
        thread_name: 'fake-thread',
        updated_at: primaryTimestampIso
      })}\n`,
      'utf8'
    );
  }
}

const isPickerResume = Boolean(pickerSessionId) && commandArgs[0] === 'resume' && commandArgs.slice(1).filter((arg) => !arg.startsWith('--')).length === 0;
const skipSessionArtifactsForResume = (process.env.FAKE_CODEX_SKIP_SESSION_ARTIFACTS_ON_RESUME === '1' && commandArgs[0] === 'resume') || isPickerResume;

if (logPath) {
  appendFileSync(logPath, `${JSON.stringify({ args, authText })}\n`, 'utf8');
}

if (args[0] === 'login') {
  writeFileSync(authPath, JSON.stringify({ account: 'login-account', token: 'token' }, null, 2), 'utf8');
  process.stdout.write('login ok\n');
  process.exit(0);
}

const fakeAccount = authText ? JSON.parse(authText).account : null;
if ((process.env.FAKE_CODEX_UNAUTHORIZED_ACCOUNTS ?? '').split(',').includes(fakeAccount)) {
  process.stdout.write('Resuming session…\n');
  process.stdout.write('› Error: account/read failed during TUI bootstrap: account/read failed: workspace routing discovery unauthorized (401) (code -32603)\n');
  process.exit(1);
}
if (process.env.FAKE_CODEX_GENERIC_FAILURE_ACCOUNT === fakeAccount) {
  process.stderr.write('A tool returned 401; this is not a native bootstrap error\n');
  process.exit(2);
}

// Simulate interactive picker: touch pre-seeded session file to update its mtime,
// mimicking codex opening the user-selected session before hitting quota.
if (isPickerResume) {
  const pickerFilePath = path.join(
    codexHome,
    'sessions',
    '2026',
    '04',
    '17',
    `rollout-2026-04-17T18-00-00-${pickerSessionId}.jsonl`
  );
  appendFileSync(
    pickerFilePath,
    `${JSON.stringify({ timestamp: new Date().toISOString(), type: 'message_delta', payload: { content: 'resumed' } })}\n`,
    'utf8'
  );
}

if (!skipSessionArtifactsForResume) {
  if (delayedSessionWriteMs > 0) {
    setTimeout(writePrimarySessionArtifacts, delayedSessionWriteMs);
  } else {
    writePrimarySessionArtifacts();
  }
}

const competingSessionId = process.env.FAKE_CODEX_COMPETING_SESSION_ID;
if (competingSessionId) {
  const competingSessionCwd = process.env.FAKE_CODEX_COMPETING_SESSION_CWD ?? process.cwd();
  const competingSessionFilePath = path.join(
    codexHome,
    'sessions',
    '2026',
    '04',
    '17',
    `rollout-2026-04-17T18-00-01-${competingSessionId}.jsonl`
  );
  mkdirSync(path.dirname(competingSessionFilePath), { recursive: true });
  writeFileSync(
    competingSessionFilePath,
    `${JSON.stringify({
      timestamp: competingTimestampIso,
      type: 'session_meta',
      payload: {
        id: competingSessionId,
        timestamp: competingTimestampIso,
        cwd: competingSessionCwd
      }
    })}\n`,
    'utf8'
  );

  if (process.env.FAKE_CODEX_SKIP_SESSION_INDEX !== '1') {
    writeFileSync(
      sessionIndexPath,
      `${JSON.stringify({
        id: sessionId,
        thread_name: 'fake-thread',
        updated_at: primaryTimestampIso
      })}\n${JSON.stringify({
        id: competingSessionId,
        thread_name: 'competing-thread',
        updated_at: competingTimestampIso
      })}\n`,
      'utf8'
    );
  }
}

if (process.env.FAKE_CODEX_ENABLE_TTY_MODES === '1') {
  process.stdout.write('\u001b[?2004h');
  process.stdout.write('\u001b[>4;2m');
  process.stdout.write('\u001b[?1h');
}

if (process.env.FAKE_CODEX_ENABLE_CSI_U_MODE === '1') {
  process.stdout.write('\u001b[>1u');
}

let waitingOnQuota = false;

if (authText.includes('"account": "a"') || authText.includes('"account":"a"')) {
  if (process.env.FAKE_CODEX_STRUCTURED_REDRAW_QUOTA === '1') {
    waitingOnQuota = true;
    setTimeout(() => {
      if (process.env.FAKE_CODEX_STRUCTURED_QUOTA_LARGE_RECORD === '1') {
        appendFileSync(sessionFilePath, 'x'.repeat(300 * 1024) + '\n');
      }
      appendFileSync(sessionFilePath, `${JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'event_msg',
        payload: { type: 'task_complete', turn_id: 'fake-turn', error: {
          codex_error_info: 'usage_limit_exceeded',
          message: `You've hit your usage limit. Upgrade to Pro to purchase more credits or try again at ${primaryRetryAt}.`
        } }
      })}\n`);
      if (process.env.FAKE_CODEX_STRUCTURED_QUOTA_NO_LF === '1') {
        process.stdout.write("■ You've hit your usage limit. To get more access now, send a request to your admin.");
      } else {
        writeQuotaMessage(primaryRetryAt);
      }
      process.stdout.write('\u001b[30;1H› \u001b[31;1HGoal hit usage limits (/goal resume)\n');
      if (process.env.FAKE_CODEX_STRUCTURED_QUOTA_EXIT === '1') process.exit(0);
    }, 100);
    // A missed detection exits without rotating, rather than hanging the test.
    setTimeout(() => process.exit(0), Number.parseInt(process.env.FAKE_CODEX_STRUCTURED_QUOTA_EXIT_DELAY_MS ?? '1200', 10));
  } else if (process.env.FAKE_CODEX_WAIT_ON_QUOTA === '1') {
    process.stdout.write("■ You've hit your usage limit. To get more access now, send a request to your admin.\n");
    process.stdout.write('Approaching rate limits\n');
    process.stdout.write('Switch to gpt-5.1-codex-mini for lower credit usage?\n');
    setInterval(() => {}, 1000);
    waitingOnQuota = true;
  } else {
    writeQuotaMessage(primaryRetryAt);
    process.exit(1);
  }
}

if (!waitingOnQuota && commandArgs[0] === 'resume') {
  const resumeUsesLast = args.includes('--last');
  const positionalArgs = commandArgs.slice(1).filter((arg) => !arg.startsWith('--'));
  const sessionId = resumeUsesLast ? 'last' : positionalArgs[0] ?? '';
  const prompt = positionalArgs.at(-1) ?? '';

  if (process.env.FAKE_CODEX_FAIL_SESSION_ID === '1' && !resumeUsesLast) {
    process.stderr.write(`ERROR: No saved session found with ID ${sessionId}. Run \`codex resume\` without an ID to choose from existing sessions.\n`);
    process.exit(1);
  }

  if (process.env.FAKE_CODEX_RESUME_REPLAYS_OLD_QUOTA === '1') {
    process.stdout.write("■ You've hit your usage limit. To get more access now, send a request to your admin.\n");
    process.stdout.write('› \n');
    process.stdout.write('resumed prompt ready\n');
    process.exit(0);
  }

  if (process.env.FAKE_CODEX_RESUME_CURSOR_REPLAY === '1') {
    pendingAsyncExit = true;
    writeQuotaMessage(oldRetryAt);
    setTimeout(() => {
      process.stdout.write('replayed history\u001b[30;1H› Continue\u001b[31;1H• Working (0s)');
      setTimeout(() => process.exit(0), 100);
    }, 1800);
  } else
  if (process.env.FAKE_CODEX_RESUME_REPLAYS_STALE_QUOTA_BEFORE_LIVE_PROMPT === '1') {
    replayStalePromptThenQuotaBeforeLivePrompt();
  } else
  if (process.env.FAKE_CODEX_EMIT_QUOTA_AFTER_PROMPT === '1') {
    exitWithQuotaAfterPrompt();
  } else {
    process.stdout.write(`Resumed with ${sessionId} ${prompt}\n`);
    if (process.env.FAKE_GOAL_STATE && existsSync(process.env.FAKE_GOAL_STATE)) {
      const goal = JSON.parse(readFileSync(process.env.FAKE_GOAL_STATE, 'utf8'));
      process.stdout.write('continuation turn completed\n');
      if (goal?.status === 'active') process.stdout.write('autonomous goal turn started\nautonomous goal turn completed\n');
    }
    process.exit(0);
  }
}

if (!waitingOnQuota && !pendingAsyncExit) {
  if (process.env.FAKE_CODEX_EMIT_QUOTA_AFTER_PROMPT === '1') {
    exitWithQuotaAfterPrompt();
  } else {
    replayHistoricalQuotaBeforePrompt();
    process.stdout.write('session started\n');
    process.exit(0);
  }
}
