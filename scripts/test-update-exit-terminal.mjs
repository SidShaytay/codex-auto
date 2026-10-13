// Requires explicit permission for a separate real terminal. No live accounts or registry.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../dist/cli.js';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
assert(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY, 'Actual terminal required');
assert(process.argv[2], 'Specify sanitized report path');
const modes = () => execFileSync('stty', ['-g'], { stdio: ['inherit', 'pipe', 'pipe'] }).toString();
const baseline = modes();
const results = [];
for (const shell of ['/bin/bash', '/usr/bin/fish']) for (const scenario of [
  { name: 'default', setting: undefined, fetches: 1, notice: true, code: 0 },
  { name: 'legacy-opt-in', setting: '1', fetches: 1, notice: true, code: 0 },
  { name: 'disabled', setting: '0', fetches: 0, notice: false, code: 0 },
  { name: 'offline', setting: undefined, fetches: 1, notice: false, code: 0, offline: true },
  { name: 'timeout', setting: undefined, fetches: 1, notice: false, code: 0, timeout: true },
  { name: 'failed-child', setting: undefined, fetches: 1, notice: true, code: 2, failure: true }
]) {
  const home = await mkdtemp('/tmp/update-exit-terminal-');
  const originalFetch = globalThis.fetch;
  const originalWrite = process.stderr.write;
  let captured = ''; let fetches = 0; let afterExit = true; let restoredBeforeFetch = true; let signal;
  try {
    const app = path.join(home, 'app'); const codex = path.join(home, 'codex'); const workspace = path.join(home, 'workspace');
    await mkdir(app); await mkdir(codex); await mkdir(workspace);
    await writeFile(path.join(app, 'state.json'), JSON.stringify({ version: 1, accounts: ['b'], currentIndex: 0,
      preferredAccountName: 'b', lastSuccessfulAccount: null, lastSessionId: null, updatedAt: new Date().toISOString() }));
    await mkdir(path.join(app, 'accounts/b'), { recursive: true });
    await writeFile(path.join(app, 'accounts/b/auth.json'), JSON.stringify({ account: 'b' }));
    globalThis.fetch = async (_url, options) => {
      fetches++; signal = options.signal; restoredBeforeFetch &&= modes() === baseline;
      const files = await readdir(path.join(app, 'logs'));
      const events = (await readFile(path.join(app, 'logs', files[0]), 'utf8')).trim().split('\n').map(JSON.parse);
      afterExit &&= events.some(event => event.event === 'exit');
      if (scenario.offline) throw new Error('SYNTHETIC_OFFLINE');
      if (scenario.timeout) return new Promise(() => {});
      return new Response(JSON.stringify({ version: '99.0.0' }));
    };
    process.stderr.write = function (chunk, ...args) { captured += chunk.toString(); return originalWrite.call(this, chunk, ...args); };
    console.log('ISOLATED update exit', shell, scenario.name);
    const options = { appHome: app, codexHome: codex, cwd: workspace, env: { HOME: home, SHELL: shell,
      CODEX_AUTO_CODEX_BIN: `node '${path.join(repo, 'tests/fixtures/fake-codex.mjs')}'`, CODEX_AUTO_DEBUG: undefined,
      CODEX_AUTO_UPDATE_CHECK: scenario.setting, CODEX_AUTO_NO_UPDATE_CHECK: undefined,
      FAKE_CODEX_GENERIC_FAILURE_ACCOUNT: scenario.failure ? 'b' : undefined,
      FAKE_CODEX_ENABLE_TTY_MODES: '1', FAKE_CODEX_ENABLE_CSI_U_MODE: '1' } };
    const started = Date.now();
    const codes = [await runCli([], options), await runCli([], options)];
    const elapsedMs = Date.now() - started;
    const notices = (captured.match(/Update available/g) ?? []).length;
    const terminalRestored = modes() === baseline;
    const timeoutAborted = !scenario.timeout || signal?.aborted === true;
    const pass = codes.every(code => code === scenario.code) && fetches === scenario.fetches
      && notices === (scenario.notice ? 1 : 0) && afterExit && restoredBeforeFetch && terminalRestored && timeoutAborted
      && !captured.includes('Update now?') && !captured.includes('SYNTHETIC_OFFLINE');
    results.push({ shell, scenario: scenario.name, pass, codes, fetches, notices, afterExit, restoredBeforeFetch, terminalRestored, timeoutAborted, elapsedMs });
  } catch (error) { results.push({ shell, scenario: scenario.name, pass: false, failure: error.constructor.name }); }
  finally { globalThis.fetch = originalFetch; process.stderr.write = originalWrite; await rm(home, { recursive: true, force: true }); }
}
const sourceHashes = {};
for (const file of ['cli.js', 'lib/update-check.js']) sourceHashes[file] = createHash('sha256').update(await readFile(path.join(repo, 'dist', file))).digest('hex');
await writeFile(process.argv[2], JSON.stringify({ actualTTY: true, syntheticOnly: true, generatedAt: new Date().toISOString(),
  build: JSON.parse(await readFile(path.join(repo, 'dist/build-info.json'), 'utf8')), sourceHashes, results }, null, 2) + '\n');
console.log('Acceptance', results.filter(row => row.pass).length, '/', results.length);
process.exitCode = results.every(row => row.pass) ? 0 : 1;
