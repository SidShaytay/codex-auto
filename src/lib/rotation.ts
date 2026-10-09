import type { AppState } from './state.js';

export type AccountSelection = {
  name: string;
  index: number;
};

export type QuotaObservation = { observedAt: string; retryAt: string | null };
export type AccountEligibility = 'untried' | 'cooldown' | 'reset_elapsed' | 'reset_unknown' | 'reset_unusable' | 'authorization_failed';
export type RotationSelection = {
  checkedAt: string;
  source: 'local_quota_observations' | 'local_account_observations';
  liveQuotaRefreshed: false;
  accounts: { account: string; eligibility: AccountEligibility; quotaObservedAt: string | null; retryAt: string | null; authorizationObservedAt?: string }[];
};

/** Retain reset evidence independently of state, which removes expired display hints. */
export function decideAccountRotation(
  accounts: string[], currentIndex: number, observations: Map<string, QuotaObservation>, now = Date.now(),
  authorizationFailures: Map<string, string> = new Map()
): { next: AccountSelection | null; exhausted: string[]; selection: RotationSelection } {
  const candidates = accounts.map((account) => {
    const observation = observations.get(account);
    let eligibility: AccountEligibility = 'untried';
    if (observation) {
      const retryAt = observation.retryAt === null ? NaN : Date.parse(observation.retryAt);
      const observedAt = Date.parse(observation.observedAt);
      eligibility = observation.retryAt === null ? 'reset_unknown'
        : !Number.isFinite(retryAt) || !Number.isFinite(observedAt) || retryAt <= observedAt ? 'reset_unusable'
        : retryAt > now ? 'cooldown' : 'reset_elapsed';
    }
    const authorizationObservedAt = authorizationFailures.get(account);
    if (authorizationObservedAt) eligibility = 'authorization_failed';
    return { account, eligibility, quotaObservedAt: observation?.observedAt ?? null, retryAt: observation?.retryAt ?? null,
      ...(authorizationObservedAt ? { authorizationObservedAt } : {}) };
  });
  const exhausted = candidates.filter(({ eligibility }) => !['untried', 'reset_elapsed'].includes(eligibility))
    .map(({ account }) => account);
  return {
    next: pickNextAccount(accounts, currentIndex, new Set(exhausted)), exhausted,
    selection: { checkedAt: new Date(now).toISOString(), source: authorizationFailures.size > 0 ? 'local_account_observations' : 'local_quota_observations', liveQuotaRefreshed: false, accounts: candidates }
  };
}

export function getCurrentAccount(state: AppState): AccountSelection | null {
  if (state.accounts.length === 0) {
    return null;
  }

  const index = state.currentIndex ?? 0;
  return {
    name: state.accounts[index] ?? state.accounts[0],
    index: state.accounts[index] ? index : 0
  };
}

export function getAccountByName(state: AppState, accountName: string): AccountSelection | null {
  const index = state.accounts.indexOf(accountName);
  if (index === -1) {
    return null;
  }

  return {
    name: state.accounts[index],
    index
  };
}

export function getPreferredAccount(state: AppState): AccountSelection | null {
  if (!state.preferredAccountName) {
    return null;
  }

  return getAccountByName(state, state.preferredAccountName);
}

export function pickNextAccount(
  accounts: string[],
  currentIndex: number,
  exhausted: Set<string>
): AccountSelection | null {
  if (accounts.length === 0) {
    return null;
  }

  for (let offset = 1; offset <= accounts.length; offset += 1) {
    const nextIndex = (currentIndex + offset) % accounts.length;
    const nextAccount = accounts[nextIndex];
    if (!exhausted.has(nextAccount)) {
      return {
        name: nextAccount,
        index: nextIndex
      };
    }
  }

  return null;
}
