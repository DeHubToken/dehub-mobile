import { parseDehubLink } from './dehub-links';

/**
 * A DeHub page the app has its own screen for, as a dehub:// link, or null.
 *
 * iOS never hands an app its own universal link: opened from inside the app,
 * dehub.io/app/governance/<id> went to Safari instead of the proposal screen.
 * The custom scheme always comes back to the app, and the router opens any
 * /app page it has no screen for in the in-app browser, so nothing dead-ends.
 */
export function inAppDehubUrl(rawUrl: string): string | null {
  const match = parseDehubLink(rawUrl);
  if (match?.kind === 'proposal') return `dehub://app/governance/${match.proposalId}`;
  const own = rawUrl.match(/^(?:https?:\/\/)?(?:www\.)?dehub\.io\/(app(?:[/?#].*)?)$/i);
  return own ? `dehub://${own[1]}` : null;
}
