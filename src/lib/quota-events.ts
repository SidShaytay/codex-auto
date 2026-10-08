import { constants } from 'node:fs';
import { open, readdir } from 'node:fs/promises';
import path from 'node:path';

const maxChunkBytes = 64 * 1024;
const maxLineBytes = 256 * 1024;

async function findSessionFile(directory: string, sessionId: string): Promise<string | null> {
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = await findSessionFile(candidate, sessionId);
      if (found) return found;
    } else if (entry.isFile() && entry.name.endsWith(`-${sessionId}.jsonl`)) {
      return candidate;
    }
  }
  return null;
}

/** Read only new records from an explicitly bound thread, never shared logs. */
export async function createQuotaEventReader(sessionsDir: string, sessionId: string): Promise<{
  poll: () => Promise<string | null>;
}> {
  const startedAt = Date.now();
  let file = await findSessionFile(sessionsDir, sessionId);
  let offset = 0;
  let pending = Buffer.alloc(0);
  let droppingLine = false;
  let identity: string | null = null;
  if (file) {
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => null);
    if (handle) {
      try {
        const info = await handle.stat();
        offset = info.size;
        identity = `${info.dev}:${info.ino}`;
      } finally { await handle.close(); }
    }
  }

  return {
    async poll() {
      file ??= await findSessionFile(sessionsDir, sessionId);
      if (!file) return null;
      const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => null);
      if (!handle) return null;
      try {
        const info = await handle.stat();
        if (!info.isFile()) return null;
        const currentIdentity = `${info.dev}:${info.ino}`;
        if (info.size < offset || (identity !== null && identity !== currentIdentity)) {
          // Replacement/truncation is not append evidence. Skip its existing contents.
          offset = info.size;
          identity = currentIdentity;
          pending = Buffer.alloc(0);
          droppingLine = false;
          return null;
        }
        identity = currentIdentity;
        // Drain this size snapshot using bounded reads, without a polling delay
        // per chunk. Large tool records must not hide a final completion error.
        while (offset < info.size) {
          const buffer = Buffer.alloc(Math.min(maxChunkBytes, info.size - offset));
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
          if (!bytesRead) break;
          offset += bytesRead;
          let input = Buffer.concat([pending, buffer.subarray(0, bytesRead)]);
          pending = Buffer.alloc(0);
          while (input.length) {
            const newline = input.indexOf(10);
            if (newline < 0) {
              if (!droppingLine && input.length <= maxLineBytes) pending = input;
              else droppingLine = true;
              break;
            }
            const line = input.subarray(0, newline);
            input = input.subarray(newline + 1);
            if (droppingLine || line.length > maxLineBytes) {
              droppingLine = false;
              continue;
            }
            try {
              const record = JSON.parse(line.toString('utf8'));
              const event = record.payload;
              if (record.type === 'event_msg' && event?.type === 'task_complete'
                && Date.parse(record.timestamp) >= startedAt
                && event.error?.codex_error_info === 'usage_limit_exceeded') {
                // Do not expose other transcript fields or persist the error message.
                return typeof event.error.message === 'string' ? event.error.message : '';
              }
            } catch { /* Partial/malformed/unrelated records are not quota evidence. */ }
          }
        }
        return null;
      } finally {
        await handle.close();
      }
    }
  };
}
