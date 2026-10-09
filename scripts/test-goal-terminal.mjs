// Run only in an explicitly approved, separate real terminal after npm run build.
// Synthetic accounts/provider only; no live account or terminal inspection.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runManagedSession } from '../dist/lib/session.js';
const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stderr.isTTY) throw new Error('Actual terminal required');
const outputPath = process.argv[2];
if (!outputPath) throw new Error('Specify a sanitized report output path');
const modes = execFileSync('stty', ['-g'], { stdio: ['inherit', 'pipe', 'pipe'] }).toString();
const results = [];
for (const shell of ['/bin/bash', '/bin/fish']) for (const scenario of [
  { name: 'active', status: 'active', expected: 'active', launches: 2, code: 0 },
  ...['paused', 'blocked', 'complete', 'budgetLimited'].map((status) => ({ name: status, status, expected: status, launches: 2, code: 0 })),
  { name: 'absent', status: null, expected: null, launches: 2, code: 0 },
  { name: 'set-error', status: 'active', expected: 'usageLimited', mode: 'set-error', launches: 1, code: 1 },
  { name: 'unsupported', status: 'active', expected: 'usageLimited', mode: 'unsupported', launches: 2, code: 0 }
]) {
  const home = await mkdtemp('/tmp/isolated-goal-terminal-');
  try {
    const app = path.join(home, 'app'); const codex = path.join(home, 'codex');
    await mkdir(app); await mkdir(path.join(codex, 'sessions'), { recursive: true });
    await writeFile(path.join(app, 'state.json'), JSON.stringify({ version: 1, accounts: ['a', 'b'], currentIndex: 0, preferredAccountName: 'a', lastSuccessfulAccount: null, lastSessionId: null, updatedAt: new Date().toISOString() }));
    for (const account of ['a', 'b']) { await mkdir(path.join(app, 'accounts', account), { recursive: true }); await writeFile(path.join(app, 'accounts', account, 'auth.json'), JSON.stringify({ account })); }
    const goalPath = path.join(home, 'goal.json'); const log = path.join(home, 'launches.jsonl');
    const goal = scenario.status ? { threadId: 'synthetic-terminal-thread', status: scenario.status, objective: 'Synthetic terminal acceptance', tokenBudget: 999, tokensUsed: 123 } : null;
    await writeFile(goalPath, JSON.stringify(goal));
    console.log('ISOLATED', shell, scenario.name);
    const result = await runManagedSession({ appHome: app, codexHome: codex, workspaceDir: repo, interactive: true, codexCommand: `node '${path.join(repo, 'tests/fixtures/fake-codex.mjs')}'`, env: { ...process.env, SHELL: shell, FAKE_CODEX_LOG: log, FAKE_CODEX_SESSION_ID: 'synthetic-terminal-thread', FAKE_GOAL_STATE: goalPath, FAKE_GOAL_MODE: scenario.mode } });
    const rows = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
    const actual = JSON.parse(await readFile(goalPath, 'utf8'));
    const terminalRestored = modes === execFileSync('stty', ['-g'], { stdio: ['inherit', 'pipe', 'pipe'] }).toString();
    const preserved = actual === null ? goal === null : actual.objective === goal.objective && actual.tokenBudget === goal.tokenBudget && actual.tokensUsed === goal.tokensUsed;
    const pass = result.exitCode === scenario.code && rows.length === scenario.launches && (actual?.status ?? null) === scenario.expected && preserved && terminalRestored && rows.slice(1).every((row) => row.args.includes('synthetic-terminal-thread'));
    results.push({ shell, scenario: scenario.name, pass, exitCode: result.exitCode, launches: rows.length, terminalRestored, accountingPreserved: preserved });
  } finally { await rm(home, { recursive: true, force: true }); }
}
await writeFile(outputPath, JSON.stringify({ actualTTY: true, syntheticOnly: true, results }, null, 2));
console.log('Acceptance', results.filter((row) => row.pass).length, '/', results.length);
process.exitCode = results.every((row) => row.pass) ? 0 : 1;
