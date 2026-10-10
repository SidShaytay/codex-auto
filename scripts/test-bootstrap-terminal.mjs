// Requires explicit permission for a separate real terminal. Synthetic data only.
// Build first, then: node scripts/test-bootstrap-terminal.mjs /path/to/report.json
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../dist/cli.js';
import { maybePromptForUpdate } from '../dist/lib/update-check.js';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
assert(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY, 'Actual terminal required');
const outputPath = process.argv[2];
assert(outputPath, 'Specify a sanitized report path');
const modes = () => execFileSync('stty', ['-g'], { stdio: ['inherit', 'pipe', 'pipe'] }).toString();
const baseline = modes();
const results = [];
const sourceHashes = {};
for (const file of ['cli.js', 'lib/session.js', 'lib/detection.js', 'lib/update-check.js']) {
  sourceHashes[file] = createHash('sha256').update(await readFile(path.join(repo, 'dist', file))).digest('hex');
}

for (const shell of ['/bin/bash', '/bin/fish']) for (const scenario of [
  { name: 'plain-recovery', accounts: ['a', 'b', 'c'], unauthorized: 'b', code: 0, launches: 3 },
  { name: 'split-native-controls', accounts: ['a', 'b', 'c'], unauthorized: 'b', controls: true, code: 0, launches: 3 },
  { name: 'all-unauthorized', accounts: ['b', 'c'], unauthorized: 'b,c', controls: true, code: 1, launches: 2 },
  { name: 'quota-and-unauthorized-only', accounts: ['a', 'b'], unauthorized: 'b', controls: true, code: 1, launches: 2 },
  { name: 'generic-error', accounts: ['b', 'c'], generic: 'b', code: 2, launches: 1 },
  { name: 'unbound', accounts: ['b', 'c'], unauthorized: 'b', controls: true, unbound: true, code: 1, launches: 1 },
  { name: 'historical-quota', accounts: ['b', 'c'], replay: true, code: 0, launches: 1 }
]) {
  const home = await mkdtemp('/tmp/bootstrap-terminal-');
  const originalWrite = process.stdout.write;
  let captured = '';
  try {
    const app = path.join(home, 'app'); const codex = path.join(home, 'codex');
    const workspace = path.join(home, 'workspace');
    await mkdir(app); await mkdir(workspace); await mkdir(path.join(codex, 'sessions/2026/10/09'), { recursive: true });
    const thread = 'synthetic-bootstrap-terminal-thread';
    const goal = path.join(home, 'goal.json'); const launches = path.join(home, 'launches.jsonl');
    await writeFile(path.join(app, 'state.json'), JSON.stringify({ version: 1, accounts: scenario.accounts,
      currentIndex: 0, preferredAccountName: scenario.accounts[0], lastSuccessfulAccount: null,
      lastSessionId: scenario.unbound ? null : thread, updatedAt: new Date().toISOString() }));
    for (const account of scenario.accounts) {
      await mkdir(path.join(app, 'accounts', account), { recursive: true });
      await writeFile(path.join(app, 'accounts', account, 'auth.json'), JSON.stringify({ account }));
    }
    // A newer cached npm version would previously interrupt a real TTY launch.
    await writeFile(path.join(app, 'update-check.json'), JSON.stringify({ checkedAt: new Date().toISOString(), latestVersion: '99.0.0' }));
    if (!scenario.unbound) await writeFile(path.join(codex, `sessions/2026/10/09/rollout-2026-10-09T00-00-00-${thread}.jsonl`),
      `${JSON.stringify({ type: 'session_meta', payload: { id: thread, cwd: workspace, timestamp: '2026-10-09T00:00:00Z' } })}\n`);
    await writeFile(goal, JSON.stringify({ threadId: thread, status: 'active', objective: 'Synthetic goal', tokenBudget: 999, tokensUsed: 123 }));
    console.log('ISOLATED', shell, scenario.name);
    process.stdout.write = function (chunk, ...args) {
      captured += chunk.toString();
      return originalWrite.call(this, chunk, ...args);
    };
    const policy = ['-a', 'never', '-s', 'danger-full-access', '--model', 'synthetic-model', '-c', 'model_provider="local-test"'];
    const code = await runCli(scenario.unbound ? policy : ['resume', thread, ...policy], { appHome: app, codexHome: codex, cwd: workspace,
      env: { HOME: home, SHELL: shell, CODEX_AUTO_CODEX_BIN: `node '${path.join(repo, 'tests/fixtures/fake-codex.mjs')}'`,
        CODEX_AUTO_UPDATE_CHECK: undefined, CODEX_AUTO_NO_UPDATE_CHECK: undefined, CODEX_AUTO_DEBUG: undefined,
        FAKE_CODEX_SESSION_ID: thread, FAKE_CODEX_LOG: launches, FAKE_GOAL_STATE: goal,
        FAKE_CODEX_UNAUTHORIZED_ACCOUNTS: scenario.unauthorized ?? '', FAKE_CODEX_GENERIC_FAILURE_ACCOUNT: scenario.generic,
        FAKE_CODEX_BOOTSTRAP_TERMINAL_CONTROLS: scenario.controls ? '1' : undefined,
        FAKE_CODEX_RESUME_REPLAYS_OLD_QUOTA: scenario.replay ? '1' : undefined,
        FAKE_CODEX_QUOTA_MESSAGE_VARIANT: 'upgrade', FAKE_CODEX_ENABLE_TTY_MODES: '1', FAKE_CODEX_ENABLE_CSI_U_MODE: '1' } });
    const rows = (await readFile(launches, 'utf8')).trim().split('\n').map(JSON.parse);
    const logFiles = await readdir(path.join(app, 'logs'));
    const events = (await readFile(path.join(app, 'logs', logFiles[0]), 'utf8')).trim().split('\n').map(JSON.parse);
    const state = JSON.parse(await readFile(path.join(app, 'state.json'), 'utf8'));
    const finalGoal = JSON.parse(await readFile(goal, 'utf8'));
    const terminalRestored = baseline === modes();
    const policyPreserved = rows.every((row) => policy.every((arg) => row.args.includes(arg)) && row.args.filter((arg) => arg === '--no-daemon').length === 1);
    const sameThread = scenario.unbound || rows.every((row) => row.args.includes(thread));
    const authCount = events.filter((event) => event.event === 'invocation_end' && event.bootstrapAuthorizationError && !event.quotaDetected).length;
    const expectedAuth = (scenario.unauthorized ?? '').split(',').filter(Boolean).length;
    const goalPreserved = finalGoal.objective === 'Synthetic goal' && finalGoal.tokenBudget === 999 && finalGoal.tokensUsed === 123;
    const goalProgress = code !== 0 || scenario.replay || (finalGoal.status === 'active' && captured.includes('autonomous goal turn completed'));
    const failedNotSuccessful = code === 0 || state.lastSuccessfulAccount === null;
    const pass = code === scenario.code && rows.length === scenario.launches && authCount === expectedAuth && terminalRestored &&
      policyPreserved && sameThread && goalPreserved && goalProgress && failedNotSuccessful && !captured.includes('Update available');
    results.push({ shell, scenario: scenario.name, pass, exitCode: code, launches: rows.length, authorizationErrors: authCount,
      terminalRestored, policyPreserved, sameThread, goalPreserved, goalProgress, failedNotSuccessful });
    console.log('RESULT', pass ? 'PASS' : 'FAIL');
  } catch (error) {
    results.push({ shell, scenario: scenario.name, pass: false, failure: error.constructor.name });
  } finally {
    process.stdout.write = originalWrite;
    await rm(home, { recursive: true, force: true });
  }
}

// Keep explicit update choices usable. No registry, npm installation or credentials.
// Answers are injected; this does not claim physical keyboard/IME acceptance.
for (const answer of ['', 's', 'y']) {
  const home = await mkdtemp('/tmp/bootstrap-update-terminal-');
  try {
    let prompts = 0; let installs = 0;
    await maybePromptForUpdate({ appHome: home, packageName: 'codex-auto', currentVersion: '0.3.6',
      stdin: process.stdin, stderr: process.stderr, env: { CODEX_AUTO_UPDATE_CHECK: '1' },
      fetchLatestVersion: async () => '99.0.0', readAnswer: async () => { prompts++; return answer; },
      runInstall: async () => { installs++; return 0; } });
    if (answer === 's') await maybePromptForUpdate({ appHome: home, packageName: 'codex-auto', currentVersion: '0.3.6',
      stdin: process.stdin, stderr: process.stderr, env: { CODEX_AUTO_UPDATE_CHECK: '1' },
      fetchLatestVersion: async () => { throw new Error('Cache should suppress fetch'); },
      readAnswer: async () => { prompts++; return ''; } });
    const terminalRestored = baseline === modes();
    results.push({ scenario: `opt-in-${answer || 'later'}`, pass: prompts === 1 && installs === (answer === 'y' ? 1 : 0) && terminalRestored, terminalRestored });
  } finally { await rm(home, { recursive: true, force: true }); }
}
await writeFile(outputPath, JSON.stringify({ actualTTY: true, syntheticOnly: true, generatedAt: new Date().toISOString(),
  version: JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8')).version,
  build: JSON.parse(await readFile(path.join(repo, 'dist/build-info.json'), 'utf8')), sourceHashes, results }, null, 2) + '\n');
console.log('Acceptance', results.filter((row) => row.pass).length, '/', results.length);
process.exitCode = results.every((row) => row.pass) ? 0 : 1;
