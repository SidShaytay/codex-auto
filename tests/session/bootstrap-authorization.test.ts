import path from 'node:path';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { expect, test } from 'vitest';
import { hasBootstrapAuthorizationError } from '../../src/lib/detection.js';
import nativeTail from '../fixtures/native-bootstrap-401-tail.json';
import { runManagedSession } from '../../src/lib/session.js';
import { loadState } from '../../src/lib/state.js';
import { cleanupTempDir, createTempAppHome, seedAccount, seedState } from '../helpers/temp.js';

const fatal = '› Error: account/read failed during TUI bootstrap: account/read failed: workspace routing discovery unauthorized (401) (code -32603)';
// Codex 0.162.1 emits these private-parameter/intermediate CSI sequences
// during terminal teardown. Older strip-ansi does not consume them fully.
const teardown = '\u001b[<1u\u001b[<u\u001b[>4;0m\u001b[?2004l\u001b[?1004l\u001b[0 q\u001b[?25h';

test('recognizes the unmodified fatal tail captured from native routing401 bootstrap', () => {
  expect(nativeTail.syntheticOnly).toBe(true);
  expect(hasBootstrapAuthorizationError(nativeTail.rawTail)).toBe(true);
  expect(hasBootstrapAuthorizationError(`${nativeTail.rawTail}\nWorking again`)).toBe(false);
});

test('recognizes a fatal envelope next to native terminal teardown without swallowing progress', () => {
  const error = fatal.replace('› ', '');
  expect(hasBootstrapAuthorizationError(`›\u001b[37;3H${teardown}${error}\r\n${teardown}`)).toBe(true);
  expect(hasBootstrapAuthorizationError(`›\u001b[37;3H${teardown}${error}\r\nWorking again${teardown}`)).toBe(false);
});

test('recognizes only the fatal native bootstrap envelope at the end, not arbitrary or historical 401 text', () => {
  expect(hasBootstrapAuthorizationError(`Resuming session…\n${fatal}\n`)).toBe(true);
  expect(hasBootstrapAuthorizationError(`\u001b[31m${fatal}\u001b[0m`)).toBe(true);
  expect(hasBootstrapAuthorizationError(fatal.replace('discovery unauthorized', 'discovery\nunauthorized'))).toBe(true);
  for (const text of ['tool returned401', fatal + '\nWorking again', fatal.replace('(401)', '(403)'), 'example: ' + fatal + ' quoted']) {
    expect(hasBootstrapAuthorizationError(text)).toBe(false);
  }
});

test.each([
  { name: 'quota then unauthorized then goal progress', accounts: ['a', 'b', 'c'], unauthorized: 'b', expected: 'c', switches: 2, exitCode: 0 },
  { name: 'native teardown and split escapes recover to goal progress', accounts: ['a', 'b', 'c'], unauthorized: 'b', terminalControls: true, expected: 'c', switches: 2, exitCode: 0 },
  { name: 'quota and unauthorized accounts stop without false quota', accounts: ['a', 'b'], unauthorized: 'b', expected: 'b', switches: 1, exitCode: 1 },
  { name: 'all unauthorized accounts are attempted only once', accounts: ['b', 'c'], unauthorized: 'b,c', expected: 'c', switches: 1, exitCode: 1 },
  { name: 'other fatal errors are not rotated or marked successful', accounts: ['b', 'c'], unauthorized: '', genericFailure: 'b', expected: 'b', switches: 0, exitCode: 2 }
])('$name', async ({ accounts, unauthorized, genericFailure, terminalControls, expected, switches, exitCode }) => {
  const appHome = await createTempAppHome(); const codexHome = await createTempAppHome('bootstrap-codex-');
  const launches = path.join(appHome, 'launches.jsonl'); const goalPath = path.join(appHome, 'goal.json');
  const stdout = new PassThrough(); const stderr = new PassThrough();
  let output = ''; let warnings = '';
  stdout.on('data', (chunk) => { output += chunk.toString(); }); stderr.on('data', (chunk) => { warnings += chunk.toString(); });
  const futureHint = { displayText: 'test future reset', availableAt: '2100-01-01T00:00:00Z' };
  try {
    await mkdir(path.join(codexHome, 'sessions/2026/10/09'), { recursive: true });
    const sessionId = 'synthetic-bootstrap-thread';
    await writeFile(path.join(codexHome, `sessions/2026/10/09/rollout-2026-10-09T00-00-00-${sessionId}.jsonl`), `${JSON.stringify({ type: 'session_meta', payload: { id: sessionId, cwd: process.cwd(), timestamp: '2026-10-09T00:00:00Z' } })}\n`);
    await seedState(appHome, { version: 1, accounts, currentIndex: 0, preferredAccountName: accounts[0], lastSuccessfulAccount: accounts[0], lastSessionId: sessionId,
      retryAvailabilityByAccount: { b: futureHint }, updatedAt: '2026-10-09T00:00:00Z' });
    for (const name of accounts) await seedAccount(appHome, name, { account: name, testCredential: 'local-fixture-only' });
    await writeFile(goalPath, JSON.stringify({ threadId: sessionId, status: 'active', objective: 'Synthetic objective', tokenBudget: 999 }));
    const result = await runManagedSession({ appHome, codexHome, workspaceDir: process.cwd(), interactive: false, stdout, stderr,
      extraArgs: ['resume', sessionId], codexCommand: `node ${path.resolve('tests/fixtures/fake-codex.mjs')}`,
      env: { ...process.env, SHELL: '/bin/bash', FAKE_CODEX_SESSION_ID: sessionId, FAKE_CODEX_LOG: launches,
        FAKE_GOAL_STATE: goalPath, FAKE_CODEX_UNAUTHORIZED_ACCOUNTS: unauthorized, FAKE_CODEX_GENERIC_FAILURE_ACCOUNT: genericFailure,
        FAKE_CODEX_BOOTSTRAP_TERMINAL_CONTROLS: terminalControls ? '1' : undefined }
    });
    expect(result).toMatchObject({ finalAccount: expected, switchCount: switches, exitCode });
    const launchRows = (await readFile(launches, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(launchRows).toHaveLength(switches + 1);
    for (const launch of launchRows) expect(launch.args).toContain(sessionId);
    const state = await loadState(appHome);
    expect(state.lastSuccessfulAccount).toBe(exitCode === 0 ? expected : accounts[0]);
    expect(state.retryAvailabilityByAccount.b).toEqual(futureHint);
    if (exitCode === 0) {
      expect(output).toContain('autonomous goal turn started');
      expect(JSON.parse(await readFile(goalPath, 'utf8')).status).toBe('active');
    }
    const logFile = (await readdir(path.join(appHome, 'logs')))[0];
    const events = (await readFile(path.join(appHome, 'logs', logFile), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const authEvents = events.filter((event) => event.event === 'authorization_switch');
    expect(authEvents.length).toBe(unauthorized.split(',').filter(Boolean).length);
    for (const event of authEvents) {
      expect(event.selection.source).toBe('local_account_observations');
      expect(event.selection.accounts.find((candidate: any) => candidate.account === event.from)).toMatchObject({ eligibility: 'authorization_failed', authorizationObservedAt: expect.any(String) });
    }
    const authEnds = events.filter((event) => event.event === 'invocation_end' && event.bootstrapAuthorizationError);
    expect(authEnds.every((event) => !event.quotaDetected && event.quotaObservedAt === null)).toBe(true);
    if (unauthorized) expect(warnings).toMatch(/authorization/);
  } finally { await cleanupTempDir(appHome); await cleanupTempDir(codexHome); }
});

test('an unauthorized unbound startup fails safely without guessing a recovery thread', async () => {
  const appHome = await createTempAppHome(); const codexHome = await createTempAppHome('bootstrap-unbound-');
  try {
    await seedState(appHome, { version: 1, accounts: ['b', 'c'], currentIndex: 0, preferredAccountName: 'b', lastSuccessfulAccount: null, lastSessionId: null, updatedAt: '2026-10-09T00:00:00Z' });
    for (const name of ['b', 'c']) await seedAccount(appHome, name, { account: name });
    const result = await runManagedSession({ appHome, codexHome, workspaceDir: process.cwd(), interactive: false, stdout: new PassThrough(), stderr: new PassThrough(),
      codexCommand: `node ${path.resolve('tests/fixtures/fake-codex.mjs')}`, env: { ...process.env, SHELL: '/bin/bash', FAKE_CODEX_UNAUTHORIZED_ACCOUNTS: 'b' } });
    expect(result).toMatchObject({ exitCode: 1, switchCount: 0 });
    expect((await loadState(appHome)).lastSessionId).toBeNull();
  } finally { await cleanupTempDir(appHome); await cleanupTempDir(codexHome); }
});
