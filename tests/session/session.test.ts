import path from 'node:path';
import { chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, test } from 'vitest';
import { instancesRoot } from '../../src/lib/paths.js';
import { enforceManagedServerPolicy, runManagedSession } from '../../src/lib/session.js';
import { loadState } from '../../src/lib/state.js';
import { cleanupTempDir, createTempAppHome, seedAccount, seedState } from '../helpers/temp.js';

async function seedCodexHome(codexHome: string): Promise<void> {
  await mkdir(path.join(codexHome, 'sessions'), { recursive: true });
  await writeFile(path.join(codexHome, 'config.toml'), 'model = "gpt-5.4-mini"\n', 'utf8');
  await writeFile(path.join(codexHome, 'session_index.jsonl'), '', 'utf8');
}

async function seedExistingSession(
  codexHome: string,
  options: { id: string; updatedAt: string; cwd?: string }
): Promise<void> {
  const sessionFilePath = path.join(
    codexHome,
    'sessions',
    '2026',
    '04',
    '17',
    `rollout-2026-04-17T18-00-00-${options.id}.jsonl`
  );
  await mkdir(path.dirname(sessionFilePath), { recursive: true });
  await writeFile(
    sessionFilePath,
    `${JSON.stringify({
      timestamp: options.updatedAt,
      type: 'session_meta',
      payload: {
        id: options.id,
        timestamp: options.updatedAt,
        cwd: options.cwd ?? process.cwd()
      }
    })}\n`,
    'utf8'
  );
  await writeFile(
    path.join(codexHome, 'session_index.jsonl'),
    `${JSON.stringify({
      id: options.id,
      thread_name: `thread-${options.id}`,
      updated_at: options.updatedAt
    })}\n`,
    'utf8'
  );
}

class TtyCaptureStream extends Writable {
  override isTTY = true;
  override columns = 120;
  override rows = 40;
  private readonly chunks: string[] = [];

  text(): string {
    return this.chunks.join('');
  }

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(chunk.toString());
    callback();
  }
}

class TtyInputStream extends PassThrough {
  override isTTY = true;
  public rawModeCalls: boolean[] = [];
  public isRaw = false;

  setRawMode(value: boolean): this {
    this.rawModeCalls.push(value);
    this.isRaw = value;
    return this;
  }
}

describe('managed session runner', () => {
  test.each(['--remote', '--remote=unix:///tmp/server', '--remote-auth-token-env', '--remote-auth-token-env=TOKEN', 'agents', 'app-server', 'remote-control'])(
    'rejects incompatible server option %s before launching', async (arg) => {
      await expect(runManagedSession({ appHome: '/unused', workspaceDir: '/unused', extraArgs: [arg] }))
        .rejects.toThrow(/incompatible/);
    }
  );
  test('enforces one daemon opt-out and preserves literal values and exec', () => {
    expect(enforceManagedServerPolicy([])).toEqual(['--no-daemon']);
    expect(enforceManagedServerPolicy(['resume', '--no-daemon', '--no-daemon', 'id']))
      .toEqual(['resume', '--no-daemon', 'id']);
    expect(enforceManagedServerPolicy(['-m', '--remote', '--', '--remote']))
      .toEqual(['--no-daemon', '-m', '--remote', '--', '--remote']);
    expect(enforceManagedServerPolicy(['exec', 'hello'])).toEqual(['exec', 'hello']);
  });
  test.each([
    {
      name: 'the reported command with global valued flags before resume',
      args: ['--no-daemon', '-a', 'never', '--no-alt-screen', '-s', 'danger-full-access', 'resume', 'policy-session'],
      policy: ['--no-daemon', '-a', 'never', '--no-alt-screen', '-s', 'danger-full-access']
    },
    {
      name: 'repeated config and long equals policy flags without picker or image arguments',
      args: [
        '--config', 'model="test-model"', 'resume', '--all', '--include-non-interactive',
        '--no-daemon', '--config=features.example=true', '--sandbox=read-only', '--ask-for-approval=on-request',
        '--profile', 'restricted', '--model=test-model', '--local-provider', 'ollama', '--oss',
        '--enable', 'example', '--disable=other', '--strict-config', '--search',
        '--image', 'first-run.png', 'policy-session', 'Original prompt', '--no-daemon'
      ],
      policy: [
        '--config', 'model="test-model"', '--no-daemon', '--config=features.example=true',
        '--sandbox=read-only', '--ask-for-approval=on-request', '--profile', 'restricted',
        '--model=test-model', '--local-provider', 'ollama', '--oss', '--enable', 'example',
        '--disable=other', '--strict-config', '--search'
      ]
    },
    {
      name: 'attached short values and flags following the explicit session id',
      args: [
        '-anever', '-sread-only', '-prestricted', '-mtest-model', '-cfeatures.example=true',
        'resume', 'policy-session', '--no-daemon', '--add-dir=/tmp', '-C', process.cwd(),
      ],
      policy: [
        '-anever', '-sread-only', '-prestricted', '-mtest-model', '-cfeatures.example=true',
        '--no-daemon', '--add-dir=/tmp', '-C', process.cwd(),
      ]
    },
    {
      name: 'short equals options and last selection without replaying the original prompt',
      args: ['-a=never', '-s=read-only', 'resume', '--last', '--no-daemon', 'Original prompt', '--search'],
      policy: ['-a=never', '-s=read-only', '--no-daemon']
    },
    {
      name: 'an explicit session id behind an end-of-options delimiter',
      args: ['--no-daemon', '-a', 'on-request', 'resume', '--', 'policy-session', '--search'],
      policy: ['--no-daemon', '-a', 'on-request']
    }
  ])('preserves launch policy across quota rotation: $name', async ({ args, policy }) => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'policy-invocations.jsonl');
    const fixturePath = path.join(appHome, 'policy-codex.mjs');
    try {
      await seedCodexHome(codexHome);
      await seedExistingSession(codexHome, {
        id: 'policy-session',
        updatedAt: '2026-04-17T18:00:00.000Z'
      });
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        // A stale fallback must not override an explicit resume target.
        lastSessionId: 'unrelated-old-session',
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'dummy-a' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'dummy-b' });
      // This fixture never creates a session record: recovery must bind the user's
      // resume target rather than accidentally relying on new-session discovery.
      await writeFile(fixturePath, `
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
const auth = JSON.parse(readFileSync(path.join(process.env.CODEX_HOME, 'auth.json'), 'utf8'));
appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({ args: process.argv.slice(2), account: auth.account }) + '\\n');
if (auth.account === 'a') {
  console.log("You've hit your usage limit. To get more access now, send a request to your admin.");
  process.exit(1);
}
console.log('available account resumed');
`, 'utf8');

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        extraArgs: args,
        codexCommand: `node ${fixturePath}`,
        env: { ...process.env, FAKE_CODEX_LOG: logPath },
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        interactive: false
      });

      expect(result).toMatchObject({ finalAccount: 'b', switchCount: 1, exitCode: 0, exhaustedAll: false });
      const invocations = (await readFile(logPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
      const normalizedArgs = enforceManagedServerPolicy(args);
      const firstArgs = normalizedArgs.includes('--no-alt-screen') ? normalizedArgs : [...normalizedArgs, '--no-alt-screen'];
      const normalizedPolicy = enforceManagedServerPolicy(policy);
      const resumePolicy = normalizedPolicy.includes('--no-alt-screen') ? normalizedPolicy : ['--no-alt-screen', ...normalizedPolicy];
      expect(invocations).toEqual([
        { account: 'a', args: firstArgs },
        { account: 'b', args: ['resume', ...resumePolicy, 'policy-session', 'Continue'] }
      ]);
      await expect(loadState(appHome)).resolves.toMatchObject({ lastSessionId: 'policy-session' });
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('preserves the reported launch flags when a bare session discovers its id and rotates', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'bare-policy-invocations.jsonl');
    const policy = ['--no-daemon', '-a', 'never', '--no-alt-screen', '-s', 'danger-full-access'];
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: 'unrelated-old-session',
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'dummy-a' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'dummy-b' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        extraArgs: policy,
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SESSION_ID: 'fresh-policy-session'
        },
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        interactive: false
      });

      expect(result).toMatchObject({ finalAccount: 'b', switchCount: 1, exitCode: 0, exhaustedAll: false });
      const invocations = (await readFile(logPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
      expect(invocations.map(({ args, authText }) => ({ args, account: JSON.parse(authText).account }))).toEqual([
        { account: 'a', args: policy },
        { account: 'b', args: ['resume', ...policy, 'fresh-policy-session', 'Continue'] }
      ]);
      await expect(loadState(appHome)).resolves.toMatchObject({ lastSessionId: 'fresh-policy-session' });
      // Evidence must exist automatically, without enabling debug or manually
      // exporting diagnostics after the failure.
      const incidentDir = path.join(appHome, 'diagnostics');
      const reports = (await readdir(incidentDir)).filter((name) => name.endsWith('.json'));
      expect(reports).toHaveLength(1);
      const incidentText = await readFile(path.join(incidentDir, reports[0]!), 'utf8');
      const incident = JSON.parse(incidentText);
      expect(incident.reason).toBe('quota_switch');
      expect(incident.events.map((event: { event: string }) => event.event)).toEqual(['launch', 'invocation_end', 'quota_switch']);
      expect(incident.events[0].policy).toMatchObject({ noDaemon: true, approval: 'never', sandbox: 'danger-full-access' });
      expect(incidentText).not.toContain('dummy-a');
      expect(incidentText).not.toContain('dummy-b');
      expect(incidentText).not.toContain('fresh-policy-session');
      expect(incidentText).not.toContain(appHome);

    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('switches accounts and resumes with persisted session id after quota failure', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SESSION_ID: 'session-123'
        },
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');

      const logText = await readFile(logPath, 'utf8');
      expect(logText).toContain('"args":["resume","--no-alt-screen","--no-daemon","session-123","Continue"]');
      expect(await readFile(path.join(codexHome, 'session_index.jsonl'), 'utf8')).toContain('session-123');
      await expect(readdir(instancesRoot(appHome))).resolves.toEqual([]);
      await expect(loadState(appHome)).resolves.toMatchObject({
        lastSessionId: 'session-123',
        retryAvailabilityByAccount: {
          a: {
            displayText: '11:10 PM'
          }
        }
      });
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('binds an explicit initial resume target even when resume does not create a new session record', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex-resume-explicit.log');
    const stderr = new PassThrough();

    try {
      await seedCodexHome(codexHome);
      await seedExistingSession(codexHome, {
        id: 'resume-explicit-session',
        updatedAt: '2026-04-17T18:00:00.000Z'
      });
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        extraArgs: ['resume', 'resume-explicit-session'],
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SKIP_SESSION_ARTIFACTS_ON_RESUME: '1'
        },
        stderr,
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');
      const logText = await readFile(logPath, 'utf8');
      expect(logText).toContain('"args":["--no-daemon","resume","resume-explicit-session","--no-alt-screen"]');
      expect(logText).toContain('"args":["resume","--no-alt-screen","--no-daemon","resume-explicit-session","Continue"]');
      await expect(loadState(appHome)).resolves.toMatchObject({
        lastSessionId: 'resume-explicit-session'
      });
      expect(stderr.read()?.toString() ?? '').not.toContain('Unable to safely resume bound session');
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('uses state.lastSessionId as fallback when bare resume has no explicit session id', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex-no-session.log');
    const stderr = new PassThrough();

    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: 'state-last-session',
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        extraArgs: ['resume'],
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SKIP_SESSION_ARTIFACTS_ON_RESUME: '1'
        },
        stderr,
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');
      const logText = await readFile(logPath, 'utf8');
      // First run uses original args; second run uses state.lastSessionId to resume
      expect(logText).toContain('"args":["--no-daemon","resume","--no-alt-screen"]');
      expect(logText).toContain('"args":["resume","--no-alt-screen","--no-daemon","state-last-session","Continue"]');
      expect(stderr.read()?.toString() ?? '').not.toContain('Unable to safely resume bound session');
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('binds session from interactive resume picker via session file mtime when no session id is in args', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex-picker.log');
    const stderr = new PassThrough();

    try {
      await seedCodexHome(codexHome);
      await seedExistingSession(codexHome, {
        id: 'picker-session',
        updatedAt: '2026-04-17T18:00:00.000Z'
      });
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        extraArgs: ['resume'],
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_RESUME_PICKER_SESSION_ID: 'picker-session'
        },
        stderr,
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');
      const logText = await readFile(logPath, 'utf8');
      expect(logText).toContain('"args":["--no-daemon","resume","--no-alt-screen"]');
      expect(logText).toContain('"args":["resume","--no-alt-screen","--no-daemon","picker-session","Continue"]');
      await expect(loadState(appHome)).resolves.toMatchObject({
        lastSessionId: 'picker-session'
      });
      expect(stderr.read()?.toString() ?? '').not.toContain('Unable to safely resume bound session');
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('binds resume --last to the latest session in the current workspace even when no new session record is created', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex-resume-last.log');
    const stderr = new PassThrough();

    try {
      await seedCodexHome(codexHome);
      await seedExistingSession(codexHome, {
        id: 'resume-workspace-session',
        updatedAt: '2026-04-17T18:00:00.000Z'
      });
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        extraArgs: ['resume', '--last'],
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SKIP_SESSION_ARTIFACTS_ON_RESUME: '1'
        },
        stderr,
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');
      const logText = await readFile(logPath, 'utf8');
      expect(logText).toContain('"args":["--no-daemon","resume","--last","--no-alt-screen"]');
      expect(logText).toContain('"args":["resume","--no-alt-screen","--no-daemon","resume-workspace-session","Continue"]');
      await expect(loadState(appHome)).resolves.toMatchObject({
        lastSessionId: 'resume-workspace-session'
      });
      expect(stderr.read()?.toString() ?? '').not.toContain('Unable to safely resume bound session');
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('switches accounts when codex emits the current upgrade quota prompt', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SESSION_ID: 'session-upgrade-prompt',
          FAKE_CODEX_QUOTA_MESSAGE_VARIANT: 'upgrade',
          FAKE_CODEX_PRIMARY_RETRY_AT: '6:42 PM'
        },
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');

      const logText = await readFile(logPath, 'utf8');
      expect(logText).toContain('"args":["resume","--no-alt-screen","--no-daemon","session-upgrade-prompt","Continue"]');
      await expect(loadState(appHome)).resolves.toMatchObject({
        lastSessionId: 'session-upgrade-prompt',
        retryAvailabilityByAccount: {
          a: {
            displayText: '6:42 PM'
          }
        }
      });
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('starts from the requested account override', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        preferredAccountName: 'b',
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath
        },
        interactive: false
      });

      expect(result.switchCount).toBe(0);
      expect(result.finalAccount).toBe('b');

      const records = (await readFile(logPath, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { authText: string });
      expect(records[0]?.authText).toContain('"account": "b"');
      expect(records[0]?.authText).not.toContain('"account": "a"');
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('switches accounts when the quota prompt appears before the process exits', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_WAIT_ON_QUOTA: '1',
          FAKE_CODEX_SESSION_ID: 'session-456'
        },
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');

      const logText = await readFile(logPath, 'utf8');
      expect(logText).toContain('"args":["resume","--no-alt-screen","--no-daemon","session-456","Continue"]');
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('reads session id from runtime session files when session_index is missing', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    try {
      await mkdir(path.join(codexHome, 'sessions'), { recursive: true });
      await writeFile(path.join(codexHome, 'config.toml'), 'model = "gpt-5.4-mini"\n', 'utf8');
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SESSION_ID: 'session-from-file',
          FAKE_CODEX_SKIP_SESSION_INDEX: '1'
        },
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');

      const logText = await readFile(logPath, 'utf8');
      expect(logText).toContain('"args":["resume","--no-alt-screen","--no-daemon","session-from-file","Continue"]');
      await expect(loadState(appHome)).resolves.toMatchObject({
        lastSessionId: 'session-from-file'
      });
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('keeps the current run bound to its own session when a competing same-workspace session writes a newer record', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SESSION_ID: 'session-owned',
          FAKE_CODEX_COMPETING_SESSION_ID: 'session-competing',
          FAKE_CODEX_COMPETING_SESSION_CWD: process.cwd()
        },
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');

      const logText = await readFile(logPath, 'utf8');
      expect(logText).toContain('"args":["resume","--no-alt-screen","--no-daemon","session-owned","Continue"]');
      expect(logText).not.toContain('"args":["resume","--no-alt-screen","--no-daemon","session-competing","Continue"]');
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('keeps the current run bound to its own session when a competing cross-workspace session writes a newer record', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SESSION_ID: 'session-project-a',
          FAKE_CODEX_COMPETING_SESSION_ID: 'session-project-b',
          FAKE_CODEX_COMPETING_SESSION_CWD: '/tmp/another-project'
        },
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');

      const logText = await readFile(logPath, 'utf8');
      expect(logText).toContain('"args":["resume","--no-alt-screen","--no-daemon","session-project-a","Continue"]');
      expect(logText).not.toContain('"args":["resume","--no-alt-screen","--no-daemon","session-project-b","Continue"]');
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('ignores historical quota text that appears before the latest prompt on first launch', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['plus'],
        currentIndex: 0,
        preferredAccountName: 'plus',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'plus', { account: 'plus', token: 'plus-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_REPLAY_OLD_QUOTA_BEFORE_PROMPT: '1',
          FAKE_CODEX_OLD_RETRY_AT: '4:06 PM'
        },
        interactive: false
      });

      expect(result.switchCount).toBe(0);
      expect(result.finalAccount).toBe('plus');
      expect(result.exhaustedAll).toBe(false);
      await expect(loadState(appHome)).resolves.toMatchObject({
        currentIndex: 0,
        lastSuccessfulAccount: 'plus',
        retryAvailabilityByAccount: {}
      });
      await expect(readFile(logPath, 'utf8')).resolves.not.toContain('"args":["resume"');
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('ignores historical quota text that appears before the latest prompt on resume', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SESSION_ID: 'session-history',
          FAKE_CODEX_RESUME_REPLAYS_OLD_QUOTA: '1'
        },
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');
      expect(result.exhaustedAll).toBe(false);

      const logText = await readFile(logPath, 'utf8');
      expect(logText).toContain('"args":["resume","--no-alt-screen","--no-daemon","session-history","Continue"]');
      await expect(loadState(appHome)).resolves.toMatchObject({
        currentIndex: 1,
        lastSuccessfulAccount: 'b'
      });
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('does not treat a stale replayed prompt plus delayed old quota text as a fresh resume quota', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SESSION_ID: 'session-live-prompt',
          FAKE_CODEX_PRIMARY_RETRY_AT: '7:37 PM',
          FAKE_CODEX_RESUME_REPLAYS_STALE_QUOTA_BEFORE_LIVE_PROMPT: '1',
          FAKE_CODEX_OLD_RETRY_AT: '7:37 PM',
          FAKE_CODEX_REPLAY_OLD_QUOTA_DELAY_MS: '500',
          FAKE_CODEX_LIVE_PROMPT_DELAY_MS: '1800'
        },
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');
      expect(result.exhaustedAll).toBe(false);
      expect(result.exitCode).toBe(0);
      await expect(loadState(appHome)).resolves.toMatchObject({
        currentIndex: 1,
        lastSuccessfulAccount: 'b',
        retryAvailabilityByAccount: {
          a: {
            displayText: '7:37 PM'
          }
        }
      });
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('interactive cursor redraw finishes replay before quota rotation', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SESSION_ID: 'session-live-prompt',
          FAKE_CODEX_PRIMARY_RETRY_AT: '7:37 PM',
          FAKE_CODEX_RESUME_CURSOR_REPLAY: '1',
          FAKE_CODEX_OLD_RETRY_AT: '7:37 PM',
          FAKE_CODEX_REPLAY_OLD_QUOTA_DELAY_MS: '500',
          FAKE_CODEX_LIVE_PROMPT_DELAY_MS: '1800'
        },
        stdin: new TtyInputStream() as TtyInputStream & NodeJS.ReadStream,
        stdout: new TtyCaptureStream(),
        stderr: new TtyCaptureStream(),
        interactive: true
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');
      expect(result.exhaustedAll).toBe(false);
      expect(result.exitCode).toBe(0);
      await expect(loadState(appHome)).resolves.toMatchObject({
        currentIndex: 1,
        lastSuccessfulAccount: 'b',
        retryAvailabilityByAccount: {
          a: {
            displayText: '7:37 PM'
          }
        }
      });
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('records retry time from the latest quota prompt instead of replayed historical output on resume', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SESSION_ID: 'session-retry-current',
          FAKE_CODEX_PRIMARY_RETRY_AT: '7:37 PM',
          FAKE_CODEX_REPLAY_OLD_QUOTA_BEFORE_PROMPT: '1',
          FAKE_CODEX_OLD_RETRY_AT: '7:37 PM',
          FAKE_CODEX_EMIT_QUOTA_AFTER_PROMPT: '1',
          FAKE_CODEX_CURRENT_RETRY_AT: '4:06 PM'
        },
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');
      expect(result.exhaustedAll).toBe(true);
      await expect(loadState(appHome)).resolves.toMatchObject({
        retryAvailabilityByAccount: {
          a: {
            displayText: '7:37 PM'
          },
          b: {
            displayText: '4:06 PM'
          }
        }
      });
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('fails safely instead of falling back to resume --last when the bound session id cannot be resumed', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    const stderr = new PassThrough();
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SESSION_ID: 'missing-session',
          FAKE_CODEX_FAIL_SESSION_ID: '1'
        },
        stderr,
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');
      expect(result.exitCode).not.toBe(0);

      const logText = await readFile(logPath, 'utf8');
      expect(logText).toContain('"args":["resume","--no-alt-screen","--no-daemon","missing-session","Continue"]');
      expect(logText).not.toContain('"args":["--no-daemon","resume","--last","--no-alt-screen"]');
      expect(stderr.read()?.toString() ?? '').toContain('Unable to safely resume bound session');
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('interactive mode defaults to a non-script transport', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const helperHome = await createTempAppHome('shell-helper-');
    const shellLogPath = path.join(helperHome, 'shell.log');
    const fakeShellPath = path.join(helperHome, 'fake-shell.mjs');
    const stdout = new TtyCaptureStream();
    const stderr = new TtyCaptureStream();
    const stdin = new TtyInputStream() as TtyInputStream & NodeJS.ReadStream;

    try {
      await writeFile(
        fakeShellPath,
        `#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const parent = execFileSync('ps', ['-o', 'comm=', '-p', String(process.ppid)], { encoding: 'utf8' }).trim();
writeFileSync(${JSON.stringify(shellLogPath)}, \`\${parent}|\${process.argv.slice(2).join(' ')}\\n\`, 'utf8');
process.exit(0);
`,
        'utf8'
      );
      await chmod(fakeShellPath, 0o755);
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['b'],
        currentIndex: 0,
        preferredAccountName: 'b',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: 'codex',
        env: {
          ...process.env,
          SHELL: fakeShellPath
        },
        stdin,
        stdout,
        stderr,
        interactive: true
      });

      expect(result.exitCode).toBe(0);
      await expect(readFile(shellLogPath, 'utf8')).resolves.toMatch(/^node.*\|-lc codex '--no-daemon' '--no-alt-screen'/);
      expect(stdin.rawModeCalls).toEqual([true, false]);
    } finally {
      stdin.end();
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
      await cleanupTempDir(helperHome);
    }
  });

  test('interactive mode still rotates accounts after a quota error', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex-interactive.log');
    const stdout = new TtyCaptureStream();
    const stderr = new TtyCaptureStream();
    const stdin = new TtyInputStream() as TtyInputStream & NodeJS.ReadStream;

    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SESSION_ID: 'interactive-session'
        },
        stdin,
        stdout,
        stderr,
        interactive: true
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');
      expect(stdin.rawModeCalls).toEqual([true, false, true, false]);
      await expect(readFile(logPath, 'utf8')).resolves.toContain(
        '"args":["resume","--no-alt-screen","--no-daemon","interactive-session","Continue"]'
      );
      await expect(loadState(appHome)).resolves.toMatchObject({
        currentIndex: 1,
        preferredAccountName: 'a',
        lastSuccessfulAccount: 'b',
        retryAvailabilityByAccount: {
          a: {
            displayText: '11:10 PM'
          }
        }
      });
    } finally {
      stdin.end();
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('interactive mode waits briefly for the bound session id to be persisted before rotating', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex-interactive.log');
    const stdout = new TtyCaptureStream();
    const stderr = new TtyCaptureStream();
    const stdin = new TtyInputStream() as TtyInputStream & NodeJS.ReadStream;

    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SESSION_ID: 'interactive-delayed-session',
          FAKE_CODEX_DELAY_SESSION_WRITE_MS: '150',
          FAKE_CODEX_WAIT_ON_QUOTA: '1'
        },
        stdin,
        stdout,
        stderr,
        interactive: true
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');
      await expect(readFile(logPath, 'utf8')).resolves.toContain(
        '"args":["resume","--no-alt-screen","--no-daemon","interactive-delayed-session","Continue"]'
      );
      await expect(loadState(appHome)).resolves.toMatchObject({
        lastSessionId: 'interactive-delayed-session'
      });
    } finally {
      stdin.end();
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  }, 10000);

  test('non-interactive mode waits briefly for the bound session id to be persisted before rotating', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex-non-interactive.log');
    const stderr = new PassThrough();

    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath,
          FAKE_CODEX_SESSION_ID: 'non-interactive-delayed-session',
          FAKE_CODEX_DELAY_SESSION_WRITE_MS: '200',
          FAKE_CODEX_WAIT_ON_QUOTA: '1'
        },
        stderr,
        interactive: false
      });

      expect(result.switchCount).toBe(1);
      expect(result.finalAccount).toBe('b');
      await expect(readFile(logPath, 'utf8')).resolves.toContain(
        '"args":["resume","--no-alt-screen","--no-daemon","non-interactive-delayed-session","Continue"]'
      );
      await expect(loadState(appHome)).resolves.toMatchObject({
        lastSessionId: 'non-interactive-delayed-session'
      });
      expect(stderr.read()?.toString() ?? '').not.toContain('Unable to safely resume bound session');
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('interactive mode restores terminal modes before returning control after a forced quota stop', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const stdout = new TtyCaptureStream();
    const stderr = new TtyCaptureStream();
    const stdin = new TtyInputStream() as TtyInputStream & NodeJS.ReadStream;

    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_ENABLE_TTY_MODES: '1',
          FAKE_CODEX_ENABLE_CSI_U_MODE: '1',
          FAKE_CODEX_WAIT_ON_QUOTA: '1'
        },
        stdin,
        stdout,
        stderr,
        interactive: true
      });

      expect(result.exhaustedAll).toBe(true);
      expect(stdout.text()).toContain('\u001b[?2004l');
      expect(stdout.text()).toContain('\u001b[>4;0m');
      expect(stdout.text()).toContain('\u001b[?1l');
      expect(stdout.text()).toContain('\u001b[<u');
    } finally {
      stdin.end();
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  }, 10000);

  test('interactive mode treats Ctrl-C during a quota prompt as a user interrupt instead of exhausting accounts', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const stdout = new TtyCaptureStream();
    const stderr = new TtyCaptureStream();
    const stdin = new TtyInputStream() as TtyInputStream & NodeJS.ReadStream;

    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a'],
        currentIndex: 0,
        preferredAccountName: 'a',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });

      setTimeout(() => {
        stdin.write('\u0003');
      }, 100);

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_ENABLE_TTY_MODES: '1',
          FAKE_CODEX_WAIT_ON_QUOTA: '1'
        },
        stdin,
        stdout,
        stderr,
        interactive: true
      });

      expect(result.exhaustedAll).toBe(false);
      expect(stderr.text()).not.toContain('All configured accounts are exhausted');
      expect(stderr.text()).not.toContain('and resuming');
      expect(stdout.text()).toContain('\u001b[?2004l');
      expect(stdout.text()).toContain('\u001b[>4;0m');
    } finally {
      stdin.end();
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('starts from preferredAccountName when no per-run override is given', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['a', 'b'],
        currentIndex: 0,
        preferredAccountName: 'b',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'a', { account: 'a', token: 'a-token' });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath
        },
        interactive: false
      });

      expect(result.switchCount).toBe(0);
      expect(result.finalAccount).toBe('b');

      const records = (await readFile(logPath, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { authText: string });
      expect(records[0]?.authText).toContain('"account": "b"');
      expect(records[0]?.authText).not.toContain('"account": "a"');
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('successful runs clear stale retry availability for the account', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome('codex-home-');
    const logPath = path.join(appHome, 'fake-codex.log');
    try {
      await seedCodexHome(codexHome);
      await seedState(appHome, {
        version: 1,
        accounts: ['b'],
        currentIndex: 0,
        preferredAccountName: 'b',
        lastSuccessfulAccount: null,
        lastSessionId: null,
        retryAvailabilityByAccount: {
          b: {
            displayText: '11:10 PM',
            availableAt: '2099-04-18T23:10:00.000Z'
          }
        },
        updatedAt: '2026-04-17T00:00:00.000Z'
      });
      await seedAccount(appHome, 'b', { account: 'b', token: 'b-token' });

      const result = await runManagedSession({
        appHome,
        codexHome,
        workspaceDir: process.cwd(),
        codexCommand: `node ${path.resolve(process.cwd(), 'tests/fixtures/fake-codex.mjs')}`,
        env: {
          ...process.env,
          FAKE_CODEX_LOG: logPath
        },
        interactive: false
      });

      expect(result.exitCode).toBe(0);
      await expect(loadState(appHome)).resolves.toMatchObject({
        retryAvailabilityByAccount: {}
      });
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });
});
