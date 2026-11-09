/**
 * Spotify corner player — state
 * =============================
 * One Spotify embed for the whole app. A card's Play button hands its link
 * here and `SpotifyMiniPlayer` (mounted once in App.tsx) plays it, so the
 * music keeps going while you scroll and change pages. Cards read the same
 * state to show which one is playing.
 *
 * Module scope, like radio and audio posts: cards live in long virtual lists,
 * the player lives outside every route, and there is only ever one.
 */

import { useSyncExternalStore } from 'react';
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
}

let state: SpotifyPlayerState = { current: null, isPaused: null };
const listeners = new Set<() => void>();
let toggleHandler: (() => void) | null = null;

function emit(next: SpotifyPlayerState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function playSpotify(item: SpotifyNowPlaying) {
  if (state.current?.link.uri === item.link.uri) {
    if (state.isPaused) toggleHandler?.();
    return;
  }
  emit({ current: item, isPaused: null });
}

export function closeSpotify() {
  if (!state.current) return;
  emit({ current: null, isPaused: null });
}

/** Pause or resume what is loaded. A no-op until the embed is ready. */
export function toggleSpotify() {
  toggleHandler?.();
}

/** The mini player reports pause state and offers its toggle. */
export function reportSpotifyPaused(isPaused: boolean) {
  if (!state.current || state.isPaused === isPaused) return;
  emit({ ...state, isPaused });
}

export function setSpotifyToggleHandler(handler: (() => void) | null) {
  toggleHandler = handler;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getSpotifyPlayer(): SpotifyPlayerState {
  return state;
}

export function useSpotifyPlayer(): SpotifyPlayerState {
  return useSyncExternalStore(subscribe, getSpotifyPlayer, getSpotifyPlayer);
}
