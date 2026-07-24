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
