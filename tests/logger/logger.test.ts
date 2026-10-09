import { readFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { describe, expect, test } from 'vitest';
import { createSessionLogger } from '../../src/lib/logger.js';
import { collectDiagnostics } from '../../src/lib/diagnostics.js';
import { cleanupTempDir, createTempAppHome } from '../helpers/temp.js';

describe('session evidence', () => {
  test('authorization evidence stays distinct from quota and excludes private fields', async () => {
    const appHome = await createTempAppHome(); const debugOutput = new PassThrough();
    try {
      const logger = await createSessionLogger(appHome, { debugOutput });
      await logger.log('authorization_switch', { bootstrapAuthorizationError: true, selection: {
        checkedAt: '2026-10-09T16:01:28Z', source: 'local_account_observations', liveQuotaRefreshed: false,
        accounts: [{ account: 'private-account', eligibility: 'authorization_failed', quotaObservedAt: null, retryAt: null,
          authorizationObservedAt: '2026-10-09T16:01:28Z', credential: 'private-credential' }]
      }, error: 'private-error' });
      const debug = debugOutput.read().toString();
      expect(debug).toContain('authorization_failed'); expect(debug).not.toContain('private');
      const report = await collectDiagnostics({ appHome, packageVersion: 'test' });
      expect(JSON.stringify(report.events)).toContain('authorizationObservedAt');
      expect(JSON.stringify(report.events)).not.toContain('private');
    } finally { await cleanupTempDir(appHome); }
  });
  test('goal recovery debug and exported events contain only allowlisted outcomes and reasons', async () => {
    const appHome = await createTempAppHome();
    const debugOutput = new PassThrough();
    try {
      const logger = await createSessionLogger(appHome, { debugOutput });
      await logger.log('goal_recovery', { outcome: 'restored', sessionBound: true, objective: 'private objective', error: 'private error' });
      await logger.log('goal_recovery', { outcome: 'private status', reason: 'private reason' });
      const output = debugOutput.read().toString();
      expect(output).toContain('"outcome":"restored"');
      expect(output).not.toContain('private');
      const report = await collectDiagnostics({ appHome, packageVersion: 'test' });
      expect(report.events).toHaveLength(2);
      expect(report.events.find((event) => event.outcome === 'restored')).toMatchObject({ event: 'goal_recovery', outcome: 'restored', sessionBound: true });
      expect(JSON.stringify(report.events)).not.toContain('private');
    } finally { await cleanupTempDir(appHome); }
  });
  test('records launch context before failures even when debug output is disabled', async () => {
    const appHome = await createTempAppHome();
    try {
      const logger = await createSessionLogger(appHome);
      await logger.log('launch', { resume: false, sessionBound: true, policy: { noDaemon: true } });
      expect(JSON.parse((await readFile(logger.path, 'utf8')).trim())).toMatchObject({
        event: 'launch', resume: false, sessionBound: true, policy: { noDaemon: true }
      });
    } finally { await cleanupTempDir(appHome); }
  });

  test('debug output includes safe policy but excludes raw identifying and secret fields', async () => {
    const appHome = await createTempAppHome();
    const debugOutput = new PassThrough();
    try {
      const logger = await createSessionLogger(appHome, { debugOutput });
      await logger.log('launch', {
        account: 'private-name', sessionId: 'private-session', args: ['secret-arg'], error: 'secret-error',
        resume: true, sessionBound: true,
        policy: { noDaemon: true, sandbox: 'read-only', approval: 'never', configOverrides: 2,
          hasProfile: true, hasModelOverride: false, remote: false, token: 'secret-token', config: 'secret-config' }
      });
      const output = debugOutput.read().toString();
      for (const secret of ['private-name', 'private-session', 'secret-arg', 'secret-error', 'secret-token', 'secret-config']) {
        expect(output).not.toContain(secret);
      }
      const record = JSON.parse(output.slice(output.indexOf('{')));
      expect(record).toMatchObject({ event: 'launch', resume: true, sessionBound: true,
        policy: { noDaemon: true, sandbox: 'read-only', approval: 'never', configOverrides: 2 } });
    } finally { await cleanupTempDir(appHome); }
  });

  test('records selection reasons locally and exports only allowlisted snapshot aliases in debug output', async () => {
    const appHome = await createTempAppHome();
    const debugOutput = new PassThrough();
    try {
      const logger = await createSessionLogger(appHome, { debugOutput });
      const time = '2026-10-09T06:34:16.000Z';
      await logger.log('quota_switch', { selection: {
        checkedAt: time, source: 'local_quota_observations', liveQuotaRefreshed: false, config: 'private-config',
        accounts: [{ account: 'private-account', eligibility: 'reset_elapsed', quotaObservedAt: time,
          retryAt: time, displayText: 'private-text', token: '«SECRET SECRET_QUOTED_SECRET_ASSIGNMENT_5 redacted — the real value is live in your shell env; read it in bash as "$SECRET_QUOTED_SECRET_ASSIGNMENT_5"»' }]
      } });
      const local = JSON.parse((await readFile(logger.path, 'utf8')).trim());
      expect(local.selection.accounts[0].account).toBe('private-account');
      const output = debugOutput.read().toString();
      expect(output).not.toContain('private-');
      expect(JSON.parse(output.slice(output.indexOf('{'))).selection).toEqual({
        checkedAt: time, source: 'local_quota_observations', liveQuotaRefreshed: false, capped: false,
        accounts: [{ account: 'account-1', eligibility: 'reset_elapsed', quotaObservedAt: time, retryAt: time }]
      });
    } finally { await cleanupTempDir(appHome); }
  });

  test('automatically captures incident events and tolerates capture failure', async () => {
    const appHome = await createTempAppHome();
    const reasons: string[] = [];
    try {
      const logger = await createSessionLogger(appHome, { onIncident: async (reason) => {
        reasons.push(reason);
        if (reason === 'recovery_failed') throw new Error('disk unavailable');
      } });
      await logger.log('launch');
      await logger.log('exit', { exitCode: 0 });
      await logger.log('interrupt', { exitCode: 130 });
      await logger.log('quota_switch');
      await logger.log('all_exhausted');
      await logger.log('recovery_failed');
      await logger.log('exit', { exitCode: 1 });
      expect(reasons).toEqual(['quota_switch', 'all_exhausted', 'recovery_failed', 'abnormal_exit']);
    } finally { await cleanupTempDir(appHome); }
  });
});
