import {
  requestFeedVideoFocus, releaseFeedVideoFocus, revokeAllFeedVideo,
} from '../../libs/feedVideoFocus';

describe('libs/feedVideoFocus', () => {
  afterEach(() => {
    revokeAllFeedVideo();
  });

  it('stops previous player when new one requests focus', () => {
    const player1 = jest.fn();
    const player2 = jest.fn();

    requestFeedVideoFocus(player1);
    requestFeedVideoFocus(player2);

    expect(player1).toHaveBeenCalledTimes(1);
    expect(player2).not.toHaveBeenCalled();
  });

  it('does not stop itself on duplicate request', () => {
    const stop = jest.fn();
    requestFeedVideoFocus(stop);
    requestFeedVideoFocus(stop);
    expect(stop).not.toHaveBeenCalled();
  });

  it('release only works for active player', () => {
    const stop = jest.fn();
    requestFeedVideoFocus(stop);
    releaseFeedVideoFocus(jest.fn()); // different ref

    requestFeedVideoFocus(jest.fn());
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('revoke stops and clears', () => {
    const stop = jest.fn();
    requestFeedVideoFocus(stop);
    revokeAllFeedVideo();
    expect(stop).toHaveBeenCalledTimes(1);

    revokeAllFeedVideo();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
