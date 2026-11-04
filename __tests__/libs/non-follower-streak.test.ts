import { noteUnfollow, resetNonFollowerStreak, snoozeNonFollowerOffer, subscribeNonFollowerOffer } from '../../libs/non-follower-streak';

describe('non-follower streak', () => {
  beforeEach(() => resetNonFollowerStreak());

  it('offers after two non-followers in a row, once per open', () => {
    const cb = jest.fn();
    const off = subscribeNonFollowerOffer(cb);
    noteUnfollow(false, 1000);
    expect(cb).not.toHaveBeenCalled();
    noteUnfollow(false, 2000);
    expect(cb).toHaveBeenCalledTimes(1);
    noteUnfollow(false, 3000);
    noteUnfollow(false, 4000);
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('a follower in between or a long gap resets the run', () => {
    const cb = jest.fn();
    const off = subscribeNonFollowerOffer(cb);
    noteUnfollow(false, 1000);
    noteUnfollow(true, 2000);
    noteUnfollow(false, 3000);
    noteUnfollow(false, 3000 + 11 * 60 * 1000);
    noteUnfollow(undefined, 3000 + 11 * 60 * 1000 + 1);
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it('stays quiet while snoozed', () => {
    const cb = jest.fn();
    const off = subscribeNonFollowerOffer(cb);
    snoozeNonFollowerOffer(60_000);
    noteUnfollow(false);
    noteUnfollow(false);
    expect(cb).not.toHaveBeenCalled();
    off();
  });
});
