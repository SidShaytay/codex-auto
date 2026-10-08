import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('package distribution', () => {
  test('build metadata gracefully falls back when Git is unavailable', async () => {
    const archive = await mkdtemp(path.join(tmpdir(), 'codex-auto-archive-build-'));
    tempDirs.push(archive);
    await mkdir(path.join(archive, 'scripts'));
    await mkdir(path.join(archive, 'dist'));
    const script = path.join(archive, 'scripts', 'write-build-info.mjs');
    await copyFile('scripts/write-build-info.mjs', script);
    await execFileAsync(process.execPath, [script], { env: { ...process.env, PATH: '' } });
    expect(JSON.parse(await readFile(path.join(archive, 'dist', 'build-info.json'), 'utf8')))
      .toEqual({ commit: null, dirty: false });
  });

  test('keeps the local CLI directly executable after rebuilding', async () => {
    const appHome = await mkdtemp(path.join(tmpdir(), 'codex-auto-build-bin-'));
    tempDirs.push(appHome);
    await execFileAsync('npm', ['run', 'build'], { cwd: process.cwd(), env: process.env });
    const { stdout } = await execFileAsync(path.resolve('dist/index.js'), ['--version'], {
      cwd: process.cwd(),
      env: { ...process.env, CODEX_AUTO_HOME: appHome, CODEX_AUTO_UPDATE_CHECK: '0' }
    });
    const packageJson = (await import('../../package.json', { with: { type: 'json' } })).default;
    const info = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
    const expected = info.commit ? `${packageJson.version}+git.${info.commit.slice(0, 12)}${info.dirty ? '.dirty' : ''}` : packageJson.version;
    expect(stdout.trim()).toBe(expected);
  }, 20_000);

  test('pack helper emits tarball filename and writes GITHUB_ENV', async () => {
    const packageJson = (await import('../../package.json', { with: { type: 'json' } })).default as {
      name: string;
      version: string;
    };

    const packDir = await mkdtemp(path.join(tmpdir(), 'codex-auto-pack-helper-'));
    tempDirs.push(packDir);
    const githubEnvPath = path.join(packDir, 'github.env');

    const { stdout } = await execFileAsync(
      'node',
      ['scripts/pack-release-tarball.mjs', '--pack-destination', packDir],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          GITHUB_ENV: githubEnvPath
        }
      }
    );

    const tarballName = stdout.trim();
    expect(tarballName).toBe(`${packageJson.name}-${packageJson.version}.tgz`);
    await expect(readFile(githubEnvPath, 'utf8')).resolves.toBe(`TARBALL=${tarballName}\n`);
  }, 20_000);

  test('packs only release files and exposes publishable metadata', async () => {
    const packageJson = (await import('../../package.json', { with: { type: 'json' } })).default as {
      private?: boolean;
      license?: string;
      repository?: unknown;
      files?: string[];
      scripts?: Record<string, string>;
      engines?: Record<string, string>;
    };

    expect(packageJson.private).not.toBe(true);
    expect(packageJson.license).toBeTruthy();
    expect(packageJson.repository).toBeTruthy();
    expect(packageJson.engines?.node).toBeTruthy();
    expect(packageJson.scripts?.prepare).toBeTruthy();
    expect(packageJson.scripts?.prepack).toBeTruthy();
    expect(packageJson.files).toEqual(['dist', 'README.md', 'CHANGELOG.md', 'LICENSE']);

    const packDir = await mkdtemp(path.join(tmpdir(), 'codex-auto-pack-'));
    tempDirs.push(packDir);

    const { stdout } = await execFileAsync(
      'npm',
      ['pack', '--json', '--pack-destination', packDir],
      {
        cwd: process.cwd(),
        env: process.env
      }
    );

    const [{ files }] = JSON.parse(stdout) as Array<{ files: Array<{ path: string }> }>;
    const packedPaths = files.map((file) => file.path).sort();

    expect(packedPaths).toContain('package.json');
    expect(packedPaths).toContain('README.md');
    expect(packedPaths).toContain('LICENSE');
    expect(packedPaths).toContain('CHANGELOG.md');
    expect(packedPaths).toContain('dist/index.js');
    expect(packedPaths).toContain('dist/build-info.json');
    expect(packedPaths.some((entry) => entry.startsWith('src/'))).toBe(false);
    expect(packedPaths.some((entry) => entry.startsWith('tests/'))).toBe(false);
    expect(packedPaths.some((entry) => entry.startsWith('docs/'))).toBe(false);
    expect(packedPaths).not.toContain('tsconfig.json');
    expect(packedPaths).not.toContain('vitest.config.ts');
  }, 20_000);
});
