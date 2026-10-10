// Isolated native rendering regression. Never use real account credentials.
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { Writable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export async function runNativeBootstrapRegression({ binary, sessionRunner, interactive = true, stdin = process.stdin, stdout, stderr = Object.assign(new Writable({ write(_chunk, _encoding, done) { done(); } }), { isTTY: true }), shell = '/bin/bash' }) {
  const home = await mkdtemp('/tmp/native-bootstrap-regression-');
  const requests = [];
  const backend = createServer((req, res) => {
    requests.push(req.url); req.resume();
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.includes('/wham/accounts/check')) { res.writeHead(401); res.end('{}'); }
    else if (req.url?.includes('/wham/config/bundle')) res.end(JSON.stringify({ requirements_toml: { enterprise_managed: [] } }));
    else res.end('{}');
  });
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
  let captured = '';
  const output = new Writable({ write(chunk, encoding, done) {
    captured += chunk.toString();
    if (stdout) stdout.write(chunk, encoding, done); else done();
  } });
  output.isTTY = stdout?.isTTY ?? true;
  output.columns = stdout?.columns ?? 140; output.rows = stdout?.rows ?? 40;
  try {
    const origin = `http://127.0.0.1:${backend.address().port}`;
    const app = path.join(home, 'app'); const codex = path.join(home, 'codex'); const workspace = path.join(home, 'workspace');
    await mkdir(app); await mkdir(workspace); await mkdir(path.join(codex, 'sessions/2026/10/09'), { recursive: true });
    const thread = '00000000-0000-7000-8000-000000000129';
    const goal = path.join(home, 'goal.json'); const launches = path.join(home, 'launches.jsonl');
    await writeFile(path.join(app, 'state.json'), JSON.stringify({ version: 1, accounts: ['a', 'b', 'c'], currentIndex: 0,
      preferredAccountName: 'a', lastSuccessfulAccount: null, lastSessionId: thread, updatedAt: new Date().toISOString() }));
    const jwt = [{ alg: 'none', typ: 'JWT' }, { email: 'synthetic@example.invalid',
      'https://api.openai.com/auth': { chatgpt_plan_type: 'pro', chatgpt_account_id: 'synthetic-workspace', chatgpt_user_id: 'synthetic-user' } }]
      .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.' + Buffer.from('synthetic-signature').toString('base64url');
    const syntheticAuth = Object.fromEntries([['id' + '_token', jwt], ['access' + '_token', 'synthetic-' + 'access'],
      ['refresh' + '_token', 'synthetic-' + 'refresh'], ['account_id', 'synthetic-workspace']]);
    for (const account of ['a', 'b', 'c']) {
      await mkdir(path.join(app, 'accounts', account), { recursive: true });
      const data = account === 'b' ? { account, auth_mode: 'chatgpt', OPENAI_API_KEY: null, ['to' + 'kens']: syntheticAuth, last_refresh: new Date().toISOString() } : { account };
      await writeFile(path.join(app, 'accounts', account, 'auth.json'), JSON.stringify(data), { mode: 0o600 });
    }
    await writeFile(path.join(codex, 'config.toml'), `chatgpt_base_url="${origin}/backend-api/"\ncli_auth_credentials_store="file"\ncheck_for_update_on_startup=false\n[analytics]\nenabled=false\n`);
    await writeFile(path.join(codex, `sessions/2026/10/09/rollout-2026-10-09T10-00-00-${thread}.jsonl`), `${JSON.stringify({
      timestamp: '2026-10-09T10:00:00Z', type: 'session_meta', payload: { id: thread, timestamp: '2026-10-09T10:00:00Z', cwd: workspace,
        originator: 'codex_cli_rs', cli_version: '0.162.1', source: 'cli', model_provider: 'openai' } })}\n`);
    await writeFile(goal, JSON.stringify({ threadId: thread, status: 'active', objective: 'Synthetic native-bootstrap goal', tokenBudget: 999, tokensUsed: 123 }));
    const runResult = await sessionRunner({ appHome: app, codexHome: codex, workspaceDir: workspace, interactive, stdin, stdout: output, stderr,
      extraArgs: ['resume', thread, '-a', 'never', '-s', 'danger-full-access'],
      codexCommand: `node '${path.join(repo, 'tests/fixtures/fake-codex.mjs')}'`,
      env: { HOME: home, SHELL: shell, CODEX_AUTO_UPDATE_CHECK: '0', FAKE_CODEX_LOG: launches, FAKE_CODEX_SESSION_ID: thread,
        FAKE_GOAL_STATE: goal, FAKE_CODEX_NATIVE_BOOTSTRAP_BIN: binary, FAKE_CODEX_NATIVE_ROUTING_ORIGIN: origin,
        FAKE_CODEX_UNAUTHORIZED_ACCOUNTS: '', FAKE_CODEX_GENERIC_FAILURE_ACCOUNT: undefined,
        FAKE_CODEX_BOOTSTRAP_TERMINAL_CONTROLS: undefined, FAKE_CODEX_QUOTA_MESSAGE_VARIANT: 'upgrade' } });
    const rows = (await readFile(launches, 'utf8')).trim().split('\n').map(JSON.parse);
    const logFiles = await readdir(path.join(app, 'logs'));
    const events = (await readFile(path.join(app, 'logs', logFiles[0]), 'utf8')).trim().split('\n').map(JSON.parse);
    const finalGoal = JSON.parse(await readFile(goal, 'utf8'));
    const nativeEnd = events.find((event) => event.event === 'invocation_end' && event.account === 'b');
    return { syntheticOnly: true, nativeVersionSeen: captured.includes('(v0.162.1)'),
      nativeFatalEnvelopeSeen: captured.includes('Error: account/read failed during TUI bootstrap: account/read failed: workspace routing discovery unauthorized (401) (code -32603)'),
      routing401Requests: requests.filter((url) => url?.includes('/wham/accounts/check')).length,
      runResult, launches: rows.length, nativeExitCode: nativeEnd?.exitCode,
      nativeAuthorizationClassified: nativeEnd?.bootstrapAuthorizationError,
      nativeQuotaClassified: nativeEnd?.quotaDetected,
      sameThread: rows.every((row) => row.args.includes(thread)),
      policyPreserved: rows.every((row) => ['-a', 'never', '-s', 'danger-full-access'].every((arg) => row.args.includes(arg)) && row.args.filter((arg) => arg === '--no-daemon').length === 1),
      goalPreserved: finalGoal.status === 'active' && finalGoal.objective === 'Synthetic native-bootstrap goal' && finalGoal.tokenBudget === 999 && finalGoal.tokensUsed === 123,
      autonomousProgress: captured.includes('autonomous goal turn completed') };
  } finally {
    backend.closeAllConnections();
    await new Promise((resolve) => backend.close(resolve));
    await rm(home, { recursive: true, force: true });
  }
}
