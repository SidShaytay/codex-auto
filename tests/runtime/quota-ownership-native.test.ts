import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node-pty';
import { expect, test } from 'vitest';
import { cleanupTempDir, createTempAppHome } from '../helpers/temp.js';

// Opt-in capability probe, not real terminal acceptance or a production hook design.
// Never load real credentials/config, contact a provider, or use a shared daemon.
const binary = process.env.CODEX_QUOTA_OWNERSHIP_NATIVE_BIN;
const nativeTest = binary ? test : test.skip;

nativeTest.each([false, true])('native SessionStart ownership requires hook trust: isolatedBypass=%s', async (bypass) => {
  const root = await createTempAppHome('native-quota-ownership-');
  const home = path.join(root, 'home');
  const codexHome = path.join(root, 'codex');
  const workspace = path.join(root, 'workspace');
  const requestTimes: number[] = [];
  const server = createServer((req, res) => {
    requestTimes.push(Date.now());
    req.resume();
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { type: 'insufficient_quota', code: 'insufficient_quota', message: 'Synthetic quota' } }));
  });
  let child: ReturnType<typeof spawn> | undefined;
  let closing: Promise<unknown> | undefined;
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.all([home, codexHome, workspace].map((directory) => mkdir(directory)));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing synthetic server address');
    const outputFile = path.join(root, 'allowlisted.jsonl');
    const helper = path.join(root, 'hook.cjs');
    // The helper keeps only allowlisted metadata. No prompt, transcript or raw ID persists.
    await writeFile(helper, `let s=''; process.stdin.on('data', c=>s+=c); process.stdin.on('end',()=>{ const x=JSON.parse(s); require('node:fs').appendFileSync(${JSON.stringify(outputFile)}, JSON.stringify({event:x.hook_event_name,source:x.source,validSession:typeof x.session_id==='string',hasTranscript:typeof x.transcript_path==='string',time:Date.now()})+'\\n'); });`);
    await writeFile(path.join(codexHome, 'config.toml'), `model="gpt-5.4"
model_provider="synthetic"
[model_providers.synthetic]
name="Isolated synthetic"
base_url="http://127.0.0.1:${address.port}/v1"
wire_api="responses"
requires_openai_auth=false
request_max_retries=0
stream_max_retries=0
[analytics]
enabled=false
[projects.${JSON.stringify(workspace)}]
trust_level="trusted"
[[hooks.SessionStart]]
[[hooks.SessionStart.hooks]]
type="command"
command=${JSON.stringify(`node ${helper}`)}
`);
    let output = '';
    child = spawn(binary!, ['--no-daemon', '--no-alt-screen',
      // Probe only: never introduce this blanket bypass in wrapper launches.
      ...(bypass ? ['--dangerously-bypass-hook-trust'] : []),
      '-a', 'never', 'Synthetic isolated ownership probe'], {
      cwd: workspace, cols: 100, rows: 30, name: 'xterm-256color',
      env: { PATH: process.env.PATH!, HOME: home, CODEX_HOME: codexHome, TERM: 'xterm-256color', SHELL: '/bin/bash' }
    });
    closing = new Promise((resolve) => child!.onExit(resolve));
    child.onData((data) => {
      output = (output + data).slice(-100000);
      if (data.includes('\u001b[6n')) child!.write('\u001b[1;1R');
    });
    // End only this probe's child. A waiting prompt is expected in both cases.
    timer = setTimeout(() => child!.kill('SIGTERM'), 8000);
    await closing;
    clearTimeout(timer);
    const events = (await readFile(outputFile, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    expect(/Error loading configuration|unknown field|unexpected argument/i.test(output)).toBe(false);
    if (bypass) {
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ event: 'SessionStart', source: 'startup', validSession: true, hasTranscript: true });
      expect(requestTimes.length).toBeGreaterThan(0);
      expect(events[0].time).toBeLessThanOrEqual(requestTimes[0]);
    } else {
      expect(events).toEqual([]);
      expect(requestTimes).toEqual([]);
      expect(/hook.*trust|trust.*hook/i.test(output)).toBe(true);
    }
  } finally {
    if (timer) clearTimeout(timer);
    if (child) { child.kill('SIGTERM'); await closing; }
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanupTempDir(root);
  }
}, 15_000);
