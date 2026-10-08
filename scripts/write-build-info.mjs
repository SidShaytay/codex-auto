import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let commit = null;
let dirty = false;
try {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (/^[a-f0-9]{40,64}$/.test(head)) {
    commit = head;
    // Temporary, untracked files do not change the tracked source revision.
    dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim().length > 0;
  }
} catch {
  // Source archives and installed packages need not contain Git metadata.
}
await writeFile(new URL('../dist/build-info.json', import.meta.url), JSON.stringify({ commit, dirty }, null, 2) + '\n');
