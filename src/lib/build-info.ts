import { readFileSync } from 'node:fs';

export type BuildInfo = { commit: string | null; dirty: boolean };

export function readBuildInfo(): BuildInfo {
  try {
    const info = JSON.parse(readFileSync(new URL('../build-info.json', import.meta.url), 'utf8'));
    if (typeof info.commit === 'string' && /^[a-f0-9]{40,64}$/.test(info.commit) && typeof info.dirty === 'boolean') {
      return { commit: info.commit, dirty: info.dirty };
    }
  } catch { /* Source-mode tests or builds without Git metadata. */ }
  return { commit: null, dirty: false };
}

export function formatBuildVersion(version: string): string {
  const info = readBuildInfo();
  return info.commit ? `${version}+git.${info.commit.slice(0, 12)}${info.dirty ? '.dirty' : ''}` : version;
}
