import { requestVideoPlayback } from '../../libs/video-start';

describe('video startup', () => {
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
