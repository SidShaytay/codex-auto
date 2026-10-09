import { describe, expect, test } from 'vitest';
import { decideAccountRotation, pickNextAccount, type QuotaObservation } from '../../src/lib/rotation.js';

describe('rotation', () => {
  const observedAt = '2026-10-09T04:47:50.000Z';
  const retryAt = '2026-10-09T05:00:00.000Z';
  const afterReset = Date.parse('2026-10-09T06:34:16.000Z');

  test('retains future cooldowns and reconsiders elapsed resets at the exact boundary', () => {
    const observations = new Map<string, QuotaObservation>([['a', { observedAt, retryAt }]]);
    expect(decideAccountRotation(['a', 'b'], 1, observations, Date.parse(retryAt) - 1).next).toEqual({ name: 'b', index: 1 });
    const result = decideAccountRotation(['a', 'b'], 1, observations, Date.parse(retryAt));
    expect(result.next).toEqual({ name: 'a', index: 0 });
    expect(result.exhausted).toEqual([]);
    expect(result.selection.accounts[0]).toMatchObject({ eligibility: 'reset_elapsed', quotaObservedAt: observedAt, retryAt });
    expect(result.selection.accounts[1].eligibility).toBe('untried');
  });

  test.each([null, 'invalid', observedAt, '2026-10-09T04:00:00.000Z'])(
    'does not invent eligibility from missing, invalid or already-past reset evidence: %s', (reset) => {
      const observations = new Map<string, QuotaObservation>([['a', { observedAt, retryAt: reset }]]);
      const result = decideAccountRotation(['a'], 0, observations, afterReset);
      expect(result.next).toBeNull();
      expect(result.exhausted).toEqual(['a']);
      expect(result.selection.accounts[0].eligibility).toBe(reset === null ? 'reset_unknown' : 'reset_unusable');
    }
  );

  test('a fresh error replaces elapsed reset evidence with the new cooldown', () => {
    const observations = new Map<string, QuotaObservation>([['a', { observedAt, retryAt }]]);
    expect(decideAccountRotation(['a'], 0, observations, afterReset).next?.name).toBe('a');
    observations.set('a', { observedAt: new Date(afterReset).toISOString(), retryAt: '2026-10-09T07:00:00.000Z' });
    const result = decideAccountRotation(['a'], 0, observations, afterReset);
    expect(result.next).toBeNull();
    expect(result.selection.accounts[0].eligibility).toBe('cooldown');
  });

  test('limits the decision and snapshot to the current configured accounts', () => {
    const observations = new Map<string, QuotaObservation>([['removed', { observedAt, retryAt: null }]]);
    const result = decideAccountRotation(['c', 'b'], -1, observations, afterReset);
    expect(result.next).toEqual({ name: 'c', index: 0 });
    expect(result.selection.accounts.map(({ account }) => account)).toEqual(['c', 'b']);
  });
  test('selects the next non-exhausted account in order', () => {
    const next = pickNextAccount(['a', 'b', 'c'], 0, new Set(['a', 'b']));
    expect(next).toEqual({ name: 'c', index: 2 });
  });
});
