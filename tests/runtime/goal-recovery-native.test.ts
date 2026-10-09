import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { expect, test } from 'vitest';
import { recoverQuotaLimitedGoal } from '../../src/lib/goal-recovery.js';
import { cleanupTempDir, createTempAppHome } from '../helpers/temp.js';

// Explicit opt-in: never use the user's real home, credentials, daemon or thread.
const binary = process.env.CODEX_GOAL_NATIVE_BIN;
const nativeTest = binary ? test : test.skip;

nativeTest('native unloaded-thread API restores status without starting a turn or altering goal content/budget', async () => {
  const home = await createTempAppHome('native-goal-');
  const threadId = '00000000-0000-7000-8000-000000000123';
  const env = { PATH: process.env.PATH, HOME: home, CODEX_HOME: home, SHELL: '/bin/bash' };
  async function openApi() {
    const child = spawn(binary!, ['app-server', '--listen', 'stdio://', '--enable', 'goals'], { cwd: home, env, stdio: ['pipe', 'pipe', 'pipe'] });
    const closing = new Promise<void>((resolve) => child.once('close', () => resolve()));
    child.stderr.resume();
    let sequence = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    const reader = createInterface({ input: child.stdout });
    reader.on('line', (line) => {
      const message = JSON.parse(line);
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      if (message.error) waiting.reject(new Error(`native RPC error ${message.error.code}`));
      else waiting.resolve(message.result);
    });
    const deadline = setTimeout(() => { for (const p of pending.values()) p.reject(new Error('native API timeout')); child.kill('SIGKILL'); }, 8000);
    child.on('error', () => { for (const p of pending.values()) p.reject(new Error('native process error')); });
    child.once('exit', (code) => { for (const p of pending.values()) p.reject(new Error(`native process exited: ${code}`)); });
    const request = (method: string, params: unknown): Promise<any> => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
    const stop = async () => {
      clearTimeout(deadline); reader.close(); child.kill('SIGTERM');
      const kill = setTimeout(() => child.kill('SIGKILL'), 250);
      await closing; clearTimeout(kill);
    };
    try {
      await request('initialize', { clientInfo: { name: 'isolated-goal-test', version: '1' }, capabilities: { experimentalApi: true } });
      child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
      return { request, stop };
    } catch (error) { await stop(); throw error; }
  }
  try {
    await mkdir(path.join(home, 'sessions/2026/10/09'), { recursive: true });
    await writeFile(path.join(home, 'config.toml'), 'model="fake-model"\nmodel_provider="local-test"\n[features]\ngoals=false\n[model_providers.local-test]\nname="Isolated test"\nbase_url="http://127.0.0.1:1/v1"\nwire_api="responses"\nrequires_openai_auth=false\n[analytics]\nenabled=false\n');
    await writeFile(path.join(home, `sessions/2026/10/09/rollout-2026-10-09T10-00-00-${threadId}.jsonl`), `${JSON.stringify({
      timestamp: '2026-10-09T10:00:00Z', type: 'session_meta', payload: {
        id: threadId, timestamp: '2026-10-09T10:00:00Z', cwd: home, originator: 'codex_cli_rs',
        cli_version: '0.161.0', source: 'cli', model_provider: 'local-test'
      }
    })}\n`);
    const setup = await openApi();
    let original: any;
    try {
      original = (await setup.request('thread/goal/set', { threadId, objective: 'Synthetic goal', status: 'usageLimited', tokenBudget: 999 })).goal;
      expect((await setup.request('thread/loaded/list', {})).data).toEqual([]);
    } finally { await setup.stop(); }
    expect(await recoverQuotaLimitedGoal({ codexCommand: `'${binary!.replace(/'/g, `'\\''`)}'`, env, workspaceDir: home, sessionId: threadId, policyArgs: ['--enable', 'goals'] })).toEqual({ outcome: 'restored' });
    const verify = await openApi();
    try {
      const goal = (await verify.request('thread/goal/get', { threadId })).goal;
      expect(goal).toMatchObject({ ...original, status: 'active', updatedAt: expect.any(Number) });
      expect((await verify.request('thread/loaded/list', {})).data).toEqual([]);
    } finally { await verify.stop(); }
  } finally { await cleanupTempDir(home); }
}, 20_000);
