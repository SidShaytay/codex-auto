// Explicitly approved separate real terminal only. Fake auth + localhost401.
// Build first. Args: report.json native-binary [archived-baseline-session.js]
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runManagedSession } from '../dist/lib/session.js';
import { runNativeBootstrapRegression } from '../tests/helpers/native-bootstrap.mjs';
assert(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY, 'Actual terminal required');
const [reportPath, binary, baselinePath] = process.argv.slice(2);
assert(reportPath && binary, 'Specify report path and selected native binary');
const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const modes = () => execFileSync('stty', ['-g'], { stdio: ['inherit', 'pipe', 'pipe'] }).toString();
const terminalModes = modes();
const runners = baselinePath ? [['baseline', (await import(baselinePath)).runManagedSession], ['patched', runManagedSession]] : [['patched', runManagedSession]];
const results = [];
for (const shell of ['/bin/bash', '/bin/fish']) for (const [implementation, sessionRunner] of runners) {
  console.log('ISOLATED NATIVE ROUTING401', shell, implementation);
  const report = await runNativeBootstrapRegression({ binary, sessionRunner, shell, stdin: process.stdin, stdout: process.stdout, stderr: process.stderr });
  const patched = implementation === 'patched';
  const terminalRestored = terminalModes === modes();
  const pass = report.nativeVersionSeen && report.nativeFatalEnvelopeSeen && report.routing401Requests > 0 && report.nativeExitCode === 1 &&
    report.nativeAuthorizationClassified === patched && report.nativeQuotaClassified === false &&
    report.runResult.finalAccount === (patched ? 'c' : 'b') && report.runResult.exitCode === (patched ? 0 : 1) &&
    report.launches === (patched ? 3 : 2) && report.sameThread && report.policyPreserved && report.goalPreserved &&
    report.autonomousProgress === patched && terminalRestored;
  results.push({ shell, implementation, pass, terminalRestored, ...report });
}
const sourceHashes = {};
for (const file of ['cli.js', 'lib/session.js', 'lib/detection.js', 'lib/update-check.js']) {
  sourceHashes[file] = createHash('sha256').update(await readFile(path.join(repo, 'dist', file))).digest('hex');
}
const fixtureHashes = {};
for (const file of ['tests/fixtures/fake-codex.mjs', 'tests/helpers/native-bootstrap.mjs', 'tests/fixtures/native-bootstrap-401-tail.json', 'scripts/test-bootstrap-native-terminal.mjs']) {
  fixtureHashes[file] = createHash('sha256').update(await readFile(path.join(repo, file))).digest('hex');
}
const baselineHashes = {};
if (baselinePath) for (const file of ['session.js', 'detection.js']) {
  baselineHashes[file] = createHash('sha256').update(await readFile(path.join(path.dirname(baselinePath), file))).digest('hex');
}
await writeFile(reportPath, JSON.stringify({ actualTTY: true, syntheticOnly: true, generatedAt: new Date().toISOString(),
  build: JSON.parse(await readFile(path.join(repo, 'dist/build-info.json'), 'utf8')), sourceHashes, fixtureHashes, baselineHashes, results }, null, 2) + '\n');
console.log('Native acceptance', results.filter((row) => row.pass).length, '/', results.length);
process.exitCode = results.every((row) => row.pass) ? 0 : 1;
