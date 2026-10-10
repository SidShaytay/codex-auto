import { PassThrough, Writable } from 'node:stream';
import { expect, test } from 'vitest';
import { runManagedSession } from '../../src/lib/session.js';
import { runNativeBootstrapRegression } from '../helpers/native-bootstrap.mjs';

const binary = process.env.CODEX_GOAL_NATIVE_BIN;
(binary ? test : test.skip)('actual native account/read routing401 recovers on the bound thread without fabricated terminal bytes', async () => {
  const input = new PassThrough();
  Object.assign(input, { isTTY: true });
  const output = Object.assign(new Writable({ write(chunk, _encoding, done) {
    if (chunk.toString().includes('\u001b[6n')) input.write('\u001b[1;1R');
    done();
  } }), { isTTY: true, columns: 140, rows: 40 });
  const report = await runNativeBootstrapRegression({ binary, sessionRunner: runManagedSession,
    stdin: input as unknown as NodeJS.ReadStream, stdout: output });
  expect(report).toMatchObject({ syntheticOnly: true, nativeVersionSeen: true, nativeFatalEnvelopeSeen: true,
    nativeExitCode: 1, nativeAuthorizationClassified: true, nativeQuotaClassified: false,
    runResult: { finalAccount: 'c', switchCount: 2, exitCode: 0 }, launches: 3,
    sameThread: true, policyPreserved: true, goalPreserved: true, autonomousProgress: true });
  expect(report.routing401Requests).toBeGreaterThan(0);
}, 30000);
