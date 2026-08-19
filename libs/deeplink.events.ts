/**
 * Lightweight event bus for deep-link side-effects that need access to
 * React context (e.g. opening the profile bottom-sheet from a URL).
 *
 * `getStateFromPath` runs outside of React, so it can't call hooks.
 * Instead it pushes the username here and a hook inside the context tree
 * picks it up.
 */

type ProfileHandler = (username: string) => void;

let _handler: ProfileHandler | null = null;

/** Called from a React context (UserProfileSheetProvider) to register a handler. */
export function setProfileDeepLinkHandler(handler: ProfileHandler | null) {
  _handler = handler;
}

/** Called from getStateFromPath (or subscribe) when a /:username link is detected. */
export function emitProfileDeepLink(username: string) {
  if (_handler) {
    // Slight delay so navigation state settles first
    setTimeout(() => _handler?.(username), 350);
  }
}

/**
 * A stage invite link, in either shape the web app hands out: `/stage/<uuid>`
 * (the original) or `/stages/<n>` (the short share form backed by
 * audio_spaces.short_id). Exactly one of the two ids is set; neither means
 * "just open Stages", which is what a bare /stages link should do.
 *
 * Stages are modals here rather than a screen, so React Navigation has nothing
 * to route to — the same reason profiles go through this bus.
 */
export type StageDeepLink = { id?: string; shortId?: number };

type StageHandler = (link: StageDeepLink) => void;

let _stageHandler: StageHandler | null = null;
/**
 * A link that arrives before the handler registers — a cold start, where the
 * URL is delivered while the provider tree is still mounting — is parked here
 * and replayed on the next registration. Without it, opening the app FROM a
 * stage link would do nothing, while tapping one with the app already running
 * worked; that difference is exactly the case an invite link is for.
 */
let _pendingStageLink: StageDeepLink | null = null;

/** Called from StagesModalsHost, which sits inside StageProvider. */
export function setStageDeepLinkHandler(handler: StageHandler | null) {
  _stageHandler = handler;
  if (handler && _pendingStageLink) {
    const pending = _pendingStageLink;
    _pendingStageLink = null;
    setTimeout(() => handler(pending), 350);
  }
}

/** Called from getStateFromPath when a stage invite link is detected. */
export function emitStageDeepLink(link: StageDeepLink) {
  if (_stageHandler) {
    setTimeout(() => _stageHandler?.(link), 350);
  } else {
    _pendingStageLink = link;
  }
}
