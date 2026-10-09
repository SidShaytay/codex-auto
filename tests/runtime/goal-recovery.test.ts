import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import { goalServerConfigArgs, recoverQuotaLimitedGoal } from '../../src/lib/goal-recovery.js';
import { cleanupTempDir, createTempAppHome } from '../helpers/temp.js';

const fixture = path.resolve('tests/fixtures/fake-goal-server.mjs');
const threadId = 'fake-thread';
const originalGoal = { threadId, status: 'usageLimited', objective: 'private objective', tokensUsed: 123, tokenBudget: 999, createdAt: 10 };

async function exercise(status: string | null, mode?: string, shell = '/bin/bash') {
  const home = await createTempAppHome();
  const state = path.join(home, 'goal.json');
  const log = path.join(home, 'rpc.jsonl');
  try {
    await writeFile(state, JSON.stringify(status === null ? null : { ...originalGoal, status }));
    const listeners = process.listenerCount('SIGINT');
    const result = await recoverQuotaLimitedGoal({
      codexCommand: `node '${fixture}'`, env: { ...process.env, SHELL: shell, FAKE_GOAL_STATE: state, FAKE_GOAL_RPC_LOG: log, FAKE_GOAL_MODE: mode },
      workspaceDir: home, sessionId: threadId, policyArgs: [], timeoutMs: 1500
    });
    expect(process.listenerCount('SIGINT')).toBe(listeners);
    const rows = await readFile(log, 'utf8').catch(() => '');
    const requests = rows.trim() ? rows.trim().split('\n').map((row) => JSON.parse(row)) : [];
    for (const request of requests) expect(() => process.kill(request.pid, 0)).toThrow();
    expect(JSON.stringify(result)).not.toMatch(/private|objective/);
    return { result, goal: JSON.parse(await readFile(state, 'utf8')), requests };
  } finally { await cleanupTempDir(home); }
}

describe('native quota-limited goal recovery', () => {
  test.each(['/bin/bash', '/bin/fish'])('restores only status, verifies acknowledgement and closes helper under %s', async (shell) => {
    const { result, goal, requests } = await exercise('usageLimited', undefined, shell);
    expect(result).toEqual({ outcome: 'restored' });
    expect(goal).toEqual({ ...originalGoal, status: 'active' });
    expect(requests.map((r) => r.method)).toEqual(['initialize', 'initialized', 'thread/goal/get', 'thread/goal/set', 'thread/goal/get']);
    expect(requests[3].params).toEqual({ threadId, status: 'active' });
    expect(requests[0].params.capabilities.experimentalApi).toBe(true);
  });
  test.each([null, 'active', 'paused', 'blocked', 'budgetLimited', 'complete'])('leaves %s goals alone', async (status) => {
    const { result, goal, requests } = await exercise(status);
    expect(result.outcome).toBe('unchanged');
    expect(goal?.status ?? null).toBe(status);
    expect(requests.some((r) => r.method === 'thread/goal/set')).toBe(false);
  });
  test.each(['unsupported', 'exit', 'hang', 'ignore-term', 'malformed', 'oversized', 'wrong-thread'])('sanitizes and cleans up unavailable API: %s', async (mode) => {
    expect((await exercise('usageLimited', mode)).result.outcome).toBe('unavailable');
  });
  test.each(['set-error', 'no-ack'])('fails explicitly rather than claiming recovery: %s', async (mode) => {
    expect((await exercise('usageLimited', mode)).result.outcome).toBe('failed');
  });
  test.each([{ args: ['-p', 'night'] }, { args: ['-pnight'] }, { args: ['--profile=night'] }])('profile selection $args is explicit unavailable rather than a mismatched config or a spawned server', async ({ args }) => {
    expect(goalServerConfigArgs(args)).toBeNull();
    expect(await recoverQuotaLimitedGoal({ codexCommand: 'must-not-execute', env: {}, workspaceDir: '/', sessionId: threadId, policyArgs: args }))
      .toEqual({ outcome: 'unavailable', reason: 'profile' });
  });
  test('interrupt cancels only the helper and removes its signal handlers', async () => {
    const home = await createTempAppHome();
    const before = new Set(process.listeners('SIGINT'));
    try {
      const pending = recoverQuotaLimitedGoal({ codexCommand: `node '${fixture}'`,
        env: { ...process.env, SHELL: '/bin/bash', FAKE_GOAL_MODE: 'hang' }, workspaceDir: home,
        sessionId: threadId, policyArgs: [], timeoutMs: 2000 });
      const handler = process.listeners('SIGINT').find((listener) => !before.has(listener));
      expect(handler).toBeDefined();
      handler!(); // Invoke only the helper's handler, never signal this test runner.
      expect((await pending).outcome).toBe('interrupted');
      expect(new Set(process.listeners('SIGINT'))).toEqual(before);
    } finally { await cleanupTempDir(home); }
  });
  test('handles attached short values and never mistakes a TUI option value for a helper flag', () => {
    expect(goalServerConfigArgs(['-cfeatures.goals=true', '-m', '--enable', '-sworkspace-write', '-c=model="fake"', '--strict-config']))
      .toEqual(['-c', 'features.goals=true', '-c', 'model="fake"', '--strict-config']);
  });
  test('forwards native config/feature overrides without forwarding TUI flags', () => {
    expect(goalServerConfigArgs(['--no-daemon', '--no-alt-screen', '-c', 'model="fake"', '--enable=goals', '--disable', 'other', '-s', 'workspace-write']))
      .toEqual(['-c', 'model="fake"', '--enable', 'goals', '--disable', 'other']);
  });
});
