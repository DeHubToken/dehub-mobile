/**
 * Post Reactions
 * ==============
 * Mirror of the API's `config/reactions.ts`. Keep the three copies in sync:
 *   - backend : config/reactions.ts        (source of truth)
 *   - web     : dehubweb/src/lib/reactions.ts
 *   - mobile  : libs/reactions.ts          (this file)
 *
 * WHY REACTIONS AND LIKES COEXIST
 * The API never migrated its boolean vote. Each reaction has a POLARITY, and
 * that polarity is what `totalVotes.for` / `totalVotes.against` and
 * `isLiked` / `isDisliked` keep counting:
 *
 *   positive → isLiked    (like, love, respect, hot, lol, sad, cry)
 *   negative → isDisliked (dislike, poo)
 *
 * So `likeCount` still means "how many people reacted positively" — it does not
 * turn into a like-only count when someone loves a post. The per-reaction split
 * lives in `reactionCounts` and only decides which icon leads on a card.
 */

/** Every reaction, in picker order — also the deterministic tiebreak order. */
export const POST_REACTIONS = [
  "like",
  "love",
  "respect",
  "hot",
  "lol",
  "sad",
  "cry",
  "dislike",
  "poo",
] as const;

export type PostReaction = (typeof POST_REACTIONS)[number];

/** Reactions that land in `totalVotes.against` and light the thumbs-down. */
export const NEGATIVE_REACTIONS: readonly PostReaction[] = ["dislike", "poo"] as const;

export const DEFAULT_POSITIVE_REACTION: PostReaction = "like";
export const DEFAULT_NEGATIVE_REACTION: PostReaction = "dislike";

export interface ReactionMeta {
  key: PostReaction;
  label: string;
  emoji: string;
  positive: boolean;
}

const META: Record<PostReaction, ReactionMeta> = {
  like:    { key: "like",    label: "Like",    emoji: "👍", positive: true },
  love:    { key: "love",    label: "Love",    emoji: "❤️", positive: true },
  respect: { key: "respect", label: "Respect", emoji: "✊", positive: true },
  hot:     { key: "hot",     label: "Hot",     emoji: "🔥", positive: true },
  lol:     { key: "lol",     label: "LOL",     emoji: "😂", positive: true },
  sad:     { key: "sad",     label: "Sad",     emoji: "😢", positive: true },
  cry:     { key: "cry",     label: "Crying",  emoji: "😭", positive: true },
  dislike: { key: "dislike", label: "Dislike", emoji: "👎", positive: false },
  poo:     { key: "poo",     label: "Poo",     emoji: "💩", positive: false },
};

/** Ordered metadata for the picker tray. */
export const REACTION_LIST: ReactionMeta[] = POST_REACTIONS.map((key) => META[key]);

/**
 * Past-tense verb phrase for notification copy ("Ada loved your post").
 * Mirrors the API's REACTION_VERBS so a locally-rendered fallback reads the
 * same as the server-rendered `content`.
 */
export const REACTION_VERBS: Record<PostReaction, string> = {
  like: "liked",
  love: "loved",
  respect: "respected",
  hot: "thinks 🔥 of",
  lol: "laughed at",
  sad: "felt sad about",
  cry: "cried at",
  dislike: "disliked",
  poo: "pooed on",
};

export function reactionMeta(reaction: PostReaction): ReactionMeta {
  return META[reaction];
}

export function isPositiveReaction(reaction: PostReaction): boolean {
  return META[reaction].positive;
}

/** The reaction a legacy boolean vote means. */
export function voteToReaction(vote: boolean): PostReaction {
  return vote ? DEFAULT_POSITIVE_REACTION : DEFAULT_NEGATIVE_REACTION;
}

const REACTION_SET = new Set<string>(POST_REACTIONS);

/** Coerce an untrusted API value to a reaction, or null. */
export function asReaction(value: unknown): PostReaction | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return REACTION_SET.has(key) ? (key as PostReaction) : null;
}

export type ReactionCounts = Partial<Record<PostReaction, number>>;

/**
 * The single reaction a card's thumbs-up wears.
 *
 * One glyph, never a row of them: the button stands for the post's reaction as
 * a whole, so it shows whichever reaction has the most — ties broken by
 * POST_REACTIONS order, which is why a post split evenly between 👍 and ❤️
 * still reads as a like.
 *
 * Two rules sit on top of the count:
 *
 * 1. **The viewer's own reaction wins.** Seeing your 😂 on the post you laughed
 *    at is what tells you the reaction registered; the crowd's pick is the
 *    fallback, not the override.
 * 2. **Negative reactions never lead.** They belong to the thumbs-DOWN button,
 *    and a 👎 or 💩 drawn beside the *like* count reads as a rendering bug
 *    rather than as data.
 *
 * Null means "draw the plain thumbs-up icon" — returned both when no positive
 * reaction leads and when the leader is a plain like, since the icon is already
 * that reaction's glyph.
 *
 * Whatever this returns is also what a tap on the thumb casts — the glyph and
 * the vote are one promise, kept in `reactionForTap`.
 */
export function resolveLeadReaction(
  counts: ReactionCounts | null | undefined,
  myReaction?: PostReaction | null,
): PostReaction | null {
  const own = myReaction && isPositiveReaction(myReaction) ? myReaction : null;
  const lead = own ?? topPositiveReaction(counts);
  return lead && lead !== DEFAULT_POSITIVE_REACTION ? lead : null;
}

/** Most-used positive reaction, ties broken by picker order. */
function topPositiveReaction(counts: ReactionCounts | null | undefined): PostReaction | null {
  if (!counts) return null;
  let top: PostReaction | null = null;
  let best = 0;
  for (const key of POST_REACTIONS) {
    if (!isPositiveReaction(key)) continue;
    const value = counts[key] ?? 0;
    if (value > best) {
      best = value;
      top = key;
    }
  }
  return top;
}

/**
 * The reaction a plain tap on a thumb casts.
 *
 * The thumbs-up wears whatever `resolveLeadReaction` picks, so a tap has to
 * send that same reaction: a post leading with 🔥 draws a 🔥 thumb, and tapping
 * it must react 🔥 — casting a 👍 the viewer never chose makes the button lie
 * about what it does. The plain 👍 is only the fallback, for a thumb that is
 * drawing the plain icon because nothing leads.
 *
 * Re-sending the reaction the viewer already holds is what the server reads as
 * "remove it", so this doubles as the un-react path — tapping the thumb clears
 * a 🔥 the same way it clears a 👍, rather than downgrading it to a like.
 *
 * The thumbs-DOWN never wears a glyph, so it stays a plain dislike unless the
 * viewer is toggling off a 💩.
 */
export function reactionForTap(
  positive: boolean,
  myReaction: PostReaction | null | undefined,
  counts?: ReactionCounts | null,
): PostReaction {
  const held = myReaction ?? null;
  if (held && isPositiveReaction(held) === positive) return held;
  if (!positive) return DEFAULT_NEGATIVE_REACTION;
  return resolveLeadReaction(counts, held) ?? DEFAULT_POSITIVE_REACTION;
}

/** The top few reactions, most-used first, for the stacked card summary. */
export function topReactions(
  counts: ReactionCounts | null | undefined,
  limit = 3,
): PostReaction[] {
  if (!counts) return [];
  return POST_REACTIONS
    .map((key, index) => ({ key, value: counts[key] ?? 0, index }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => (b.value - a.value) || (a.index - b.index))
    .slice(0, limit)
    .map((entry) => entry.key);
}

/**
 * Apply a reaction change to a counts map. Pure, so the optimistic UI and the
 * engagement overlay derive the same numbers from the same inputs. `previous`
 * is the reaction being replaced (null when the user had none) and `next` the
 * new one (null when toggling off).
 */
export function applyReactionDelta(
  counts: ReactionCounts | null | undefined,
  previous: PostReaction | null,
  next: PostReaction | null,
): ReactionCounts {
  const result: ReactionCounts = { ...(counts ?? {}) };
  if (previous === next) return result;
  if (previous) result[previous] = Math.max(0, (result[previous] ?? 0) - 1);
  if (next) result[next] = (result[next] ?? 0) + 1;
  return result;
}

/**
 * Seed a counts map for a post the API has no per-reaction data for yet.
 *
 * Every vote cast before multi-reaction shipped is a bare boolean, so a busy
 * old post arrives with `totalVotes: { for: 140 }` and no `reactionCounts` —
 * showing "no reactions" there would be wrong. Attributing that history to
 * like/dislike is what those votes actually were, and matches how the API
 * seeds the same map on its first write.
 */
export function seedReactionCounts(likeCount: number, dislikeCount: number): ReactionCounts {
  const seeded: ReactionCounts = {};
  if (likeCount > 0) seeded.like = likeCount;
  if (dislikeCount > 0) seeded.dislike = dislikeCount;
  return seeded;
}

/** The viewer's reaction on an API-shaped post, falling back to the polarity flags. */
export function resolveMyReaction(item: any): PostReaction | null {
  const explicit = asReaction(item?.myReaction);
  if (explicit) return explicit;
  // Pre-reaction API build, or a vote cast before the feature existed.
  if (item?.isLiked === true) return "like";
  if (item?.isDisliked === true) return "dislike";
  return null;
}

/**
 * A count that may arrive as a number, an ARRAY of voters (legacy `likes`
 * rows), or not at all. Mirrors web's toCount — using `||` here dropped a
 * legitimate `totalVotes.for` of 0 through to the legacy fields, and an
 * array-valued `likes` failed the `> 0` seed test entirely.
 */
export function toCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length;
  return undefined;
}

/** Positive-polarity total for an API-shaped post — same chain web uses. */
export function resolveLikeCount(item: any): number {
  return toCount(item?.totalVotes?.for) ?? toCount(item?.likes) ?? toCount(item?.like_count) ?? 0;
}

/** Negative-polarity total for an API-shaped post. */
export function resolveDislikeCount(item: any): number {
  return toCount(item?.totalVotes?.against) ?? toCount(item?.dislikes) ?? toCount(item?.dislike_count) ?? 0;
}

/** Per-reaction tally for an API-shaped post, seeded from polarity when absent. */
export function resolveReactionCounts(item: any): ReactionCounts {
  const stored = item?.reactionCounts as ReactionCounts | undefined;
  if (stored && Object.values(stored).some((value) => (value ?? 0) > 0)) return stored;
  return seedReactionCounts(resolveLikeCount(item), resolveDislikeCount(item));
}
