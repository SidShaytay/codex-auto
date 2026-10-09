import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'vitest';
import { recoverQuotaLimitedGoal } from '../../src/lib/goal-recovery.js';
import { createTempAppHome, cleanupTempDir } from '../helpers/temp.js';

const binary = process.env.CODEX_GOAL_NATIVE_BIN;
(binary ? test : test.skip).each([true, false])('native unloaded goal autonomous continuation with recovery=%s', async (recovery) => {
  const home = await createTempAppHome('native-loop-');
  const threadId = '00000000-0000-7000-8000-000000000124';
  let requests = 0;
  const provider = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      if (!req.url?.endsWith('/responses')) { res.writeHead(404); res.end(); return; }
      const id = `synthetic-response-${++requests}`;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'close' });
      for (const event of [
        { type: 'response.created', response: { id } },
        { type: 'response.output_item.done', item: { id: `message-${requests}`, type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: '' }] } },
        { type: 'response.completed', response: { id } }
      ]) res.write(`data: ${JSON.stringify(event)}\n\n`);
      res.end();
    });
  });
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const address = provider.address() as { port: number };
  const env = { PATH: process.env.PATH, HOME: home, CODEX_HOME: home, SHELL: '/bin/bash' };
  async function openApi() {
    const child = spawn(binary!, ['app-server', '--listen', 'stdio://', '--enable', 'goals'], { cwd: home, env, stdio: ['pipe', 'pipe', 'pipe'] });
    const closing = new Promise<void>((resolve) => child.once('close', () => resolve()));
    child.stderr.resume();
    let sequence = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    const turns: string[] = [];
    const reader = createInterface({ input: child.stdout });
    reader.on('line', (line) => {
      const message = JSON.parse(line);
      if (message.method === 'turn/completed') turns.push(message.params.turn.id);
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      if (message.error) waiting.reject(new Error(`native RPC error ${message.error.code}`)); else waiting.resolve(message.result);
    });
    const deadline = setTimeout(() => { for (const p of pending.values()) p.reject(new Error('native API timeout')); child.kill('SIGKILL'); }, 15000);
    child.on('error', () => { for (const p of pending.values()) p.reject(new Error('native process error')); });
    const request = (method: string, params: unknown): Promise<any> => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
    const stop = async () => { clearTimeout(deadline); reader.close(); child.kill('SIGTERM'); const kill = setTimeout(() => child.kill('SIGKILL'), 250); await closing; clearTimeout(kill); };
    try {
      await request('initialize', { clientInfo: { name: 'isolated-loop-test', version: '1' }, capabilities: { experimentalApi: true } });
      child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
      return { request, stop, turns };
    } catch (error) { await stop(); throw error; }
  }
  try {
    await mkdir(path.join(home, 'sessions/2026/10/09'), { recursive: true });
    await writeFile(path.join(home, 'config.toml'), `model="gpt-5.4"\nmodel_provider="local-test"\n[features]\ngoals=true\n[model_providers.local-test]\nname="Isolated test"\nbase_url="http://127.0.0.1:${address.port}/v1"\nwire_api="responses"\nrequires_openai_auth=false\n[analytics]\nenabled=false\n`);
    await writeFile(path.join(home, `sessions/2026/10/09/rollout-2026-10-09T10-00-00-${threadId}.jsonl`), `${JSON.stringify({ timestamp: '2026-10-09T10:00:00Z', type: 'session_meta', payload: { id: threadId, timestamp: '2026-10-09T10:00:00Z', cwd: home, originator: 'codex_cli_rs', cli_version: '0.162.1', source: 'cli', model_provider: 'local-test' } })}\n`);
    const setup = await openApi();
    try { await setup.request('thread/goal/set', { threadId, objective: 'Synthetic loop test', status: 'usageLimited', tokenBudget: 999 }); } finally { await setup.stop(); }
    if (recovery) expect(await recoverQuotaLimitedGoal({ codexCommand: `'${binary!.replace(/'/g, `'\\''`)}'`, env, workspaceDir: home, sessionId: threadId, policyArgs: ['--enable', 'goals'] })).toEqual({ outcome: 'restored' });
    const resumed = await openApi();
    try {
      await resumed.request('thread/resume', { threadId });
      await resumed.request('turn/start', { threadId, input: [{ type: 'text', text: 'Continue', text_elements: [] }] });
      const until = Date.now() + 10000;
      while (resumed.turns.length < (recovery ? 3 : 1) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 20));
      if (!recovery) await new Promise((resolve) => setTimeout(resolve, 250));
      if (recovery) {
        // Native resume may start an active goal before the explicit Continue;
        // both routes must still produce multiple distinct autonomous turns.
        expect(new Set(resumed.turns).size).toBeGreaterThanOrEqual(3);
        expect(requests).toBeGreaterThanOrEqual(3);
      } else {
        expect(new Set(resumed.turns).size).toBe(1);
        expect(requests).toBe(1);
      }
      let goalStatus = (await resumed.request('thread/goal/get', { threadId })).goal.status;
      // turn/completed precedes the empty-continuation breaker's persisted update.
      // Observe the required state instead of treating an earlier event as its ack.
      while (recovery && goalStatus !== 'blocked' && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        goalStatus = (await resumed.request('thread/goal/get', { threadId })).goal.status;
      }
      expect(goalStatus).toBe(recovery ? 'blocked' : 'usageLimited');
    } finally { await resumed.stop(); }
  } finally { await new Promise<void>((resolve) => provider.close(() => resolve())); await cleanupTempDir(home); }
}, 25000);
