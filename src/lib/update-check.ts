import type { Writable } from 'node:stream';
import { constants } from 'node:fs';
import { open, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { writeJsonAtomic } from './fs.js';
import { updateCheckPath } from './paths.js';

const updateCacheTtlMs = 24 * 60 * 60 * 1000;
const registryTimeoutMs = 2500;
const stableVersion = /^\d+\.\d+\.\d+$/;
const updateCheckCacheSchema = z.object({
  checkedAt: z.string(),
  latestVersion: z.string().nullable().default(null)
});

export type ExitUpdateCheckOptions = {
  appHome: string;
  packageName: string;
  currentVersion: string;
  stderr: Writable & { isTTY?: boolean };
  env?: NodeJS.ProcessEnv;
  now?: Date;
  fetchLatestVersion?: (packageName: string, signal: AbortSignal) => Promise<string | null>;
};

function isNewer(latest: string, current: string): boolean {
  const currentBase = current.replace(/^v/, '').split(/[+-]/)[0]!;
  if (!stableVersion.test(latest) || !stableVersion.test(currentBase)) return false;
  const left = latest.split('.').map(Number);
  const right = currentBase.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index]! > right[index]!;
  }
  return false;
}

async function fetchLatestVersionFromNpm(packageName: string, signal: AbortSignal): Promise<string | null> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
    signal, redirect: 'error', headers: { accept: 'application/json' }
  });
  if (!response.ok) return null;
  const body = await response.json() as { version?: unknown };
  return typeof body.version === 'string' ? body.version : null;
}

/** Call only after a managed interactive session has finished and restored its terminal. */
export async function maybeNotifyUpdateOnExit(options: ExitUpdateCheckOptions): Promise<void> {
  const env = options.env ?? process.env;
  if (!options.stderr.isTTY || env.CODEX_AUTO_UPDATE_CHECK === '0' || env.CODEX_AUTO_NO_UPDATE_CHECK === '1') return;

  // Update metadata is best-effort: registry/cache/output errors cannot change a session's exit status.
  try {
    const now = options.now ?? new Date();
    let checkedAt: number = NaN;
    const cache = await open(updateCheckPath(options.appHome), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => null);
    if (cache) {
      try {
        const info = await cache.stat();
        if (info.isFile() && info.size <= 4096) {
          const buffer = Buffer.alloc(4096);
          const { bytesRead } = await cache.read(buffer, 0, buffer.length, 0);
          checkedAt = Date.parse(updateCheckCacheSchema.parse(JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'))).checkedAt);
        }
      } catch { /* Invalid cache is not a reason to block a session. */ }
      finally { await cache.close(); }
    }
    const age = now.getTime() - checkedAt;
    if (Number.isFinite(age) && age >= 0 && age < updateCacheTtlMs) return;

    // Atomically reserve today's attempt across wrapper processes. The dated
    // reservation also expires after a crash, without breaking another run's lock.
    const day = now.toISOString().slice(0, 10);
    const lockPrefix = `${path.basename(updateCheckPath(options.appHome))}.check-`;
    const reservation = await open(path.join(options.appHome, `${lockPrefix}${day}`), 'wx', 0o600).catch(() => null);
    if (!reservation) return;
    await reservation.close();
    for (const entry of await readdir(options.appHome)) {
      const date = entry.slice(lockPrefix.length);
      if (entry.startsWith(lockPrefix) && /^\d{4}-\d{2}-\d{2}$/.test(date) && date < day) {
        await unlink(path.join(options.appHome, entry)).catch(() => {});
      }
    }
    // Persist the attempt before fetching, including offline failures, to avoid
    // repeating requests after every session. Cache contains no account data.
    await writeJsonAtomic(updateCheckPath(options.appHome), { checkedAt: now.toISOString(), latestVersion: null });
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    let latest: string | null;
    try {
      latest = await Promise.race([
        (options.fetchLatestVersion ?? fetchLatestVersionFromNpm)(options.packageName, controller.signal),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => { controller.abort(); resolve(null); }, registryTimeoutMs);
        })
      ]);
    } finally { if (timer) clearTimeout(timer); }
    if (!latest || !stableVersion.test(latest)) return;
    await writeJsonAtomic(updateCheckPath(options.appHome), { checkedAt: now.toISOString(), latestVersion: latest });
    if (isNewer(latest, options.currentVersion)) {
      options.stderr.write(`\n[${options.packageName}] Update available: ${options.currentVersion} -> ${latest}\n`
        + `[${options.packageName}] Update manually: npm install -g ${options.packageName}@latest\n`);
    }
  } catch { /* Silent failure; never prompt, install, or expose raw registry errors. */ }
}
