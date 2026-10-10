import { Writable, Readable } from 'node:stream';
import { describe, expect, test } from 'vitest';
import { maybePromptForUpdate } from '../../src/lib/update-check.js';
import { cleanupTempDir, createTempAppHome, readJson } from '../helpers/temp.js';

class CaptureStream extends Writable {
  public chunks: string[] = [];
  public isTTY = true;

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(chunk.toString());
    callback();
  }

  toString(): string {
    return this.chunks.join('');
  }
}

function ttyInput(): Readable & { isTTY?: boolean } {
  const input = new Readable({
    read() {}
  }) as Readable & { isTTY?: boolean };
  input.isTTY = true;
  return input;
}

describe('update check', () => {
  test.each([{}, { CODEX_AUTO_UPDATE_CHECK: '0' }, { CODEX_AUTO_UPDATE_CHECK: '1', CODEX_AUTO_NO_UPDATE_CHECK: '1' }])(
    'does not fetch, prompt or install by default or when disabled: %j', async (env) => {
      const appHome = await createTempAppHome();
      const stderr = new CaptureStream();
      const calls: string[] = [];
      try {
        await maybePromptForUpdate({ appHome, packageName: 'codex-auto', currentVersion: '0.3.5', stdin: ttyInput(), stderr, env,
          fetchLatestVersion: async () => { calls.push('fetch'); return '99.0.0'; },
          readAnswer: async () => { calls.push('prompt'); return 'y'; },
          runInstall: async () => { calls.push('install'); return 0; } });
        expect(calls).toEqual([]);
        expect(stderr.toString()).toBe('');
      } finally { await cleanupTempDir(appHome); }
    }
  );

  test('explicit opt-in retains interactive update choices', async () => {
    const appHome = await createTempAppHome();
    const stderr = new CaptureStream();
    let prompted = false;
    try {
      await maybePromptForUpdate({ appHome, packageName: 'codex-auto', currentVersion: '0.3.5', stdin: ttyInput(), stderr,
        env: { CODEX_AUTO_UPDATE_CHECK: '1' }, fetchLatestVersion: async () => '99.0.0',
        readAnswer: async () => { prompted = true; return ''; } });
      expect(prompted).toBe(true);
      expect(stderr.toString()).toContain('Update available');
    } finally { await cleanupTempDir(appHome); }
  });
  test('prompts and runs the installer when a newer version is accepted', async () => {
    const appHome = await createTempAppHome();
    const stderr = new CaptureStream();
    const installed: string[] = [];
    try {
      await maybePromptForUpdate({
        appHome,
        packageName: 'codex-auto',
        currentVersion: '0.2.7',
        stdin: ttyInput(),
        stderr,
        force: true,
        fetchLatestVersion: async () => '0.2.8',
        readAnswer: async () => 'y',
        runInstall: async (packageName) => {
          installed.push(packageName);
          return 0;
        }
      });

      expect(stderr.toString()).toContain('Update available: codex-auto 0.2.7 -> 0.2.8');
      expect(stderr.toString()).toContain('Update finished');
      expect(installed).toEqual(['codex-auto']);
    } finally {
      await cleanupTempDir(appHome);
    }
  });

  test('records a skipped version', async () => {
    const appHome = await createTempAppHome();
    const stderr = new CaptureStream();
    try {
      await maybePromptForUpdate({
        appHome,
        packageName: 'codex-auto',
        currentVersion: '0.2.7',
        stdin: ttyInput(),
        stderr,
        force: true,
        now: new Date('2026-05-02T12:00:00.000Z'),
        fetchLatestVersion: async () => '0.2.8',
        readAnswer: async () => 's'
      });

      expect(stderr.toString()).toContain('Skipping update 0.2.8');
      await expect(readJson(`${appHome}/update-check.json`)).resolves.toMatchObject({
        latestVersion: '0.2.8',
        skippedVersion: '0.2.8'
      });
    } finally {
      await cleanupTempDir(appHome);
    }
  });

  test('does not prompt in non-interactive mode', async () => {
    const appHome = await createTempAppHome();
    const stderr = new CaptureStream();
    stderr.isTTY = false;
    const input = ttyInput();
    input.isTTY = false;
    let fetched = false;
    try {
      await maybePromptForUpdate({
        appHome,
        packageName: 'codex-auto',
        currentVersion: '0.2.7',
        stdin: input,
        stderr,
        fetchLatestVersion: async () => {
          fetched = true;
          return '0.2.8';
        },
        readAnswer: async () => 'y'
      });

      expect(fetched).toBe(false);
      expect(stderr.toString()).toBe('');
    } finally {
      await cleanupTempDir(appHome);
    }
  });
});
