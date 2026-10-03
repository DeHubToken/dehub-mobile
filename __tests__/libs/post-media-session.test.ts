import { claimPostMedia, hasPostVideoSession, ownsPostMedia, postMediaIsTransferring, postMediaSession, preparePostMediaNavigation } from '../../libs/post-media-session';

describe('post media sessions', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); });

  it('hands the same running native player forward and back, preserving playback choices', () => {
    const dispose = jest.fn();
    const session = postMediaSession<any>('video:clip', dispose);
    const player = { currentTime: 42, muted: false, playbackRate: 1.5, loop: false, pause: jest.fn() };
    session.value = player;
    const feed = {};
    const releaseFeed = claimPostMedia('video:clip', session, feed);
    preparePostMediaNavigation('clip');
    expect(postMediaIsTransferring(session)).toBe(true);
    const post = {};
    const releasePost = claimPostMedia('video:clip', session, post);
    expect(postMediaIsTransferring(session)).toBe(false);
    expect(ownsPostMedia(session, feed)).toBe(false);
    expect(ownsPostMedia(session, post)).toBe(true);
    expect(postMediaSession('video:clip', dispose).value).toBe(player);
    player.currentTime = 48;
    session.userPaused = true;
    releasePost();
    expect(ownsPostMedia(session, feed)).toBe(true);
    expect(session.value.currentTime).toBe(48);
    expect(session.userPaused).toBe(true);
    expect(player.pause).not.toHaveBeenCalled();
    releaseFeed();
    expect(player.pause).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2000);
    expect(dispose).toHaveBeenCalledWith(player);
    expect(hasPostVideoSession('clip')).toBe(false);
  });

  it('bridges an unmount/mount navigation gap without pausing audio', () => {
    const dispose = jest.fn();
    const session = postMediaSession<any>('audio:track', dispose);
    session.value = { pause: jest.fn() };
    const player = session.value;
    const release = claimPostMedia('audio:track', session, {});
    preparePostMediaNavigation('track');
    release();
    expect(player.pause).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    const releasePost = claimPostMedia('audio:track', session, {});
    jest.advanceTimersByTime(2000);
    expect(dispose).not.toHaveBeenCalled();
    releasePost();
    jest.advanceTimersByTime(2000);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('bounds parked native players and disposes abandoned renders', () => {
    const dispose = jest.fn();
    for (let index = 0; index < 4; index++) {
      const key = `video:parked-${index}`;
      const session = postMediaSession<any>(key, dispose);
      session.value = { pause: jest.fn() };
      claimPostMedia(key, session, {})();
    }
    expect(dispose).toHaveBeenCalledTimes(2);
    const abandoned = postMediaSession<any>('video:abandoned', dispose);
    abandoned.value = { pause: jest.fn() };
    jest.advanceTimersByTime(2000);
    expect(abandoned.value).toBeNull();
    expect(dispose).toHaveBeenCalledTimes(5);
  });
});
