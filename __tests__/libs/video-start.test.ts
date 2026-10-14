import { flushVideoPlayIntent, requestVideoPlayback, rewindFinishedVideo } from '../../libs/video-start';

describe('video startup', () => {
  it('rewinds an ended feed player before the viewer resumes it', () => {
    const player = { playing: false, duration: 23.78, currentTime: 23.78 };
    rewindFinishedVideo(player);
    expect(player.currentTime).toBe(0);
  });

  it.each([
    { playing: true, duration: 24, currentTime: 24 },
    { playing: false, duration: 24, currentTime: 12 },
    { playing: false, duration: 0, currentTime: 0 },
    { playing: false, duration: Infinity, currentTime: 100 },
  ])('preserves a running or unfinished playhead: %o', (player) => {
    const position = player.currentTime;
    rewindFinishedVideo(player);
    expect(player.currentTime).toBe(position);
  });
  it('replays a loading request when the native item becomes ready, then consumes it', () => {
    const pending = { current: true };
    const play = jest.fn();
    flushVideoPlayIntent(pending, false, play);
    expect(play).toHaveBeenCalledTimes(1);
    flushVideoPlayIntent(pending, true, play);
    expect(play).toHaveBeenCalledTimes(2);
    flushVideoPlayIntent(pending, true, play);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('does not restart a canceled loading request when readiness arrives', () => {
    const pending = { current: true };
    const play = jest.fn();
    flushVideoPlayIntent(pending, false, play);
    pending.current = false;
    flushVideoPlayIntent(pending, true, play);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('submits play while iOS is loading instead of waiting for an event', () => {
    const player = {
      status: 'loading' as const,
      play: jest.fn(),
      replaceAsync: jest.fn(),
    };
    requestVideoPlayback(player, 'clip.mp4', () => true);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.replaceAsync).not.toHaveBeenCalled();
  });

  it('does not start a player whose surface lost playback permission', async () => {
    const player = { status: 'readyToPlay' as const, play: jest.fn(), replaceAsync: jest.fn() };
    await requestVideoPlayback(player, 'clip.mp4', () => false);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('reloads a failed source on a new play request', async () => {
    const player = { status: 'error' as const, play: jest.fn(), replaceAsync: jest.fn().mockResolvedValue(undefined) };
    await requestVideoPlayback(player, 'clip.mp4', () => true);
    expect(player.replaceAsync).toHaveBeenCalledWith('clip.mp4');
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('does not restart a retry after scrolling away or handing the player off', async () => {
    let finish!: () => void;
    let allowed = true;
    const player = {
      status: 'error' as const,
      play: jest.fn(),
      replaceAsync: jest.fn(() => new Promise<void>(resolve => { finish = resolve; })),
    };
    const request = requestVideoPlayback(player, 'clip.mp4', () => allowed);
    allowed = false;
    finish();
    await request;
    expect(player.play).not.toHaveBeenCalled();
  });

  it('propagates a failed reload so the caller can stop the loading state', async () => {
    const error = new Error('offline');
    const player = { status: 'error' as const, play: jest.fn(), replaceAsync: jest.fn().mockRejectedValue(error) };
    await expect(requestVideoPlayback(player, 'clip.mp4', () => true)).rejects.toBe(error);
    expect(player.play).not.toHaveBeenCalled();
  });
});
