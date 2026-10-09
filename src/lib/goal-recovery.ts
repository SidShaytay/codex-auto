import { spawn } from 'node:child_process';
import { buildCodexShellCommand } from './codex-bin.js';

export type GoalRecoveryResult = {
  outcome: 'restored' | 'unchanged' | 'unavailable' | 'failed' | 'interrupted';
  reason?: 'protocol' | 'timeout' | 'process' | 'unsupported' | 'profile' | 'verification';
};

// Native 0.161.0's app-server CLI does not accept the TUI's -p profile selector.
// Do not silently operate under a different configuration for profile launches.
export function goalServerConfigArgs(policyArgs: string[]): string[] | null {
  const result: string[] = [];
  for (let index = 0; index < policyArgs.length; index += 1) {
    const arg = policyArgs[index]!;
    if (arg === '--') break;
    if (arg === '--strict-config') { result.push(arg); continue; }
    const valued = ['-c', '--config', '--enable', '--disable', '-p', '--profile', '-m', '--model',
      '-s', '--sandbox', '-a', '--ask-for-approval', '-C', '--cd', '--add-dir', '--local-provider'];
    const equals = arg.indexOf('=');
    let name = equals === -1 ? arg : arg.slice(0, equals);
    const attachedShort = !valued.includes(name) && !arg.startsWith('--') && arg.length > 2 && valued.includes(arg.slice(0, 2));
    if (attachedShort) name = arg.slice(0, 2);
    if (!valued.includes(name)) continue;
    const value = attachedShort ? arg.slice(2) : equals !== -1 ? arg.slice(equals + 1) : policyArgs[++index];
    if (!['-c', '--config', '--enable', '--disable', '-p', '--profile'].includes(name) || value === undefined) continue;
    if (name === '-p' || name === '--profile') return null;
    result.push(name, value);
  }
  return result;
}

class RecoveryError extends Error {
  constructor(readonly reason: NonNullable<GoalRecoveryResult['reason']>) { super(reason); }
}

/**
 * Only called after the quota-stopped child has exited. This independent stdio server
 * never loads/resumes a thread or starts a turn, and never attaches to the daemon.
 * Native goal/set on an unloaded persisted thread updates local state only.
 */
export async function recoverQuotaLimitedGoal(options: {
  codexCommand: string;
  env: NodeJS.ProcessEnv;
  workspaceDir: string;
  sessionId: string;
  policyArgs: string[];
  timeoutMs?: number;
}): Promise<GoalRecoveryResult> {
  const configArgs = goalServerConfigArgs(options.policyArgs);
  if (configArgs === null) return { outcome: 'unavailable', reason: 'profile' };
  const command = buildCodexShellCommand(options.codexCommand, [
    'app-server', '--listen', 'stdio://', ...configArgs
  ]);
  const child = spawn(options.env.SHELL || '/bin/bash', ['-lc', `exec ${command}`], {
    cwd: options.workspaceDir, env: options.env, stdio: ['pipe', 'pipe', 'pipe']
  });
  let closed = false;
  const closing = new Promise<void>((resolve) => child.once('close', () => { closed = true; resolve(); }));
  let sequence = 0;
  let pending: { id: number; resolve: (value: unknown) => void; reject: (error: RecoveryError) => void } | null = null;
  let failure: RecoveryError | null = null;
  let buffer = '';
  let bytes = 0;
  let quotaLimited = false;
  let interrupted = false;
  const fail = (reason: NonNullable<GoalRecoveryResult['reason']>) => {
    failure = new RecoveryError(reason);
    pending?.reject(failure);
    pending = null;
  };
  const interrupt = () => { interrupted = true; fail('process'); child.kill('SIGTERM'); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const deadline = setTimeout(() => { fail('timeout'); child.kill('SIGTERM'); }, options.timeoutMs ?? 10_000);
  child.on('error', () => fail('process'));
  child.stdin.on('error', () => fail('process'));
  child.once('exit', () => { if (pending) fail('process'); });
  // Never surface server stderr, protocol payloads, objectives, or raw error messages.
  child.stderr.resume();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 2 * 1024 * 1024) { fail('protocol'); child.kill('SIGTERM'); return; }
    buffer += chunk;
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message: Record<string, unknown>;
      try { message = JSON.parse(line); } catch { fail('protocol'); return; }
      if (!message || typeof message !== 'object') { fail('protocol'); return; }
      if (!pending || message.id !== pending.id) continue;
      if (message.error) {
        const error = message.error as { code?: unknown; message?: unknown };
        fail(error.code === -32601 || error.message === 'goals feature is disabled' ? 'unsupported' : 'protocol');
      } else if ('result' in message) {
        const response = pending; pending = null; response.resolve(message.result);
      } else fail('protocol');
    }
  });
  const request = (method: string, params: unknown): Promise<unknown> => {
    if (failure) return Promise.reject(failure);
    if (closed || child.exitCode !== null) return Promise.reject(new RecoveryError('process'));
    return new Promise((resolve, reject) => {
      const id = ++sequence; pending = { id, resolve, reject };
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  };
  const readStatus = (response: unknown): string | null => {
    if (!response || typeof response !== 'object' || !('goal' in response)) throw new RecoveryError('protocol');
    const goal = (response as { goal: unknown }).goal;
    if (goal === null) return null;
    if (!goal || typeof goal !== 'object') throw new RecoveryError('protocol');
    const value = goal as { threadId?: unknown; status?: unknown };
    if (value.threadId !== options.sessionId || typeof value.status !== 'string') throw new RecoveryError('verification');
    return value.status;
  };
  try {
    await request('initialize', {
      clientInfo: { name: 'managed-goal-recovery', version: '1' },
      capabilities: { experimentalApi: true }
    });
    child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
    const params = { threadId: options.sessionId };
    if (readStatus(await request('thread/goal/get', params)) !== 'usageLimited') return { outcome: 'unchanged' };
    quotaLimited = true;
    // Do not send objective, tokenBudget or origin=user: preserve native accounting
    // and avoid inserting a synthetic user instruction into the conversation.
    if (readStatus(await request('thread/goal/set', { ...params, status: 'active' })) !== 'active'
        || readStatus(await request('thread/goal/get', params)) !== 'active') {
      throw new RecoveryError('verification');
    }
    return { outcome: 'restored' };
  } catch (error) {
    return { outcome: interrupted ? 'interrupted' : quotaLimited ? 'failed' : 'unavailable',
      reason: error instanceof RecoveryError ? error.reason : 'protocol' };
  } finally {
    clearTimeout(deadline);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    child.stdin.end();
    if (!closed) child.kill('SIGTERM');
    const killTimer = setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, 250);
    await closing;
    clearTimeout(killTimer);
  }
}
