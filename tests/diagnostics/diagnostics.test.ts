import path from 'node:path';
import { mkdir, readFile, readdir, stat, symlink, writeFile } from 'node:fs/promises';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, test, vi } from 'vitest';
import { collectDiagnostics, pruneIncidentDiagnostics, setIncidentKeep, writeIncidentDiagnostics } from '../../src/lib/diagnostics.js';
import { runCli } from '../../src/cli.js';
import { cleanupTempDir, createTempAppHome } from '../helpers/temp.js';

const uuid = '11111111-1111-4111-8111-111111111111';
const time = '2026-10-08T19:00:00.000Z';

class CaptureStream extends Writable {
  isTTY = true;
  private chunks: string[] = [];
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: () => void): void {
    this.chunks.push(chunk.toString());
    callback();
  }
  text(): string { return this.chunks.join(''); }
}

async function seedSensitiveRecords(appHome: string): Promise<void> {
  await mkdir(path.join(appHome, 'logs'), { recursive: true });
  await mkdir(path.join(appHome, 'runs'), { recursive: true });
  await writeFile(path.join(appHome, 'logs', 'session-1791486000000.log'), [
    JSON.stringify({
      time, event: 'launch', account: 'SECRET-ACCOUNT', instanceId: 'SECRET-RUN', sessionId: 'SECRET-SESSION',
      resume: true, sessionBound: true, args: ['SECRET-PROMPT'], auth: { token: 'SECRET-TOKEN' },
      cwd: '/SECRET-WORKSPACE', env: { API_KEY: 'SECRET-ENV' },
      policy: {
        noDaemon: true, sandbox: 'read-only', approval: 'on-request', configOverrides: 2,
        hasProfile: true, hasModelOverride: false, remote: false,
        config: 'SECRET-CONFIG', profile: 'SECRET-PROFILE', model: 'SECRET-MODEL'
      }
    }),
    JSON.stringify({ time, event: 'quota_switch', from: 'SECRET-ACCOUNT', to: 'SECRET-OTHER', exhausted: ['SECRET-ACCOUNT'] }),
    JSON.stringify({ time: 'SECRET-TIME', event: 'exit', exitCode: 'SECRET-EXIT', account: 'SECRET-OTHER' }),
    JSON.stringify({ time, event: 'SECRET-EVENT', token: 'SECRET-TOKEN' })
  ].join('\n') + '\n');
  await writeFile(path.join(appHome, 'runs', `1791486000000-123-${uuid}.json`), JSON.stringify({
    version: 1, runId: 'SECRET-RUN', currentAccount: 'SECRET-OTHER', currentSessionId: 'SECRET-SESSION',
    startedAt: time, updatedAt: time, status: 'recovery_failed', sessionBindingLost: true,
    workspaceDir: '/SECRET-WORKSPACE', error: 'SECRET-ERROR', token: 'SECRET-TOKEN'
  }));
}

describe('shareable diagnostics', () => {
  test('keeps rotation, binding, and policy evidence while excluding sensitive and unknown fields', async () => {
    const appHome = await createTempAppHome();
    try {
      await seedSensitiveRecords(appHome);
      const report = await collectDiagnostics({ appHome, packageVersion: '0.2.8' });
      const text = JSON.stringify(report);
      expect(text).not.toContain('SECRET');
      expect(text).not.toContain(appHome);
      expect(report.versions).toMatchObject({ codexAuto: '0.2.8', node: process.versions.node, platform: process.platform });
      expect(report.wrapperBuildHash).toMatch(/^[a-f0-9]{64}$/);
      const events = report.events as Record<string, unknown>[];
      expect(events).toHaveLength(3);
      const launch = events.find((entry) => entry.event === 'launch')!;
      const rotation = events.find((entry) => entry.event === 'quota_switch')!;
      expect(launch).toMatchObject({ time, resume: true, sessionBound: true, run: 'run-1' });
      expect(launch.policy).toEqual({
        noDaemon: true, sandbox: 'read-only', approval: 'on-request', configOverrides: 2,
        hasProfile: true, hasModelOverride: false, remote: false
      });
      expect(rotation).toMatchObject({ from: launch.account, exhaustedCount: 1 });
      expect(report.runs).toEqual([{
        run: 'run-1', status: 'recovery_failed', startedAt: time, updatedAt: time,
        account: rotation.to, sessionBound: true, sessionBindingLost: true
      }]);
      expect(events.find((entry) => entry.event === 'exit')).toMatchObject({ time: null });
      expect(events.find((entry) => entry.event === 'exit')).not.toHaveProperty('exitCode');
    } finally { await cleanupTempDir(appHome); }
  });

  test('caps input/output and skips oversized runs, transcripts, and symlinked files', async () => {
    const appHome = await createTempAppHome();
    try {
      await mkdir(path.join(appHome, 'logs'));
      await mkdir(path.join(appHome, 'runs'));
      const lines = Array.from({ length: 150 }, () => JSON.stringify({ time, event: 'launch', account: 'SECRET-ACCOUNT' }));
      await writeFile(path.join(appHome, 'logs', 'session-1791486000000.log'), 'SECRET-FILL'.repeat(10000) + '\n' + lines.join('\n'));
      await writeFile(path.join(appHome, 'logs', 'typescript-1791486000000.log'), 'SECRET-TRANSCRIPT');
      const target = path.join(appHome, 'sensitive.json');
      await writeFile(target, 'SECRET-SYMLINK-TARGET');
      await symlink(target, path.join(appHome, 'logs', 'session-1791486000001.log'));
      await writeFile(path.join(appHome, 'runs', `1791486000000-123-${uuid}.json`), 'SECRET-LARGE-RUN'.repeat(10000));
      const report = await collectDiagnostics({ appHome, packageVersion: '0.2.8' });
      expect(report.events).toHaveLength(100);
      expect(report.runs).toEqual([]);
      expect(report.collection).toMatchObject({ capped: true, skippedFiles: 1 });
      expect(JSON.stringify(report)).not.toContain('SECRET');
    } finally { await cleanupTempDir(appHome); }
  });

  test('writes private incident reports automatically and retains only the newest twenty owned reports', async () => {
    const appHome = await createTempAppHome();
    try {
      await seedSensitiveRecords(appHome);
      const directory = path.join(appHome, 'diagnostics');
      await mkdir(directory);
      for (let index = 0; index < 25; index += 1) {
        await writeFile(path.join(directory, `incident-${Date.now() - 1000 - index}-${uuid}.json`), '{}');
      }
      await writeFile(path.join(directory, 'keep-user-note.json'), 'keep');
      await symlink(path.join(appHome, 'missing'), path.join(directory, `incident-1000000000099-${uuid}.json`));
      const reportPath = await writeIncidentDiagnostics(appHome, 'quota_switch');
      const report = JSON.parse(await readFile(reportPath, 'utf8'));
      expect(report).toMatchObject({ schemaVersion: 1, reason: 'quota_switch' });
      expect(report.events).toHaveLength(3);
      expect(JSON.stringify(report)).not.toContain('SECRET');
      expect((await stat(reportPath)).mode & 0o777).toBe(0o600);
      expect((await stat(directory)).mode & 0o777).toBe(0o700);
      const entries = await readdir(directory, { withFileTypes: true });
      expect(entries.filter((entry) => entry.isFile() && entry.name.startsWith('incident-'))).toHaveLength(20);
      expect(entries.some((entry) => entry.isSymbolicLink())).toBe(true);
      expect(await readFile(path.join(directory, 'keep-user-note.json'), 'utf8')).toBe('keep');
      expect((await collectDiagnostics({ appHome, packageVersion: '0.2.8' })).incidents).toMatchObject({ retainedCount: 20 });
    } finally { await cleanupTempDir(appHome); }
  });

  test('refuses a symlinked incident directory without modifying its target', async () => {
    const appHome = await createTempAppHome();
    const target = await createTempAppHome();
    try {
      await symlink(target, path.join(appHome, 'diagnostics'));
      await expect(writeIncidentDiagnostics(appHome, 'recovery_failed')).rejects.toThrow('must not be a symlink');
      expect(await readdir(target)).toEqual([]);
    } finally {
      await cleanupTempDir(appHome);
      await cleanupTempDir(target);
    }
  });

  test('retention respects seven/thirty days and preserves pinned reports beyond age and count limits', async () => {
    const appHome = await createTempAppHome();
    const directory = path.join(appHome, 'diagnostics');
    const day = 24 * 60 * 60 * 1000;
    const sevenDays = { CODEX_AUTO_DIAGNOSTICS_RETENTION_DAYS: '7' };
    try {
      await mkdir(directory);
      const eightDaysOld = `incident-${Date.now() - 8 * day}-${uuid}.json`;
      const fortyDaysOld = `incident-${Date.now() - 40 * day}-${uuid}.json`;
      await writeFile(path.join(directory, eightDaysOld), '{}');
      await writeFile(path.join(directory, fortyDaysOld), '{}');
      await setIncidentKeep(appHome, fortyDaysOld, true);
      await pruneIncidentDiagnostics(appHome, { env: { CODEX_AUTO_DIAGNOSTICS_RETENTION_DAYS: '30' } });
      expect(await readdir(directory)).toContain(eightDaysOld);
      await pruneIncidentDiagnostics(appHome, { env: sevenDays });
      expect(await readdir(directory)).not.toContain(eightDaysOld);
      for (let index = 0; index < 25; index += 1) {
        await writeFile(path.join(directory, `incident-${Date.now() - 1000 - index}-${uuid}.json`), '{}');
      }
      await pruneIncidentDiagnostics(appHome, { env: sevenDays });
      const report = await collectDiagnostics({ appHome, packageVersion: '0.2.8', env: sevenDays });
      expect(report.incidents).toMatchObject({ retentionDays: 7, retainedCount: 21 });
      expect(await readdir(directory)).toContain(fortyDaysOld);
      await setIncidentKeep(appHome, fortyDaysOld, false);
      await pruneIncidentDiagnostics(appHome, { env: sevenDays });
      expect(await readdir(directory)).not.toContain(fortyDaysOld);
      expect((await collectDiagnostics({ appHome, packageVersion: '0.2.8', env: {
        CODEX_AUTO_DIAGNOSTICS_RETENTION_DAYS: 'SECRET-INVALID'
      } })).incidents).toMatchObject({ retentionDays: 30 });
    } finally { await cleanupTempDir(appHome); }
  });

  test('pinning rejects paths and does not treat symlink markers as preservation', async () => {
    const appHome = await createTempAppHome();
    try {
      const directory = path.join(appHome, 'diagnostics');
      await mkdir(directory);
      const old = `incident-${Date.now() - 40 * 24 * 60 * 60 * 1000}-${uuid}.json`;
      await writeFile(path.join(directory, old), '{}');
      await symlink(path.join(appHome, 'missing'), path.join(directory, `${old}.keep`));
      await expect(setIncidentKeep(appHome, '../auth.json', true)).rejects.toThrow('basename');
      await expect(setIncidentKeep(appHome, path.join(directory, old), true)).rejects.toThrow('basename');
      await pruneIncidentDiagnostics(appHome);
      expect(await readdir(directory)).not.toContain(old);
      expect(await readdir(directory)).toContain(`${old}.keep`);
    } finally { await cleanupTempDir(appHome); }
  });

  test('diagnostics CLI skips updates, credential bootstrap, and malformed application state', async () => {
    const appHome = await createTempAppHome();
    const codexHome = await createTempAppHome();
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const stdin = new PassThrough() as PassThrough & NodeJS.ReadStream;
    Object.defineProperty(stdin, 'isTTY', { value: true });
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network must not be used'));
    try {
      await writeFile(path.join(appHome, 'state.json'), 'SECRET-MALFORMED-STATE');
      await writeFile(path.join(codexHome, 'auth.json'), 'SECRET-AUTH');
      await writeFile(path.join(codexHome, 'config.toml'), 'SECRET-CONFIG');
      const code = await runCli(['diagnostics'], {
        appHome, codexHome, stdout, stderr, stdin, interactive: true,
        env: { CODEX_AUTO_CODEX_BIN: '/must-not-be-run', SECRET_ENV: 'SECRET-ENV' }
      });
      expect(code).toBe(0);
      expect(fetch).not.toHaveBeenCalled();
      expect(stderr.text()).toBe('');
      expect(JSON.parse(stdout.text())).toMatchObject({ schemaVersion: 1, events: [], runs: [] });
      expect(stdout.text()).not.toContain('SECRET');
      expect(await readdir(path.join(appHome, 'accounts'))).toEqual([]);
      expect(await readFile(path.join(appHome, 'state.json'), 'utf8')).toBe('SECRET-MALFORMED-STATE');
    } finally {
      fetch.mockRestore();
      stdin.end();
      await cleanupTempDir(appHome);
      await cleanupTempDir(codexHome);
    }
  });

  test('diagnostics CLI keeps and releases the latest report without exposing its contents', async () => {
    const appHome = await createTempAppHome();
    try {
      await seedSensitiveRecords(appHome);
      const reportPath = await writeIncidentDiagnostics(appHome, 'all_exhausted');
      const kept = new CaptureStream();
      expect(await runCli(['diagnostics', '--keep', 'latest'], { appHome, stdout: kept, stderr: kept })).toBe(0);
      expect(JSON.parse(kept.text())).toMatchObject({
        investigation: { report: path.basename(reportPath), pinned: true },
        incidents: { retainedCount: 1, pinnedCount: 1 }
      });
      const released = new CaptureStream();
      expect(await runCli(['diagnostics', '--release', path.basename(reportPath)], { appHome, stdout: released, stderr: released })).toBe(0);
      expect(JSON.parse(released.text())).toMatchObject({
        investigation: { report: path.basename(reportPath), pinned: false },
        incidents: { retainedCount: 1, pinnedCount: 0 }
      });
      expect(kept.text() + released.text()).not.toContain('SECRET');
    } finally { await cleanupTempDir(appHome); }
  });
});
