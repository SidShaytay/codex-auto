import { appendFile } from 'node:fs/promises';
import path from 'node:path';
import type { Writable } from 'node:stream';
import { ensureDir } from './fs.js';
import { sanitizeRotationSelection } from './diagnostics.js';
import { logsRoot } from './paths.js';

export type SessionLogger = {
  path: string;
  log: (event: string, details?: Record<string, unknown>) => Promise<void>;
};

export type LaunchPolicySummary = {
  noDaemon: boolean;
  sandbox: 'default' | 'overridden' | 'read-only' | 'workspace-write' | 'danger-full-access';
  approval: 'default' | 'overridden' | 'on-request' | 'never';
  configOverrides: number;
  hasProfile: boolean;
  hasModelOverride: boolean;
  remote: boolean;
};

export type IncidentReason = 'quota_switch' | 'all_exhausted' | 'recovery_failed' | 'abnormal_exit';

const debugEvents = new Set(['launch', 'quota_switch', 'all_exhausted', 'interrupt', 'exit', 'recovery_failed', 'abnormal_exit', 'invocation_end', 'goal_recovery']);

export async function createSessionLogger(
  appHome: string,
  options: { debugOutput?: Pick<Writable, 'write'>; onIncident?: (reason: IncidentReason) => Promise<void> } = {}
): Promise<SessionLogger> {
  const logDirectory = logsRoot(appHome);
  await ensureDir(logDirectory);
  const filePath = path.join(logDirectory, `session-${Date.now()}.log`);
  const startedAt = Date.now();

  return {
    path: filePath,
    async log(event, details = {}) {
      const time = new Date().toISOString();
      await appendFile(filePath, `${JSON.stringify({ time, event, ...details })}\n`, 'utf8');
      if (options.debugOutput) {
        // Debug output deliberately excludes names, session IDs, raw args and errors.
        const safe: Record<string, unknown> = {
          time,
          event: debugEvents.has(event) ? event : 'other',
          elapsedMs: Date.now() - startedAt
        };
        for (const key of ['resume', 'sessionBound', 'quotaDetected', 'missingSessionError', 'interrupted']) {
          if (typeof details[key] === 'boolean') safe[key] = details[key];
        }
        if (event === 'goal_recovery') {
          if (['restored', 'unchanged', 'unavailable', 'failed', 'interrupted'].includes(String(details.outcome))) safe.outcome = details.outcome;
          if (['protocol', 'timeout', 'process', 'unsupported', 'profile', 'verification'].includes(String(details.reason))) safe.reason = details.reason;
        }
        if (typeof details.exitCode === 'number' && Number.isFinite(details.exitCode)) safe.exitCode = details.exitCode;
        if (typeof details.outputCharacters === 'number' && Number.isSafeInteger(details.outputCharacters) && details.outputCharacters >= 0) safe.outputCharacters = details.outputCharacters;
        if (Array.isArray(details.exhausted)) safe.exhaustedCount = details.exhausted.length;
        // Debug aliases are scoped to this selection snapshot; reports share aliases across events.
        const aliases = new Map<string, string>();
        const selection = sanitizeRotationSelection(details.selection, (value) => {
          if (typeof value !== 'string' || value.length === 0 || value.length > 1024) return null;
          if (!aliases.has(value)) aliases.set(value, `account-${aliases.size + 1}`);
          return aliases.get(value)!;
        });
        if (selection) safe.selection = selection;
        const policy = details.policy as Record<string, unknown> | undefined;
        if (policy && typeof policy === 'object') {
          const safePolicy: Record<string, unknown> = {};
          for (const key of ['noDaemon', 'hasProfile', 'hasModelOverride', 'remote']) {
            if (typeof policy[key] === 'boolean') safePolicy[key] = policy[key];
          }
          if (['default', 'overridden', 'read-only', 'workspace-write', 'danger-full-access'].includes(String(policy.sandbox))) safePolicy.sandbox = policy.sandbox;
          if (['default', 'overridden', 'on-request', 'never'].includes(String(policy.approval))) safePolicy.approval = policy.approval;
          if (typeof policy.configOverrides === 'number' && Number.isSafeInteger(policy.configOverrides) && policy.configOverrides >= 0) safePolicy.configOverrides = policy.configOverrides;
          safe.policy = safePolicy;
        }
        options.debugOutput.write(`[codex-auto:debug] ${JSON.stringify(safe)}\n`);
      }
      const reason = event === 'exit' && typeof details.exitCode === 'number' && details.exitCode !== 0
        ? 'abnormal_exit' : event;
      if (['quota_switch', 'all_exhausted', 'recovery_failed', 'abnormal_exit'].includes(reason)) {
        // Recording diagnostics must never prevent account recovery or cleanup.
        try { await options.onIncident?.(reason as IncidentReason); } catch { /* best effort */ }
      }
    }
  };
}
