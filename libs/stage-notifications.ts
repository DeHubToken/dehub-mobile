/**
 * Stage notification copy and routing (mobile)
 * ============================================
 * Deliberately a mirror of dehubweb's `src/lib/stage-notifications.ts`. The two
 * clients raise the same alerts about the same rows, and a user with both
 * installed sees them side by side — so the sentences are kept identical on
 * purpose, and a change to one file belongs in the other.
 *
 * `content` on these notification rows is empty by convention, so the sentence
 * is composed from the type, the actor and the title rather than read out of
 * the database.
 */

import type { StageDeepLink } from "./deeplink.events";

/**
 * Turn a notification's `reference_id` into something the stage opener can use.
 *
 * The column carries `audio_spaces.short_id` when the stage has one and the
 * uuid when it does not, so the two are told apart by whether the value is all
 * digits — the same test the deep-link parser and web's StageDeepLinkPage use.
 * An empty object means "open Stages", which is the honest fallback when the
 * stage is real but unidentified.
 */
export function stageDeepLinkFor(referenceId?: string | null): StageDeepLink {
  if (!referenceId) return {};
  return /^\d+$/.test(referenceId) ? { shortId: Number(referenceId) } : { id: referenceId };
}

/** "@alice's stage "Town Hall" is live — tap to listen in" */
export function stageLiveSentence(actorName: string, title?: string | null): string {
  return title
    ? `${actorName}'s stage "${title}" is live — tap to listen in`
    : `${actorName} is live on a stage`;
}

/** ""Town Hall" is starting soon" */
export function stageReminderSentence(title?: string | null): string {
  return title ? `"${title}" is starting soon` : "A stage you set a reminder for is starting soon";
}
