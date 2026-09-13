import { requestAudioFocus, revokeAudioFocus } from "../../libs/audioFocus";
import { claimLockScreen, releaseLockScreen } from "../../libs/lockScreen";
import {
  getAudioPostPlaybackState,
  popOutAudioPost,
  seekAudioPost,
  stopAudioPost,
  takeBackAudioPost,
  toggleAudioPost,
} from "../../libs/audio-post-playback";

const mockCreateAudioPlayer = jest.fn();

jest.mock("expo-audio", () => ({
  createAudioPlayer: (...args: unknown[]) => mockCreateAudioPlayer(...args),
}));
jest.mock("../../libs/audioSession", () => ({
  configureForBackgroundPlayback: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../libs/lockScreen", () => ({
  claimLockScreen: jest.fn(),
  releaseLockScreen: jest.fn(),
}));
jest.mock("../../libs/previewRegistry", () => ({
  stopActivePreview: jest.fn(),
}));
jest.mock("../../libs/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

type Status = {
  isLoaded: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  didJustFinish: boolean;
};

/** Enough of an expo-audio player for the engine: state, transport, one event. */
function fakePlayer(over: Partial<Record<string, unknown>> = {}) {
  const listeners = new Set<(s: Status) => void>();
  const player = {
    isLoaded: true,
    duration: 100,
    currentTime: 25,
    playing: true,
    volume: 1,
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined),
    addListener: jest.fn((_name: string, fn: (s: Status) => void) => {
      listeners.add(fn);
      return { remove: () => listeners.delete(fn) };
    }),
    listenerCount: () => listeners.size,
    tick: (patch: Partial<Status> = {}) => {
      const status: Status = {
        isLoaded: true,
        playing: player.playing,
        currentTime: player.currentTime,
        duration: player.duration,
        didJustFinish: false,
        ...patch,
      };
      for (const fn of listeners) fn(status);
    },
    ...over,
  };
  return player;
}

const track = {
  tokenId: "42",
  audioUrl: "https://cdn.example/42.mp3",
  title: "Late night",
  artist: "nick",
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("libs/audio-post-playback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stopAudioPost();
    revokeAudioFocus();
  });

  it("adopts the card's player as-is and starts it under its own lock screen claim", async () => {
    const player = fakePlayer({ playing: false });
    popOutAudioPost({ track, player: player as any, volume: 0.7 });
    await flush();

    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.volume).toBe(0.7);
    expect(player.listenerCount()).toBe(1);
    expect(claimLockScreen).toHaveBeenCalledWith(
      "audio-post-popout",
      player,
      expect.objectContaining({ title: "Late night", artist: "nick" }),
      expect.objectContaining({ showSeekForward: true }),
    );

    const state = getAudioPostPlaybackState();
    expect(state.tokenId).toBe("42");
    expect(state.isPlaying).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.progress).toBeCloseTo(0.25);
    expect(state.duration).toBe(100);
  });

  it("creates its own player when the card never made one, starting where the card was", async () => {
    const created = fakePlayer({ isLoaded: false, duration: 0, currentTime: 0, playing: false });
    mockCreateAudioPlayer.mockReturnValueOnce(created);

    popOutAudioPost({ track, player: null, volume: 1, startAt: 0.4 });
    await flush();

    expect(mockCreateAudioPlayer).toHaveBeenCalledWith({ uri: track.audioUrl }, { updateInterval: 100 });
    expect(getAudioPostPlaybackState().isLoading).toBe(true);
    expect(getAudioPostPlaybackState().progress).toBeCloseTo(0.4);

    // The seek waits for a duration, then lands once.
    created.isLoaded = true;
    created.duration = 200;
    created.tick({ duration: 200 });
    expect(created.seekTo).toHaveBeenCalledWith(80);
    created.tick({ duration: 200 });
    expect(created.seekTo).toHaveBeenCalledTimes(1);
    expect(getAudioPostPlaybackState().isLoading).toBe(false);
  });

  it("stops and closes when something else takes the audio focus", async () => {
    const player = fakePlayer();
    popOutAudioPost({ track, player: player as any, volume: 1 });
    await flush();

    requestAudioFocus(() => {});

    expect(player.pause).toHaveBeenCalled();
    expect(player.remove).toHaveBeenCalled();
    expect(releaseLockScreen).toHaveBeenCalledWith("audio-post-popout");
    expect(getAudioPostPlaybackState().tokenId).toBeNull();
  });

  it("hands the same player back to the card and lets go of it completely", async () => {
    const player = fakePlayer();
    popOutAudioPost({ track, player: player as any, volume: 1 });
    await flush();

    const returned = takeBackAudioPost("42");

    expect(returned).toBe(player);
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.remove).not.toHaveBeenCalled();
    expect(player.listenerCount()).toBe(0);
    expect(getAudioPostPlaybackState().tokenId).toBeNull();
    // Nothing left behind to act on: a later stop is a no-op on the card's player.
    stopAudioPost();
    expect(player.remove).not.toHaveBeenCalled();
  });

  it("refuses to hand back a post it does not hold", async () => {
    const player = fakePlayer();
    popOutAudioPost({ track, player: player as any, volume: 1 });
    await flush();

    expect(takeBackAudioPost("7")).toBeNull();
    expect(getAudioPostPlaybackState().tokenId).toBe("42");
  });

  it("rests at the end of the track instead of closing", async () => {
    const player = fakePlayer();
    popOutAudioPost({ track, player: player as any, volume: 1 });
    await flush();

    player.tick({ didJustFinish: true, currentTime: 100 });

    const state = getAudioPostPlaybackState();
    expect(state.tokenId).toBe("42");
    expect(state.isPlaying).toBe(false);
    expect(state.progress).toBe(1);
    expect(player.remove).not.toHaveBeenCalled();
  });

  it("believes a lock-screen pause only after several status ticks agree", async () => {
    const player = fakePlayer();
    popOutAudioPost({ track, player: player as any, volume: 1 });
    await flush();

    player.playing = false;
    player.tick();
    player.tick();
    player.tick();
    expect(getAudioPostPlaybackState().isPlaying).toBe(true);
    player.tick();
    expect(getAudioPostPlaybackState().isPlaying).toBe(false);
  });

  it("seeks through the player and holds the published position until it settles", async () => {
    const player = fakePlayer();
    popOutAudioPost({ track, player: player as any, volume: 1 });
    await flush();

    seekAudioPost(0.5);
    expect(player.seekTo).toHaveBeenCalledWith(50);
    expect(getAudioPostPlaybackState().progress).toBe(0.5);
    // A tick still reporting the old position must not drag the bar back.
    player.tick({ currentTime: 25 });
    expect(getAudioPostPlaybackState().progress).toBe(0.5);
  });

  it("toggles pause and resume, keeping the player and the panel", async () => {
    const player = fakePlayer();
    popOutAudioPost({ track, player: player as any, volume: 1 });
    await flush();

    toggleAudioPost();
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(getAudioPostPlaybackState().isPlaying).toBe(false);
    expect(getAudioPostPlaybackState().tokenId).toBe("42");

    toggleAudioPost();
    await flush();
    expect(player.play).toHaveBeenCalledTimes(2);
    expect(getAudioPostPlaybackState().isPlaying).toBe(true);
  });
});
