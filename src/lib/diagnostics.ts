import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, opendir, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readBuildInfo } from './build-info.js';
import { logsRoot, runsRoot } from './paths.js';

const require = createRequire(import.meta.url);
const limits = { directoryEntries: 512, filesPerKind: 20, bytesPerFile: 64 * 1024, events: 100 };
const knownEvents = new Set(['launch', 'quota_switch', 'all_exhausted', 'interrupt', 'exit', 'recovery_failed', 'abnormal_exit', 'invocation_end']);
const knownStatuses = new Set(['running', 'exited', 'failed', 'recovery_failed']);
const incidentName = /^incident-(\d{13})-[a-f0-9-]{36}\.json$/i;
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function version(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 64 && /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/.test(value)
    ? value : null;
}

function dependencyVersion(name: string): string | null {
  try {
    return version((require(`${name}/package.json`) as JsonObject).version);
  } catch {
    return null;
  }
}

function aliaser(prefix: string): (value: unknown) => string | null {
  const aliases = new Map<string, string>();
  return (value) => {
    if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return null;
    if (!aliases.has(value)) aliases.set(value, `${prefix}-${aliases.size + 1}`);
    return aliases.get(value)!;
  };
}

function policy(value: unknown): JsonObject | null {
  const source = object(value);
  if (!source) return null;
  const result: JsonObject = {};
  for (const key of ['noDaemon', 'hasProfile', 'hasModelOverride', 'remote']) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  if (['read-only', 'workspace-write', 'danger-full-access', 'default', 'overridden'].includes(source.sandbox as string)) {
    result.sandbox = source.sandbox;
  }
  if (['on-request', 'never', 'default', 'overridden'].includes(source.approval as string)) result.approval = source.approval;
  const overrides = integer(source.configOverrides, 0, 10000);
  if (overrides !== null) result.configOverrides = overrides;
  return result;
}

async function recentFiles(directory: string, matches: RegExp): Promise<{ paths: string[]; capped: boolean; available: boolean }> {
  const names: string[] = [];
  let scanned = 0;
  try {
    const handle = await opendir(directory);
    for await (const entry of handle) {
      scanned += 1;
      if (entry.isFile() && matches.test(entry.name)) names.push(entry.name);
      if (scanned >= limits.directoryEntries) break;
    }
    names.sort().reverse();
    return {
      paths: names.slice(0, limits.filesPerKind).map((name) => path.join(directory, name)),
      capped: scanned >= limits.directoryEntries || names.length > limits.filesPerKind,
      available: true
    };
  } catch {
    return { paths: [], capped: false, available: false };
  }
}

async function boundedText(filePath: string, tail: boolean): Promise<{ text: string; capped: boolean } | null> {
  let handle;
  try {
    // Do not follow a replaced symlink or block on a FIFO during collection.
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile()) return null;
    const capped = info.size > limits.bytesPerFile;
    if (capped && !tail) return null;
    const start = tail ? Math.max(0, info.size - limits.bytesPerFile) : 0;
    const buffer = Buffer.alloc(Math.min(info.size, limits.bytesPerFile));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    let text = buffer.subarray(0, bytesRead).toString('utf8');
    if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    return { text, capped };
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function buildHash(): Promise<string | null> {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
  const hash = createHash('sha256');
  for (const name of [`../cli.${extension}`, `./session.${extension}`, `./logger.${extension}`, `./diagnostics.${extension}`]) {
    const contents = await boundedText(fileURLToPath(new URL(name, import.meta.url)), false);
    if (!contents) return null;
    hash.update(name).update('\0').update(contents.text).update('\0');
  }
  return hash.digest('hex');
}

/** Collect only shareable metadata. Never read auth, config, state, or transcripts. */
export async function collectDiagnostics(options: { appHome: string; packageVersion: string; env?: NodeJS.ProcessEnv }): Promise<JsonObject> {
  await pruneIncidentDiagnostics(options.appHome, { env: options.env });
  const accountAlias = aliaser('account');
  const runAlias = aliaser('run');
  const events: JsonObject[] = [];
  const runs: JsonObject[] = [];
  const logFiles = await recentFiles(logsRoot(options.appHome), /^session-\d{1,20}\.log$/);
  const runFiles = await recentFiles(runsRoot(options.appHome), /^\d{1,20}-\d{1,10}-[a-f0-9-]{36}\.json$/i);
  const incidentFiles = await listIncidents(options.appHome);
  let skippedRecords = 0;
  let skippedFiles = 0;
  let capped = logFiles.capped || runFiles.capped;

  for (const filePath of runFiles.paths) {
    const contents = await boundedText(filePath, false);
    if (!contents) { skippedFiles += 1; continue; }
    try {
      const source = object(JSON.parse(contents.text));
      if (!source || !knownStatuses.has(source.status as string)) { skippedRecords += 1; continue; }
      const record: JsonObject = {
        run: runAlias(source.runId),
        status: source.status,
        startedAt: timestamp(source.startedAt),
        updatedAt: timestamp(source.updatedAt),
        account: accountAlias(source.currentAccount),
        sessionBound: typeof source.currentSessionId === 'string' && source.currentSessionId.length > 0
      };
      if (typeof source.sessionBindingLost === 'boolean') record.sessionBindingLost = source.sessionBindingLost;
      runs.push(record);
    } catch { skippedRecords += 1; }
  }

  for (const filePath of logFiles.paths) {
    const contents = await boundedText(filePath, true);
    if (!contents) { skippedFiles += 1; continue; }
    capped ||= contents.capped;
    for (const line of contents.text.split('\n').reverse()) {
      if (!line.trim()) continue;
      if (events.length >= limits.events) { capped = true; break; }
      try {
        const source = object(JSON.parse(line));
        if (!source || !knownEvents.has(source.event as string)) { skippedRecords += 1; continue; }
        const event: JsonObject = { time: timestamp(source.time), event: source.event };
        for (const key of ['resume', 'sessionBound', 'quotaDetected', 'missingSessionError', 'interrupted']) {
          if (typeof source[key] === 'boolean') event[key] = source[key];
        }
        for (const key of ['account', 'from', 'to', 'finalAccount']) {
          const alias = accountAlias(source[key]);
          if (alias !== null) event[key] = alias;
        }
        const run = runAlias(source.instanceId);
        if (run !== null) event.run = run;
        for (const key of ['exitCode', 'switchCount', 'outputCharacters']) {
          const number = integer(source[key], key === 'exitCode' ? -255 : 0, key === 'exitCode' ? 255 : 10000);
          if (number !== null) event[key] = number;
        }
        if (Array.isArray(source.exhausted)) event.exhaustedCount = Math.min(source.exhausted.length, 10000);
        const launchPolicy = policy(source.policy);
        if (launchPolicy) event.policy = launchPolicy;
        events.push(event);
      } catch { skippedRecords += 1; }
    }
    if (events.length >= limits.events) break;
  }
  events.sort((a, b) => String(a.time ?? '').localeCompare(String(b.time ?? '')));
  runs.sort((a, b) => String(a.updatedAt ?? '').localeCompare(String(b.updatedAt ?? '')));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    versions: {
      codexAuto: version(options.packageVersion),
      node: process.versions.node,
      nodePty: dependencyVersion('node-pty'),
      platform: process.platform,
      architecture: process.arch
    },
    build: readBuildInfo(),
    wrapperBuildHash: await buildHash(),
    privacy: 'Account and run identifiers are aliases. Credentials, config, paths, prompts, environment, session IDs, and terminal transcripts are omitted.',
    collection: { limits, capped, skippedRecords, skippedFiles, logsAvailable: logFiles.available, runsAvailable: runFiles.available },
    incidents: {
      retentionDays: retentionDays(options.env),
      maxUnpinnedReports: limits.filesPerKind,
      retainedCount: incidentFiles.items.length,
      pinnedCount: incidentFiles.items.filter((item) => item.pinned).length,
      countCapped: incidentFiles.capped,
      latestAt: incidentFiles.items[0]?.createdAt ?? null,
      reports: [...incidentFiles.items.filter((item) => item.pinned), ...incidentFiles.items.filter((item) => !item.pinned)]
        .slice(0, limits.filesPerKind).map(({ name, createdAt, pinned }) => ({ report: name, createdAt, pinned }))
    },
    runs,
    events
  };
}

export type IncidentReason = 'quota_switch' | 'all_exhausted' | 'recovery_failed' | 'abnormal_exit';

function retentionDays(env: NodeJS.ProcessEnv = process.env): number {
  const value = env.CODEX_AUTO_DIAGNOSTICS_RETENTION_DAYS ?? '30';
  const days = /^\d{1,5}$/.test(value) ? Number(value) : 0;
  return days >= 1 && days <= 36500 ? days : 30;
}

async function ownedRegular(filePath: string): Promise<boolean> {
  const info = await lstat(filePath).catch(() => null);
  return Boolean(info?.isFile() && (typeof process.getuid !== 'function' || info.uid === process.getuid()));
}

async function listIncidents(appHome: string): Promise<{
  items: { name: string; createdAt: string; pinned: boolean }[]; capped: boolean;
}> {
  const directory = path.join(appHome, 'diagnostics');
  const info = await lstat(directory).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink() || (typeof process.getuid === 'function' && info.uid !== process.getuid())) {
    return { items: [], capped: false };
  }
  const items: { name: string; createdAt: string; pinned: boolean }[] = [];
  let scanned = 0;
  try {
    const handle = await opendir(directory);
    for await (const entry of handle) {
      const match = entry.name.match(incidentName);
      if (entry.isFile() && match && await ownedRegular(path.join(directory, entry.name))) {
        items.push({
          name: entry.name,
          createdAt: new Date(Number(match[1])).toISOString(),
          pinned: await ownedRegular(path.join(directory, `${entry.name}.keep`))
        });
      }
      if (++scanned >= limits.directoryEntries) break;
    }
  } catch { return { items: [], capped: false }; }
  items.sort((a, b) => b.name.localeCompare(a.name));
  return { items, capped: scanned >= limits.directoryEntries };
}

export async function pruneIncidentDiagnostics(appHome: string, options: { env?: NodeJS.ProcessEnv } = {}): Promise<void> {
  const directory = path.join(appHome, 'diagnostics');
  const { items } = await listIncidents(appHome);
  const cutoff = Date.now() - retentionDays(options.env) * 24 * 60 * 60 * 1000;
  let retained = 0;
  for (const item of items) {
    if (item.pinned) continue;
    const keep = Date.parse(item.createdAt) >= cutoff && retained < limits.filesPerKind;
    if (keep) { retained += 1; continue; }
    const candidate = path.join(directory, item.name);
    // Recheck pin and ownership immediately before removing an owned report.
    if (!await ownedRegular(`${candidate}.keep`) && await ownedRegular(candidate)) {
      await unlink(candidate).catch(() => undefined);
    }
  }
}

export async function setIncidentKeep(appHome: string, target: string, keep: boolean): Promise<string> {
  if (target !== 'latest' && !incidentName.test(target)) throw new Error('Use latest or an incident report basename');
  const { items } = await listIncidents(appHome);
  const item = target === 'latest' ? items[0] : items.find((entry) => entry.name === target);
  if (!item) throw new Error('Incident report not found');
  const marker = path.join(appHome, 'diagnostics', `${item.name}.keep`);
  if (keep) {
    if (!await ownedRegular(marker)) await writeFile(marker, '', { mode: 0o600, flag: 'wx' });
    else await chmod(marker, 0o600);
  } else if (await ownedRegular(marker)) {
    await unlink(marker);
  }
  return item.name;
}

/** Save the same allowlisted report automatically; callers handle errors best-effort. */
export async function writeIncidentDiagnostics(appHome: string, reason: IncidentReason, options: { env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  if (!['quota_switch', 'all_exhausted', 'recovery_failed', 'abnormal_exit'].includes(reason)) {
    throw new Error('Unsupported diagnostic incident reason');
  }
  const directory = path.join(appHome, 'diagnostics');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() ||
    (typeof process.getuid === 'function' && directoryInfo.uid !== process.getuid())) {
    throw new Error('Diagnostics directory must be owned by the current user and must not be a symlink');
  }
  await chmod(directory, 0o700);
  const packageVersion = version((require('../../package.json') as JsonObject).version) ?? '0.0.0';
  const report = await collectDiagnostics({ appHome, packageVersion, env: options.env });
  const filePath = path.join(directory, `incident-${Date.now()}-${randomUUID()}.json`);
  await writeFile(filePath, JSON.stringify({ ...report, reason, createdAt: new Date().toISOString() }, null, 2) + '\n', {
    encoding: 'utf8', mode: 0o600, flag: 'wx'
  });

  await pruneIncidentDiagnostics(appHome, options);
  return filePath;
}
