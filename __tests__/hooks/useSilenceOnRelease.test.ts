import { useEffect } from 'react';
import { renderHook } from '@testing-library/react-native';
import { useSilenceOnRelease } from '../../hooks/useSilenceOnRelease';

/**
 * A feed video scrolled off kept playing its sound: useVideoPlayer released
 * the player in an effect cleanup before the card's own pause ran, so the
 * pause threw on the released player and never landed.
 */
function fakePlayer() {
  const player = {
    released: false,
    muted: false,
    pausedWhileLive: false,
    pause: jest.fn(() => {
      if (player.released) throw new Error('Cannot use shared object that was already released');
      player.pausedWhileLive = true;
    }),
  };
  return player;
}

/** Stands in for useVideoPlayer: releases in a passive effect cleanup. */
function useReleasingPlayer(player: ReturnType<typeof fakePlayer>) {
  useEffect(() => () => {
    player.released = true;
  }, [player]);
  return player;
}

describe('a feed player is silenced before it is released', () => {
  it('pauses and mutes on unmount, ahead of the release', () => {
    const player = fakePlayer();
    const { unmount } = renderHook(() => {
      const p = useReleasingPlayer(player);
      useSilenceOnRelease(p as never);
    });
    unmount();
    expect(player.pausedWhileLive).toBe(true);
    expect(player.muted).toBe(true);
    expect(player.released).toBe(true);
  });

  it('silences the old player when the source swap replaces it', () => {
    const first = fakePlayer();
    const second = fakePlayer();
    const { rerender } = renderHook(
      ({ p }: { p: ReturnType<typeof fakePlayer> }) => {
        useReleasingPlayer(p);
        useSilenceOnRelease(p as never);
      },
      { initialProps: { p: first } },
    );
    rerender({ p: second });
    expect(first.pausedWhileLive).toBe(true);
    expect(second.pause).not.toHaveBeenCalled();
  });

  it('does nothing without a player', () => {
    const { unmount } = renderHook(() => useSilenceOnRelease(null));
    expect(() => unmount()).not.toThrow();
  });
});
