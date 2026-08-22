/**
 * Radio playback
 * ==============
 * One station at a time, app-wide — the mobile counterpart of web's
 * `use-radio-player`. Module scope rather than a context for the same reason
 * the stage engine is: station cards are rendered in carousels and long lists,
 * every one of them needs to know whether it is the station playing, and two
 * streams talking over each other is never what was wanted.
 *
 * A live stream has no duration and no position, so there is nothing to scrub
 * and nothing to publish but which station, and whether it is playing.
 *
 * Playback deliberately survives leaving the Music feed — RadioMiniPlayer is
 * mounted app-wide and keeps it reachable and stoppable, exactly like web.
 *
 * @module libs/radio-player
 */

import { createAudioPlayer, type AudioPlayer, type AudioStatus } from "expo-audio";
import { useEffect, useState } from "react";

import { releaseAudioFocus, requestAudioFocus } from "./audioFocus";
import { configureForPlayback } from "./audioSession";
import { createLogger } from "./logger";
import { toastError } from "./toast";
import { registerStationClick, type RadioStation } from "./radio-browser";

const log = createLogger("radio-player");

export interface RadioPlayerState {
  station: RadioStation | null;
  isPlaying: boolean;
  isLoading: boolean;
}

const IDLE: RadioPlayerState = { station: null, isPlaying: false, isLoading: false };

let state: RadioPlayerState = IDLE;
const subscribers = new Set<(next: RadioPlayerState) => void>();

function publish(patch: Partial<RadioPlayerState>) {
  const next = { ...state, ...patch };
  if (
    next.station === state.station &&
    next.isPlaying === state.isPlaying &&
    next.isLoading === state.isLoading
  ) {
    return;
  }
  state = next;
  for (const notify of subscribers) notify(state);
}

let player: AudioPlayer | null = null;
/**
 * A stream that never reaches "loaded" is a dead URL — radio-browser's
 * `hidebroken` is a snapshot, not a guarantee. Without this the card sat on a
 * spinner forever.
 */
let loadTimeout: ReturnType<typeof setTimeout> | null = null;
const LOAD_TIMEOUT_MS = 20_000;

function onStatus(status: AudioStatus) {
  if (!state.station) return;
  if (status.isLoaded && state.isLoading) {
    clearLoadTimeout();
    publish({ isLoading: false });
  }
  // Unlike a recording, `playing` is the whole truth here: there is no pause
  // that keeps a position, so what the player reports is what the card shows.
  publish({ isPlaying: status.playing });
}

function clearLoadTimeout() {
  if (loadTimeout !== null) {
    clearTimeout(loadTimeout);
    loadTimeout = null;
  }
}

function ensurePlayer(): AudioPlayer {
  if (player) return player;
  const p = createAudioPlayer(null, { updateInterval: 500 });
  p.addListener("playbackStatusUpdate", onStatus);
  player = p;
  return p;
}

/** Stop the stream and drop the source. */
export function stopRadio() {
  clearLoadTimeout();
  if (player) {
    try {
      player.pause();
      player.replace(null);
    } catch (e) {
      log.warn("Failed to release the station", e);
    }
  }
  releaseAudioFocus(stopRadio);
  publish(IDLE);
}

/** Tune in. Replaces whatever was playing, radio or otherwise. */
export function playRadioStation(station: RadioStation) {
  const url = station.url_resolved || station.url;
  if (!url) {
    toastError(null, "That station has no stream to play");
    return;
  }

  requestAudioFocus(stopRadio);
  const p = ensurePlayer();
  try {
    p.pause();
  } catch {}

  publish({ station, isPlaying: false, isLoading: true });

  clearLoadTimeout();
  loadTimeout = setTimeout(() => {
    loadTimeout = null;
    if (state.station?.stationuuid !== station.stationuuid || !state.isLoading) return;
    toastError(null, `${station.name} is not responding`);
    stopRadio();
  }, LOAD_TIMEOUT_MS);

  void (async () => {
    try {
      await configureForPlayback();
      p.replace({ uri: url });
      p.play();
    } catch (e) {
      log.error("Could not start the station", e);
      toastError(e, "That station could not be played");
      stopRadio();
    }
  })();

  void registerStationClick(station.stationuuid);
}

/** Play/pause the station that is loaded, or tune into a new one. */
export function toggleRadioStation(station: RadioStation) {
  if (state.station?.stationuuid !== station.stationuuid) {
    playRadioStation(station);
    return;
  }
  if (!player) return;
  // A stream has no position to hold, so pausing and resuming is really
  // stopping and reconnecting — but keeping the station loaded means the card
  // stays lit and one tap brings it back.
  if (state.isPlaying) {
    try {
      player.pause();
    } catch (e) {
      log.warn("Pause failed", e);
    }
    publish({ isPlaying: false });
  } else {
    requestAudioFocus(stopRadio);
    try {
      player.play();
    } catch (e) {
      log.warn("Resume failed", e);
    }
  }
}

/** Subscribe to the shared station. */
export function useRadioPlayer(): RadioPlayerState {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    setSnapshot(state);
    subscribers.add(setSnapshot);
    return () => {
      subscribers.delete(setSnapshot);
    };
  }, []);
  return snapshot;
}
