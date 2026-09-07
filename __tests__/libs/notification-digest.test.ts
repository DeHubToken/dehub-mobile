/**
 * The two rules that make a raid survivable, pinned.
 *
 * Both are easy to "fix" into something lossy — a budget that drops the
 * messages it could not announce, or a digest that quotes the oldest line
 * because that is the order the buffer happened to be in — and neither failure
 * is visible on screen. Hence the tests. Web carries the same suite against
 * the same rules (src/lib/__tests__/notification-digest.test.ts).
 */

import { storage } from '../../libs/storage';
import {
  ALLOWANCE_WINDOW_MS,
  buildDigest,
  claimAllowance,
  readAllowance,
  resetAllowance,
} from '../../libs/notification-digest';

const CHANNEL = 'test-channel';

beforeEach(() => {
  storage.clearAll();
});

describe('buildDigest', () => {
  it('counts everything and names the distinct senders in arrival order', () => {
    const digest = buildDigest([
      { from: 'ben', text: 'one' },
      { from: 'alice', text: 'two' },
      { from: 'ben', text: 'three' },
    ]);

    expect(digest.count).toBe(3);
    expect(digest.names).toEqual(['ben', 'alice']);
    expect(digest.otherNames).toBe(0);
  });

  it('quotes the newest line, not the first one buffered', () => {
    const digest = buildDigest([
      { from: 'ben', text: 'oldest' },
      { from: 'ben', text: 'newest' },
    ]);

    expect(digest.latest).toBe('newest');
    expect(digest.latestIsPersonal).toBe(false);
  });

  it('caps the names and reports the rest as others', () => {
    const digest = buildDigest(
      ['a', 'b', 'c', 'd', 'e'].map((from) => ({ from, text: from })),
      3,
    );

    expect(digest.names).toEqual(['a', 'b', 'c']);
    expect(digest.otherNames).toBe(2);
  });

  it('treats the same name in different case as one sender', () => {
    const digest = buildDigest([
      { from: '@Ben', text: 'one' },
      { from: '@ben', text: 'two' },
    ]);

    expect(digest.names).toEqual(['@Ben']);
  });

  it('leads with a message aimed at the reader, however much arrived after it', () => {
    const digest = buildDigest([
      { from: 'ben', text: 'chatter' },
      { from: 'alice', text: 'hey @you', personal: true },
      { from: 'carol', text: 'more chatter' },
    ]);

    expect(digest.latest).toBe('hey @you');
    expect(digest.latestIsPersonal).toBe(true);
    // The pile is still the whole pile — the mention is promoted, not isolated.
    expect(digest.count).toBe(3);
  });

  it('skips items with nothing to say without losing them from the count', () => {
    const digest = buildDigest([
      { from: 'ben', text: '   ' },
      { from: '', text: 'said something' },
    ]);

    expect(digest.count).toBe(2);
    expect(digest.names).toEqual(['ben']);
    expect(digest.latest).toBe('said something');
  });
});

describe('claimAllowance', () => {
  it('allows exactly the limit inside the window', () => {
    const now = 1_000_000;
    expect(claimAllowance(CHANNEL, 3, now)).toBe(true);
    expect(claimAllowance(CHANNEL, 3, now + 1)).toBe(true);
    expect(claimAllowance(CHANNEL, 3, now + 2)).toBe(true);
    expect(claimAllowance(CHANNEL, 3, now + 3)).toBe(false);
  });

  it('reports when the next slot frees up rather than making the caller poll', () => {
    const now = 1_000_000;
    claimAllowance(CHANNEL, 2, now);
    claimAllowance(CHANNEL, 2, now + 5_000);

    const state = readAllowance(CHANNEL, 2, now + 6_000);
    expect(state.used).toBe(2);
    expect(state.remaining).toBe(0);
    expect(state.nextAt).toBe(now + ALLOWANCE_WINDOW_MS);
  });

  it('frees a slot once the oldest spend leaves the window', () => {
    const now = 1_000_000;
    claimAllowance(CHANNEL, 1, now);
    expect(claimAllowance(CHANNEL, 1, now + ALLOWANCE_WINDOW_MS - 1)).toBe(false);
    expect(claimAllowance(CHANNEL, 1, now + ALLOWANCE_WINDOW_MS + 1)).toBe(true);
  });

  it('nothing is free while the reader is over a limit they just lowered', () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i += 1) claimAllowance(CHANNEL, 5, now + i);

    // Dial moved from 5 to 2: the two most recent spends still have to age out.
    const state = readAllowance(CHANNEL, 2, now + 10);
    expect(state.remaining).toBe(0);
    expect(state.nextAt).toBe(now + 3 + ALLOWANCE_WINDOW_MS);
  });

  it('ignores stamps from the future, so a clock change cannot lock it out', () => {
    const now = 1_000_000;
    storage.set(
      'dehub.notify.spend::' + CHANNEL,
      JSON.stringify([now + 60_000, now + 120_000]),
    );

    expect(readAllowance(CHANNEL, 1, now).used).toBe(0);
    expect(claimAllowance(CHANNEL, 1, now)).toBe(true);
  });

  it('survives a corrupted store instead of refusing to notify forever', () => {
    storage.set('dehub.notify.spend::' + CHANNEL, 'not json');
    expect(claimAllowance(CHANNEL, 1)).toBe(true);
  });

  it('forgets the spend when the channel is turned off', () => {
    const now = 1_000_000;
    claimAllowance(CHANNEL, 1, now);
    resetAllowance(CHANNEL);
    expect(claimAllowance(CHANNEL, 1, now + 1)).toBe(true);
  });
});
