import { readFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { describe, expect, test } from 'vitest';
import { createSessionLogger } from '../../src/lib/logger.js';
import { cleanupTempDir, createTempAppHome } from '../helpers/temp.js';

describe('session evidence', () => {
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
