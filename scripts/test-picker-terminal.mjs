// Explicit permission required: run in a separate real terminal, synthetic data only.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runManagedSession } from '../dist/lib/session.js';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
assert(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY, 'Actual terminal required');
assert(process.argv[2], 'Specify a sanitized report path');
const modes = () => execFileSync('stty', ['-g'], { stdio: ['inherit', 'pipe', 'pipe'] }).toString();
const baseline = modes();
const results = [];
for (const shell of ['/bin/bash', '/usr/bin/fish']) {
  for (const selected of [true, false]) {
    const home = await mkdtemp('/tmp/picker-terminal-');
    try {
      const app = path.join(home, 'app');
      const codex = path.join(home, 'codex');
      const workspace = path.join(home, 'workspace');
      const launches = path.join(home, 'launches.jsonl');
      await mkdir(app); await mkdir(workspace);
      await mkdir(path.join(codex, 'sessions/2026/04/17'), { recursive: true });
      await writeFile(path.join(app, 'state.json'), JSON.stringify({ version: 1, accounts: ['a', 'b'], currentIndex: 0,
        preferredAccountName: 'a', lastSuccessfulAccount: null, lastSessionId: 'remembered-thread', updatedAt: new Date().toISOString() }));
      for (const account of ['a', 'b']) {
        await mkdir(path.join(app, 'accounts', account), { recursive: true });
        await writeFile(path.join(app, 'accounts', account, 'auth.json'), JSON.stringify({ account }));
      }
      if (selected) await writeFile(path.join(codex, 'sessions/2026/04/17/rollout-2026-04-17T18-00-00-selected-thread.jsonl'),
        JSON.stringify({ type: 'session_meta', payload: { id: 'selected-thread', cwd: workspace, timestamp: '2026-04-17T18:00:00Z' } }) + '\n');
      console.log('ISOLATED picker', shell, selected ? 'selected' : 'unbound');
      const result = await runManagedSession({ appHome: app, codexHome: codex, workspaceDir: workspace,
        extraArgs: ['resume'], codexCommand: `node '${path.join(repo, 'tests/fixtures/fake-codex.mjs')}'`, interactive: true,
        env: { HOME: home, SHELL: shell, TERM: process.env.TERM || 'xterm-256color',
          FAKE_CODEX_LOG: launches, FAKE_CODEX_RESUME_PICKER_SESSION_ID: selected ? 'selected-thread' : undefined,
          FAKE_CODEX_SKIP_SESSION_ARTIFACTS_ON_RESUME: '1', FAKE_CODEX_ENABLE_TTY_MODES: '1', FAKE_CODEX_ENABLE_CSI_U_MODE: '1' } });
      const rows = (await readFile(launches, 'utf8')).trim().split('\n').map(JSON.parse);
      const logs = await readdir(path.join(app, 'logs'));
      const events = (await readFile(path.join(app, 'logs', logs[0]), 'utf8')).trim().split('\n').map(JSON.parse);
      const state = JSON.parse(await readFile(path.join(app, 'state.json'), 'utf8'));
      const terminalRestored = baseline === modes();
      const noRememberedResume = rows.every(row => !row.args.includes('remembered-thread'));
      const sameSelection = !selected || (rows.length === 2 && rows[1].args.includes('selected-thread') && state.lastSessionId === 'selected-thread');
      const safeStop = selected || (rows.length === 1 && result.switchCount === 0 && result.exitCode !== 0);
      const pass = terminalRestored && noRememberedResume && sameSelection && safeStop
        && (selected ? result.exitCode === 0 && result.switchCount === 1 : true);
      results.push({ shell, selectionEvidence: selected, pass, terminalRestored, noRememberedResume, sameSelection, safeStop,
        exitCode: result.exitCode, switches: result.switchCount, launches: rows.length,
        quotaDetected: events.some(event => event.event === 'invocation_end' && event.quotaDetected) });
    } catch (error) {
      results.push({ shell, selectionEvidence: selected, pass: false, failure: error.constructor.name });
    } finally { await rm(home, { recursive: true, force: true }); }
  }
}
await writeFile(process.argv[2], JSON.stringify({ actualTTY: true, syntheticOnly: true, generatedAt: new Date().toISOString(),
  build: JSON.parse(await readFile(path.join(repo, 'dist/build-info.json'), 'utf8')),
  sessionHash: createHash('sha256').update(await readFile(path.join(repo, 'dist/lib/session.js'))).digest('hex'), results }, null, 2) + '\n');
console.log('Acceptance', results.filter(row => row.pass).length, '/', results.length);
process.exitCode = results.every(row => row.pass) ? 0 : 1;
