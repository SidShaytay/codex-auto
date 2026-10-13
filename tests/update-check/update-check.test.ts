import { Writable } from 'node:stream';
import { readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { describe, expect, test, vi } from 'vitest';
import { maybeNotifyUpdateOnExit } from '../../src/lib/update-check.js';
import { cleanupTempDir, createTempAppHome, readJson } from '../helpers/temp.js';

class CaptureStream extends Writable {
  chunks: string[] = [];
  isTTY = true;
  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(chunk.toString()); callback();
  }
  toString(): string { return this.chunks.join(''); }
}

const now = new Date('2026-10-13T12:00:00Z');
const base = { packageName: 'example-wrapper', currentVersion: '0.4.0+git.abcdef', env: {}, now };

describe('exit update notice', () => {
  test('notifies without reading input or installing, and checks only once per 24 hours', async () => {
    const appHome = await createTempAppHome(); const stderr = new CaptureStream();
    const fetchLatestVersion = vi.fn(async () => '0.5.0');
    try {
      await maybeNotifyUpdateOnExit({ ...base, appHome, stderr, fetchLatestVersion });
      expect(stderr.toString()).toContain('0.4.0+git.abcdef -> 0.5.0');
      expect(stderr.toString()).toContain('Update manually: npm install -g example-wrapper@latest');
      expect(stderr.toString()).not.toContain('Update now?');
      const output = stderr.toString();
      await maybeNotifyUpdateOnExit({ ...base, now: new Date(now.getTime() + 23 * 3600000), appHome, stderr, fetchLatestVersion });
      expect(fetchLatestVersion).toHaveBeenCalledTimes(1); expect(stderr.toString()).toBe(output);
      await maybeNotifyUpdateOnExit({ ...base, now: new Date(now.getTime() + 24 * 3600000), appHome, stderr, fetchLatestVersion });
      expect(fetchLatestVersion).toHaveBeenCalledTimes(2);
      await expect(readJson(`${appHome}/update-check.json`)).resolves.toMatchObject({ latestVersion: '0.5.0' });
    } finally { await cleanupTempDir(appHome); }
  });

  test.each([{ CODEX_AUTO_UPDATE_CHECK: '0' }, { CODEX_AUTO_NO_UPDATE_CHECK: '1' },
    { CODEX_AUTO_UPDATE_CHECK: '1', CODEX_AUTO_NO_UPDATE_CHECK: '1' }])('respects explicit disable %j', async env => {
    const appHome = await createTempAppHome(); const stderr = new CaptureStream(); const fetchLatestVersion = vi.fn(async () => '99.0.0');
    try {
      await maybeNotifyUpdateOnExit({ ...base, env, appHome, stderr, fetchLatestVersion });
      expect(fetchLatestVersion).not.toHaveBeenCalled(); expect(stderr.toString()).toBe('');
    } finally { await cleanupTempDir(appHome); }
  });

  test('requests only package metadata from the fixed registry without credentials or redirects', async () => {
    const appHome = await createTempAppHome(); const stderr = new CaptureStream();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ version: '0.5.0' })));
    try {
      await maybeNotifyUpdateOnExit({ ...base, appHome, stderr });
      expect(fetchMock).toHaveBeenCalledWith('https://registry.npmjs.org/example-wrapper/latest', {
        signal: expect.any(AbortSignal), redirect: 'error', headers: { accept: 'application/json' }
      });
    } finally { fetchMock.mockRestore(); await cleanupTempDir(appHome); }
  });

  test('does not fetch or write output to a non-terminal stream', async () => {
    const appHome = await createTempAppHome(); const stderr = new CaptureStream(); stderr.isTTY = false;
    const fetchLatestVersion = vi.fn(async () => '99.0.0');
    try {
      await maybeNotifyUpdateOnExit({ ...base, appHome, stderr, fetchLatestVersion });
      expect(fetchLatestVersion).not.toHaveBeenCalled(); expect(stderr.toString()).toBe('');
    } finally { await cleanupTempDir(appHome); }
  });

  test.each([null, '0.3.9', '0.4.0', '0.4.0-beta.1', '99.0.0\u001b[31m', 'not-a-version'])(
    'does not notify for absent, old or untrusted metadata %j', async version => {
      const appHome = await createTempAppHome(); const stderr = new CaptureStream();
      try {
        await maybeNotifyUpdateOnExit({ ...base, appHome, stderr, fetchLatestVersion: async () => version });
        expect(stderr.toString()).toBe('');
      } finally { await cleanupTempDir(appHome); }
    });

  test.each(['{bad', JSON.stringify({ checkedAt: 'not-a-date' }), JSON.stringify({ checkedAt: '2026-10-14T00:00:00Z' })])(
    'recovers from invalid or future-dated cache %s', async cache => {
      const appHome = await createTempAppHome(); const stderr = new CaptureStream(); const fetchLatestVersion = vi.fn(async () => '0.5.0');
      try {
        await writeFile(`${appHome}/update-check.json`, cache);
        await maybeNotifyUpdateOnExit({ ...base, appHome, stderr, fetchLatestVersion });
        expect(fetchLatestVersion).toHaveBeenCalledTimes(1); expect(stderr.toString()).toContain('Update available');
      } finally { await cleanupTempDir(appHome); }
    });

  test('concurrent exits share one daily metadata request', async () => {
    const appHome = await createTempAppHome(); const stderr = new CaptureStream();
    const fetchLatestVersion = vi.fn(async () => '0.5.0');
    try {
      await Promise.all(Array.from({ length: 8 }, () => maybeNotifyUpdateOnExit({ ...base, appHome, stderr, fetchLatestVersion })));
      expect(fetchLatestVersion).toHaveBeenCalledTimes(1);
      expect(stderr.toString().match(/Update available/g)).toHaveLength(1);
    } finally { await cleanupTempDir(appHome); }
  });

  test('a reservation from a crashed check blocks only its day and uses private permissions', async () => {
    const appHome = await createTempAppHome(); const stderr = new CaptureStream(); const fetchLatestVersion = vi.fn(async () => '0.5.0');
    try {
      const reservation = `${appHome}/update-check.json.check-2026-10-13`;
      await writeFile(reservation, '', { mode: 0o600 });
      await maybeNotifyUpdateOnExit({ ...base, appHome, stderr, fetchLatestVersion });
      expect(fetchLatestVersion).not.toHaveBeenCalled();
      await maybeNotifyUpdateOnExit({ ...base, now: new Date('2026-10-14T12:00:00Z'), appHome, stderr, fetchLatestVersion });
      expect(fetchLatestVersion).toHaveBeenCalledTimes(1);
      expect((await stat(`${appHome}/update-check.json.check-2026-10-14`)).mode & 0o777).toBe(0o600);
      expect((await stat(`${appHome}/update-check.json`)).mode & 0o777).toBe(0o600);
      await expect(stat(reservation)).rejects.toThrow();
    } finally { await cleanupTempDir(appHome); }
  });

  test('does not follow a symlink at the cache or reservation boundary', async () => {
    const appHome = await createTempAppHome(); const stderr = new CaptureStream(); const fetchLatestVersion = vi.fn(async () => '0.5.0');
    try {
      const source = `${appHome}/unrelated.json`; await writeFile(source, 'UNCHANGED');
      await symlink(source, `${appHome}/update-check.json`);
      await symlink(source, `${appHome}/update-check.json.check-2026-10-13`);
      await maybeNotifyUpdateOnExit({ ...base, appHome, stderr, fetchLatestVersion });
      expect(fetchLatestVersion).not.toHaveBeenCalled(); expect(await readFile(source, 'utf8')).toBe('UNCHANGED');
      expect(stderr.toString()).toBe('');
    } finally { await cleanupTempDir(appHome); }
  });

  test('offline errors are silent and count as a daily attempt', async () => {
    const appHome = await createTempAppHome(); const stderr = new CaptureStream();
    const fetchLatestVersion = vi.fn(async () => { throw new Error('PRIVATE_PROVIDER_ERROR'); });
    try {
      await maybeNotifyUpdateOnExit({ ...base, appHome, stderr, fetchLatestVersion });
      await maybeNotifyUpdateOnExit({ ...base, appHome, stderr, fetchLatestVersion });
      expect(fetchLatestVersion).toHaveBeenCalledTimes(1); expect(stderr.toString()).toBe('');
      await expect(readJson(`${appHome}/update-check.json`)).resolves.toMatchObject({ checkedAt: now.toISOString(), latestVersion: null });
    } finally { await cleanupTempDir(appHome); }
  });

  test('bounds even a nonresponsive fetch to 2.5 seconds and aborts it', async () => {
    const appHome = await createTempAppHome(); const stderr = new CaptureStream();
    let signal: AbortSignal | undefined;
    try {
      vi.useFakeTimers();
      const pending = maybeNotifyUpdateOnExit({ ...base, appHome, stderr, fetchLatestVersion: async (_name, abort) => {
        signal = abort; return new Promise(() => {});
      } });
      // Let real filesystem operations finish before advancing the registry timer.
      await vi.waitFor(() => expect(signal).toBeDefined());
      await vi.advanceTimersByTimeAsync(2500); await pending;
      expect(signal?.aborted).toBe(true); expect(stderr.toString()).toBe('');
    } finally { vi.useRealTimers(); await cleanupTempDir(appHome); }
  });
});
