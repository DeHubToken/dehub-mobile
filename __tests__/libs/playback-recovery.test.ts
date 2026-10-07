import { createPlaybackRecovery, playbackSourceIdentity } from '../../libs/playback-recovery';

describe('bounded playback recovery', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
  const setup = () => {
    const options = { allowed: jest.fn(() => true), play: jest.fn((_reload: boolean, _allowed: () => boolean) => Promise.resolve()), pause: jest.fn(), changed: jest.fn(), report: jest.fn() };
    return { options, recovery: createPlaybackRecovery(options) };
  };
  it('reloads once if a play request never produces a frame, then offers retry', async () => {
    const { options, recovery } = setup();
    recovery.start();
    await Promise.resolve();
    jest.advanceTimersByTime(10_000);
    expect(options.play.mock.calls.map(call => call[0])).toEqual([false, true]);
    await Promise.resolve();
    jest.advanceTimersByTime(10_000);
    expect(recovery.phase).toBe('failed');
    expect(options.pause).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60_000);
    expect(options.play).toHaveBeenCalledTimes(2);
    recovery.start();
    expect(options.play).toHaveBeenCalledTimes(3);
    expect(options.play.mock.calls[2][0]).toBe(true);
  });
  it('recovers a source error and reports the outcome without resetting the budget', async () => {
    const { options, recovery } = setup();
    recovery.start();
    recovery.fail('http-401');
    recovery.fail('duplicate-detach-error');
    expect(options.play).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    recovery.progress();
    expect(recovery.phase).toBe('playing');
    expect(options.report).toHaveBeenCalledWith('recovered', expect.objectContaining({ retries: 1 }));
    recovery.waiting();
    jest.advanceTimersByTime(10_000);
    expect(recovery.phase).toBe('failed');
    expect(options.play).toHaveBeenCalledTimes(2);
  });
  it('invalidates an asynchronous retry on pause or navigation away', () => {
    const { options, recovery } = setup();
    recovery.start();
    recovery.fail();
    const allowed = options.play.mock.calls[1][1];
    expect(allowed()).toBe(true);
    recovery.stop();
    expect(allowed()).toBe(false);
    jest.advanceTimersByTime(60_000);
    expect(options.play).toHaveBeenCalledTimes(2);
    expect(recovery.phase).toBe('idle');
  });
  it('does not reload an offscreen or gated player', () => {
    const { options, recovery } = setup();
    recovery.start();
    options.allowed.mockReturnValue(false);
    jest.advanceTimersByTime(10_000);
    expect(options.play).toHaveBeenCalledTimes(1);
    expect(recovery.phase).toBe('idle');
  });
  it('turns autoplay denial into a tap, without a network retry', async () => {
    const { options, recovery } = setup();
    options.play.mockRejectedValue({ name: 'NotAllowedError' });
    recovery.start();
    await Promise.resolve();
    expect(recovery.phase).toBe('blocked');
    jest.advanceTimersByTime(60_000);
    expect(options.play).toHaveBeenCalledTimes(1);
  });
  it('does not time out a playing video or keep timers after stopping', () => {
    const { options, recovery } = setup();
    recovery.start();
    recovery.progress();
    jest.advanceTimersByTime(60_000);
    expect(options.play).toHaveBeenCalledTimes(1);
    recovery.waiting();
    recovery.stop();
    expect(jest.getTimerCount()).toBe(0);
  });
  it('removes signatures and credentials from diagnostics', () => {
    expect(playbackSourceIdentity('https://name:secret@cdn.test/42.mp4?token=secret#x')).toBe('https://cdn.test/42.mp4');
  });
});
