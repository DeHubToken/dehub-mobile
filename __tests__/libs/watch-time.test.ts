const mockSendWatchTime = jest.fn();
jest.mock('../../services/post-stats.service', () => ({ sendWatchTime: (body: unknown) => mockSendWatchTime(body) }));

import { trackPlayerWatchTime } from '../../libs/watch-time';

function fakePlayer() {
  return { playing: false, currentTime: 0, duration: 60 } as any;
}

describe('trackPlayerWatchTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSendWatchTime.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('counts real playback once per player and reports on pause', () => {
    const player = fakePlayer();
    const offA = trackPlayerWatchTime(player, 42);
    const offB = trackPlayerWatchTime(player, 42); // same player on a second screen
    player.playing = true;
    for (let i = 0; i <= 5; i++) {
      player.currentTime = i;
      jest.advanceTimersByTime(1000);
    }
    player.playing = false;
    jest.advanceTimersByTime(1000);
    expect(mockSendWatchTime).toHaveBeenCalledTimes(1);
    expect(mockSendWatchTime.mock.calls[0][0]).toMatchObject({ tokenId: 42, seconds: 5, position: 5, duration: 60 });
    offA();
    offB();
  });

  it('does not count a seek as watching', () => {
    const player = fakePlayer();
    const off = trackPlayerWatchTime(player, 7);
    player.playing = true;
    player.currentTime = 1;
    jest.advanceTimersByTime(1000);
    player.currentTime = 40; // jumped ahead
    jest.advanceTimersByTime(1000);
    player.currentTime = 41;
    jest.advanceTimersByTime(1000);
    off();
    expect(mockSendWatchTime).toHaveBeenCalledTimes(1);
    expect(mockSendWatchTime.mock.calls[0][0]).toMatchObject({ tokenId: 7, seconds: 1, position: 41 });
  });

  it('ignores ads and non-numeric ids', () => {
    const off = trackPlayerWatchTime(fakePlayer(), 'ad-1');
    off();
    expect(mockSendWatchTime).not.toHaveBeenCalled();
  });
});
