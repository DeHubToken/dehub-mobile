import {
  requestAudioFocus, releaseAudioFocus, revokeAudioFocus,
} from '../../libs/audioFocus';

describe('libs/audioFocus', () => {
  afterEach(() => {
    // Clean up by revoking all
    revokeAudioFocus();
  });

  it('calls previous holder stop when new holder requests focus', () => {
    const stop1 = jest.fn();
    const stop2 = jest.fn();

    requestAudioFocus(stop1);
    requestAudioFocus(stop2);

    expect(stop1).toHaveBeenCalledTimes(1);
    expect(stop2).not.toHaveBeenCalled();
  });

  it('does not call stop on itself when re-requesting', () => {
    const stop = jest.fn();
    requestAudioFocus(stop);
    requestAudioFocus(stop);
    expect(stop).not.toHaveBeenCalled();
  });

  it('release only works for current holder', () => {
    const stop1 = jest.fn();
    const stop2 = jest.fn();

    requestAudioFocus(stop1);
    releaseAudioFocus(stop2); // not the holder

    // stop1 still holds, so requesting with stop2 should call stop1
    requestAudioFocus(stop2);
    expect(stop1).toHaveBeenCalledTimes(1);
  });

  it('release clears holder so no stop is called on next request', () => {
    const stop1 = jest.fn();
    requestAudioFocus(stop1);
    releaseAudioFocus(stop1);

    const stop2 = jest.fn();
    requestAudioFocus(stop2);
    expect(stop1).not.toHaveBeenCalled();
  });

  it('revokeAudioFocus calls and clears the current holder', () => {
    const stop = jest.fn();
    requestAudioFocus(stop);
    revokeAudioFocus();
    expect(stop).toHaveBeenCalledTimes(1);

    // Second revoke should not call again
    revokeAudioFocus();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
