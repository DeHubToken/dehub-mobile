/**
 * Spotify player — state
 * ======================
 * One Spotify embed for the whole app (`SpotifyMiniPlayer`, mounted once in
 * App.tsx). Spotify's own player stays out of sight and our cards drive it:
 * a song plays right inside the post or grid tile you pressed Play on, with
 * its own progress bar, and only shows up in the corner when you ask for it
 * (the pop-out button) or when the card it is playing from leaves the screen,
 * so the music never plays with nothing on screen to stop it.
 *
 * Module scope, like radio and audio posts: cards live in long virtual lists,
 * the player lives outside every screen, and there is only ever one.
 *
 * Mirrors web's src/lib/spotify-player.ts.
 */

import { useContext, useEffect, useSyncExternalStore } from 'react';
import { NavigationContext } from '@react-navigation/native';
import type { SpotifyLink } from './spotify';

export interface SpotifyNowPlaying {
  link: SpotifyLink;
  title: string;
  subtitle: string;
  image: string | null;
}

export interface SpotifyPlayerState {
  current: SpotifyNowPlaying | null;
  /** From the embed's own events. Null until it reports. */
  isPaused: boolean | null;
  isBuffering: boolean;
  /** Asked for the corner player (pop-out button). */
  popout: boolean;
  /** A card showing the current song is on screen. */
  inView: boolean;
  /** The embed did not start on its own: it is shown so it can be tapped. */
  needsTap: boolean;
}

export interface SpotifyProgress {
  /** Milliseconds, as the embed last reported them. */
  position: number;
  duration: number;
  /** Date.now() of that report, to run the bar on between reports. */
  at: number;
  playing: boolean;
}

let state: SpotifyPlayerState = { current: null, isPaused: null, isBuffering: false, popout: false, inView: false, needsTap: false };
let progress: SpotifyProgress = { position: 0, duration: 0, at: 0, playing: false };
const listeners = new Set<() => void>();
const progressListeners = new Set<() => void>();
/** uri -> cards showing it that are on screen right now. */
const onScreen = new Map<string, number>();

interface Handlers { toggle: () => void; pause: () => void; seek: (seconds: number) => void }
let handlers: Handlers | null = null;

function emit(next: Partial<SpotifyPlayerState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function emitProgress(next: SpotifyProgress) {
  progress = next;
  progressListeners.forEach((listener) => listener());
}

const inViewFor = (uri: string | undefined) => !!uri && (onScreen.get(uri) ?? 0) > 0;

/**
 * Play a song. Pressing Play on the card that is already loaded resumes it.
 * `popout` starts it straight in the corner player.
 */
export function playSpotify(item: SpotifyNowPlaying, options: { popout?: boolean } = {}) {
  if (state.current?.link.uri === item.link.uri) {
    if (options.popout && !state.popout) emit({ popout: true });
    if (state.isPaused) handlers?.toggle();
    return;
  }
  emitProgress({ position: 0, duration: 0, at: 0, playing: false });
  emit({
    current: item,
    isPaused: null,
    isBuffering: true,
    popout: !!options.popout,
    inView: inViewFor(item.link.uri),
    needsTap: false,
  });
}

export function closeSpotify() {
  if (!state.current) return;
  emitProgress({ position: 0, duration: 0, at: 0, playing: false });
  emit({ current: null, isPaused: null, isBuffering: false, popout: false, inView: false, needsTap: false });
}

/** Pause or resume what is loaded. A no-op until the embed is ready. */
export function toggleSpotify() {
  handlers?.toggle();
}

export function pauseSpotify() {
  handlers?.pause();
}

/** Jump to a point in the song, 0..1 of its length. */
export function seekSpotify(ratio: number) {
  if (!handlers || !progress.duration) return;
  const ms = Math.max(0, Math.min(1, ratio)) * progress.duration;
  handlers.seek(ms / 1000);
  emitProgress({ ...progress, position: ms, at: Date.now() });
}

/** The card's pop-out button: into the corner, or back into the card. */
export function setSpotifyPopout(popout: boolean) {
  if (!state.current || state.popout === popout) return;
  emit({ popout });
}

export function setSpotifyNeedsTap(needsTap: boolean) {
  if (state.needsTap === needsTap) return;
  emit({ needsTap });
}

/** The engine reports what the embed says. */
export function reportSpotifyPlayback(update: { isPaused?: boolean; isBuffering?: boolean; position?: number; duration?: number }) {
  if (!state.current) return;
  const next: Partial<SpotifyPlayerState> = {};
  if (typeof update.isPaused === 'boolean' && update.isPaused !== state.isPaused) next.isPaused = update.isPaused;
  if (typeof update.isBuffering === 'boolean' && update.isBuffering !== state.isBuffering) next.isBuffering = update.isBuffering;
  if (update.isPaused === false && state.needsTap) next.needsTap = false;
  if (Object.keys(next).length) emit(next);
  if (typeof update.position === 'number' || typeof update.duration === 'number' || typeof update.isPaused === 'boolean') {
    emitProgress({
      position: typeof update.position === 'number' ? update.position : progress.position,
      duration: typeof update.duration === 'number' && update.duration > 0 ? update.duration : progress.duration,
      at: Date.now(),
      playing: typeof update.isPaused === 'boolean' ? !update.isPaused && !update.isBuffering : progress.playing,
    });
  }
}

export function setSpotifyHandlers(next: Handlers | null) {
  handlers = next;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function subscribeProgress(listener: () => void) {
  progressListeners.add(listener);
  return () => { progressListeners.delete(listener); };
}

export function getSpotifyPlayer(): SpotifyPlayerState {
  return state;
}

export function getSpotifyProgress(): SpotifyProgress {
  return progress;
}

export function useSpotifyPlayer(): SpotifyPlayerState {
  return useSyncExternalStore(subscribe, getSpotifyPlayer, getSpotifyPlayer);
}

/** Position and length. Only the playing card's bar reads this. */
export function useSpotifyProgress(): SpotifyProgress {
  return useSyncExternalStore(subscribeProgress, getSpotifyProgress, getSpotifyProgress);
}

/** Where the song is right now, between the embed's reports. */
export function spotifyPositionNow(p: SpotifyProgress = progress): number {
  if (!p.playing || !p.at) return p.position;
  const now = p.position + (Date.now() - p.at);
  return p.duration ? Math.min(p.duration, now) : now;
}

function markOnScreen(uri: string, delta: 1 | -1) {
  const count = Math.max(0, (onScreen.get(uri) ?? 0) + delta);
  if (count) onScreen.set(uri, count);
  else onScreen.delete(uri);
  if (state.current?.link.uri === uri) {
    const inView = count > 0;
    if (inView !== state.inView) emit({ inView });
  }
}

/**
 * A card that shows a Spotify link counts as on screen while it is mounted
 * on the screen in front. Leaving that screen (or the card being scrolled
 * out of the list) hands the song to the corner player, so it can be stopped
 * from anywhere; coming back takes it back into the card.
 */
export function useSpotifyOnScreen(uri: string) {
  // Not useNavigation: cards also render outside a screen (sheets, previews).
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    let visible = false;
    const set = (next: boolean) => {
      if (next === visible) return;
      visible = next;
      markOnScreen(uri, next ? 1 : -1);
    };
    set(navigation ? navigation.isFocused() : true);
    const offFocus = navigation?.addListener('focus', () => set(true));
    const offBlur = navigation?.addListener('blur', () => set(false));
    return () => {
      offFocus?.();
      offBlur?.();
      set(false);
    };
  }, [navigation, uri]);
}
