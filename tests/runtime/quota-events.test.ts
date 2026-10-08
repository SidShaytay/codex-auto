import { appendFile, mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createQuotaEventReader } from '../../src/lib/quota-events.js';

let directory: string;
let file: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'quota-events-'));
  file = path.join(directory, 'rollout-bound.jsonl');
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });
const event = (code = 'usage_limit_exceeded', timestamp = new Date().toISOString()) => JSON.stringify({
  timestamp, type: 'event_msg', payload: { type: 'task_complete', error: {
    codex_error_info: code, message: 'Quota exhausted or try again at 7:37 PM.'
  } }
}) + '\n';

test('ignores existing history and recognizes a fresh appended error', async () => {
  await writeFile(file, event());
  const reader = await createQuotaEventReader(directory, 'bound');
  expect(await reader.poll()).toBeNull();
  await appendFile(file, event());
  expect(await reader.poll()).toBe('Quota exhausted or try again at 7:37 PM.');
  expect(await reader.poll()).toBeNull();
});

test('ignores concurrent threads, historical replay and other errors', async () => {
  const reader = await createQuotaEventReader(directory, 'bound');
  await writeFile(path.join(directory, 'rollout-other.jsonl'), event());
  await writeFile(file, event('usage_limit_exceeded', '2020-01-01T00:00:00Z') + event('context_window_exceeded'));
  expect(await reader.poll()).toBeNull();
});

test('retains split records without classifying incomplete input', async () => {
  const reader = await createQuotaEventReader(directory, 'bound');
  const record = event();
  await writeFile(file, record.slice(0, 25));
  expect(await reader.poll()).toBeNull();
  await appendFile(file, record.slice(25));
  expect(await reader.poll()).not.toBeNull();
});

test('does not treat arbitrary transcript text or missing timestamps as evidence', async () => {
  const reader = await createQuotaEventReader(directory, 'bound');
  await writeFile(file, 'not json\n' + JSON.stringify({ type: 'response_item', payload: {
    type: 'task_complete', error: { codex_error_info: 'usage_limit_exceeded' }
  } }) + '\n' + JSON.stringify({ type: 'event_msg', payload: {
    type: 'task_complete', error: { codex_error_info: 'usage_limit_exceeded' }
  } }) + '\n');
  expect(await reader.poll()).toBeNull();
});

test('discovers the bound file in nested session directories', async () => {
  const reader = await createQuotaEventReader(directory, 'bound');
  const nested = path.join(directory, '2026', '10');
  await mkdir(nested, { recursive: true });
  await writeFile(path.join(nested, 'rollout-bound.jsonl'), event());
  expect(await reader.poll()).not.toBeNull();
});

test('does not follow a session-file symlink', async () => {
  const outside = path.join(directory, 'outside.jsonl');
  await writeFile(outside, event());
  await symlink(outside, file);
  const reader = await createQuotaEventReader(directory, 'bound');
  await appendFile(outside, event());
  expect(await reader.poll()).toBeNull();
});

test('skips truncated contents but accepts subsequent fresh appends', async () => {
  await writeFile(file, 'x'.repeat(1024));
  const reader = await createQuotaEventReader(directory, 'bound');
  await writeFile(file, event());
  expect(await reader.poll()).toBeNull();
  await appendFile(file, event());
  expect(await reader.poll()).not.toBeNull();
});

test('skips replacement contents regardless of size and recognizes later appends', async () => {
  await writeFile(file, 'old\n');
  const reader = await createQuotaEventReader(directory, 'bound');
  const replacement = path.join(directory, 'replacement.jsonl');
  await writeFile(replacement, event());
  await rename(replacement, file);
  expect(await reader.poll()).toBeNull();
  await appendFile(file, event());
  expect(await reader.poll()).not.toBeNull();
});

test('skips oversized unrelated lines and still reads the following quota event', async () => {
  const reader = await createQuotaEventReader(directory, 'bound');
  await writeFile(file, 'x'.repeat(300 * 1024) + '\n' + event());
  expect(await reader.poll()).not.toBeNull();
});
