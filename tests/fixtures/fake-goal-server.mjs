import { createInterface } from 'node:readline';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

export async function runGoalServer() {
  const statePath = process.env.FAKE_GOAL_STATE;
  const logPath = process.env.FAKE_GOAL_RPC_LOG;
  const mode = process.env.FAKE_GOAL_MODE;
  const goal = statePath && existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : null;
  process.stderr.write('private server stderr must never escape\n');
  if (mode === 'exit') return;
  if (mode === 'ignore-term') process.on('SIGTERM', () => {});
  for await (const line of createInterface({ input: process.stdin })) {
    const request = JSON.parse(line);
    if (logPath) appendFileSync(logPath, `${JSON.stringify({ ...request, pid: process.pid, args: process.argv.slice(2) })}\n`);
    if (!('id' in request)) continue;
    if (mode === 'hang' || mode === 'ignore-term') { setInterval(() => {}, 1000); await new Promise(() => {}); }
    let result;
    if (request.method === 'initialize') result = {};
    else if (mode === 'unsupported') {
      process.stdout.write(`${JSON.stringify({ id: request.id, error: { code: -32601, message: 'private error' } })}\n`); continue;
    } else if (request.method === 'thread/goal/get') result = { goal };
    else if (request.method === 'thread/goal/set') {
      if (mode === 'set-error') {
        process.stdout.write(`${JSON.stringify({ id: request.id, error: { code: -1, message: 'private objective' } })}\n`); continue;
      }
      if (mode !== 'no-ack') goal.status = request.params.status;
      if (statePath) writeFileSync(statePath, JSON.stringify(goal));
      result = { goal };
    } else throw new Error('Unexpected request');
    if (mode === 'wrong-thread' && result.goal) result = { goal: { ...goal, threadId: 'another-thread' } };
    if (mode === 'malformed') process.stdout.write('not-json\n');
    else if (mode === 'oversized') process.stdout.write('x'.repeat(3 * 1024 * 1024));
    else {
      // Exercise chunk boundaries and unrelated notifications.
      process.stdout.write(`${JSON.stringify({ method: 'ignored', params: { private: 'must not escape' } })}\n`);
      const response = `${JSON.stringify({ id: request.id, result })}\n`;
      process.stdout.write(response.slice(0, 8));
      process.stdout.write(response.slice(8));
    }
  }
}

if (process.argv[1]?.endsWith('fake-goal-server.mjs')) await runGoalServer();
