import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { expect, test } from 'vitest';
import { runManagedSession } from '../../src/lib/session.js';
import { cleanupTempDir, createTempAppHome, seedAccount, seedState } from '../helpers/temp.js';

// This simulates native goal accounting: a generic continuation runs once, while
// only an active goal schedules the next autonomous turn.
test.each([
  { status: 'active', mode: undefined, expected: 'active', exitCode: 0, autonomous: true },
  { status: 'paused', mode: undefined, expected: 'paused', exitCode: 0, autonomous: false },
  { status: 'active', mode: 'set-error', expected: 'usageLimited', exitCode: 1, autonomous: false },
  { status: 'active', mode: 'unsupported', expected: 'usageLimited', exitCode: 0, autonomous: false }
])('quota rotation preserves goal continuity safely: $status/$mode', async ({ status, mode, expected, exitCode, autonomous }) => {
  const appHome = await createTempAppHome();
  const codexHome = await createTempAppHome('goal-codex-');
  const statePath = path.join(appHome, 'fake-goal.json');
  const logPath = path.join(appHome, 'fake-launches.jsonl');
  const stdout = new PassThrough(); const stderr = new PassThrough();
  let output = ''; let warnings = '';
  stdout.on('data', (chunk) => { output += chunk.toString(); });
  stderr.on('data', (chunk) => { warnings += chunk.toString(); });
  try {
    await mkdir(path.join(codexHome, 'sessions'), { recursive: true });
    await seedState(appHome, {
      version: 1, accounts: ['a', 'b'], currentIndex: 0, preferredAccountName: 'a', lastSuccessfulAccount: null,
      lastSessionId: null, updatedAt: '2026-04-17T00:00:00.000Z'
    });
    await seedAccount(appHome, 'a', { account: 'a', token: 'fake-a' });
    await seedAccount(appHome, 'b', { account: 'b', token: 'fake-b' });
    const goal = { threadId: 'goal-thread', status, objective: 'private objective', tokenBudget: 999, tokensUsed: 123 };
    await writeFile(statePath, JSON.stringify(goal));
    const result = await runManagedSession({
      appHome, codexHome, workspaceDir: process.cwd(), interactive: false, stdout, stderr,
      codexCommand: `node ${path.resolve('tests/fixtures/fake-codex.mjs')}`,
      env: { ...process.env, SHELL: '/bin/bash', FAKE_CODEX_LOG: logPath, FAKE_CODEX_SESSION_ID: 'goal-thread', FAKE_GOAL_STATE: statePath, FAKE_GOAL_MODE: mode }
    });
    expect(result.switchCount).toBe(1);
    expect(result.exitCode).toBe(exitCode);
    expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual({ ...goal, status: expected });
    expect(output.includes('autonomous goal turn started')).toBe(autonomous);
    const launches = (await readFile(logPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    if (mode === 'set-error') {
      expect(launches).toHaveLength(1);
      expect(warnings).toContain('stopping rather than silently continuing');
    } else {
      expect(launches).toHaveLength(2);
      expect(launches[1].args).toContain('goal-thread');
    }
    if (mode === 'unsupported') expect(warnings).toContain('conversation only');
    expect(output + warnings).not.toContain('private objective');
    expect(output + warnings).not.toContain('private server stderr');
  } finally { await cleanupTempDir(appHome); await cleanupTempDir(codexHome); }
});
