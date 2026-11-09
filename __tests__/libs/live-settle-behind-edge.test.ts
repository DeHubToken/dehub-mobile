/**
 * Android lives stalled every second or two from a phone far from the server:
 * ExoPlayer sat on the newest 0.2s parts and fetched them one round trip at a
 * time. After the first stall the shared live player now settles a few seconds
 * behind the edge, once, so it plays whole segments from then on.
 */
jest.mock('expo-video', () => ({ createVideoPlayer: jest.fn() }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

import { Platform } from 'react-native';
import {
  PLACEHOLDER_WINDOW_SEC,
  SETTLED_LIVE_OFFSET_SEC,
  markBigEventLive,
  settleBehindLiveOnStall,
  settleTarget,
} from '../../libs/sharedLivePlayer';

type Listener = (event: any) => void;

/** Just enough of expo-video's player: events, a position, a window. */
class FakeLivePlayer {
  duration = 0;
  seeks: number[] = [];
  released = false;
  private position = 0;
  private listeners = new Map<string, Set<Listener>>();

  get currentTime(): number {
    if (this.released) throw new Error('released');
    return this.position;
  }

  set currentTime(value: number) {
    this.seeks.push(value);
    this.position = value;
  }

  addListener(name: string, listener: Listener) {
    const set = this.listeners.get(name) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(name, set);
    return { remove: () => set.delete(listener) };
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }

  /** Where the playhead is, and how long the playlist window was when last ready. */
  at(position: number, windowDuration: number): this {
    this.position = position;
    this.duration = windowDuration;
    return this;
  }

  plays(): this {
    this.listeners.get('playingChange')?.forEach((fn) => fn({ isPlaying: true }));
    return this;
  }

  stalls(): this {
    this.listeners.get('statusChange')?.forEach((fn) => fn({ status: 'loading' }));
    return this;
  }

  reloads(): this {
    this.listeners.get('sourceChange')?.forEach((fn) => fn({}));
    return this;
  }
}

// A stream that has been on air a while: 16 two-second segments in the window
// plus the parts of the one being written.
const STEADY_WINDOW = 33;

function watch(url = 'https://live.dehub.io/a/index.m3u8') {
  const player = new FakeLivePlayer();
  const unwatch = settleBehindLiveOnStall(player as any, url);
  return { player, unwatch };
}

describe('settleTarget', () => {
  it('sends a stall at the live edge six seconds back', () => {
    expect(settleTarget(32.6, STEADY_WINDOW, SETTLED_LIVE_OFFSET_SEC)).toBe(27);
  });

  it('leaves a stall that is already well behind live to the player', () => {
    expect(settleTarget(27.5, STEADY_WINDOW, SETTLED_LIVE_OFFSET_SEC)).toBeNull();
  });

  it('never lands in the placeholders at the start of a fresh stream', () => {
    // Seven placeholders and one real segment: nowhere real to go yet.
    expect(settleTarget(15.6, 16.1, SETTLED_LIVE_OFFSET_SEC)).toBeNull();
    // Three real segments: the earliest real picture, about six seconds back.
    expect(settleTarget(19.6, 20.1, SETTLED_LIVE_OFFSET_SEC)).toBe(PLACEHOLDER_WINDOW_SEC);
  });

  it('does not seek for less than a second of gain', () => {
    expect(settleTarget(15.0, 19.0, SETTLED_LIVE_OFFSET_SEC)).toBeNull();
  });

  it('ignores a window it cannot read', () => {
    expect(settleTarget(Number.NaN, STEADY_WINDOW, SETTLED_LIVE_OFFSET_SEC)).toBeNull();
    expect(settleTarget(1, 0, SETTLED_LIVE_OFFSET_SEC)).toBeNull();
    expect(settleTarget(1, Number.POSITIVE_INFINITY, SETTLED_LIVE_OFFSET_SEC)).toBeNull();
  });
});

describe('settling a stalled live on Android', () => {
  afterEach(() => {
    (Platform as { OS: string }).OS = 'android';
  });

  it('settles once, at the first stall near the edge', () => {
    const { player } = watch();
    player.at(32.6, STEADY_WINDOW).plays().stalls();
    expect(player.seeks).toEqual([27]);

    // Our own seek buffers, and later stalls are the network's.
    player.stalls();
    player.at(32.8, STEADY_WINDOW).stalls();
    expect(player.seeks).toEqual([27]);
  });

  it('does not treat buffering before the first frame as a stall', () => {
    const { player } = watch();
    player.at(32.6, STEADY_WINDOW).stalls();
    expect(player.seeks).toEqual([]);
  });

  it('waits for a stall at the edge when the first one was the network', () => {
    const { player } = watch();
    player.at(26, STEADY_WINDOW).plays().stalls();
    expect(player.seeks).toEqual([]);
    player.at(32.7, STEADY_WINDOW).stalls();
    expect(player.seeks).toEqual([27]);
  });

  it('settles again after the stream is reloaded at the edge', () => {
    const { player } = watch();
    player.at(32.6, STEADY_WINDOW).plays().stalls();
    player.reloads().at(32.5, STEADY_WINDOW).plays().stalls();
    expect(player.seeks).toEqual([27, 27]);
  });

  it('plays a big event about twenty seconds back', () => {
    const url = 'https://live.dehub.io/event/index.m3u8';
    markBigEventLive(url, true);
    const { player } = watch(url);
    player.at(33.6, 34).plays().stalls();
    expect(player.seeks).toEqual([PLACEHOLDER_WINDOW_SEC]);
    markBigEventLive(url, false);
  });

  it('survives a player released under it', () => {
    const { player } = watch();
    player.at(32.6, STEADY_WINDOW).plays();
    player.released = true;
    expect(() => player.stalls()).not.toThrow();
    expect(player.seeks).toEqual([]);
  });

  it('stops listening when unwatched', () => {
    const { player, unwatch } = watch();
    expect(player.listenerCount()).toBe(3);
    unwatch();
    expect(player.listenerCount()).toBe(0);
  });

  it('leaves iOS alone', () => {
    (Platform as { OS: string }).OS = 'ios';
    const { player } = watch();
    expect(player.listenerCount()).toBe(0);
  });
});
