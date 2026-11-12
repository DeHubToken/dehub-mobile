/**
 * Profile post backgrounds: a backdrop the owner picks for the text-only posts
 * on their own profile (hold your profile header to choose).
 *
 * Stored as `customs.postBg` on the account (the free-form settings blob the
 * backend persists as-is), holding one of the ids below or '' for none. Only
 * these ids render, so a hand-written value can never put anything else
 * behind a post. The same list lives in dehubweb (src/lib/post-backgrounds.ts);
 * keep the ids in step.
 */

export const POST_BG_CUSTOMS_KEY = 'postBg';

export type PostBgKind = 'still' | 'moving';

export interface PostBg {
  id: string;
  name: string;
  kind: PostBgKind;
  /** Text colour on this backdrop. Fixed per backdrop so every site theme reads the same. */
  tone: 'light' | 'dark';
}

export const POST_BACKGROUNDS: readonly PostBg[] = [
  { id: 'ink', name: 'Ink Wash', kind: 'still', tone: 'dark' },
  { id: 'news', name: 'Newsprint', kind: 'still', tone: 'light' },
  { id: 'split', name: 'Dusk Split', kind: 'still', tone: 'dark' },
  { id: 'blue', name: 'Blueprint', kind: 'still', tone: 'dark' },
  { id: 'terra', name: 'Terrazzo', kind: 'still', tone: 'light' },
  { id: 'half', name: 'Halftone Pop', kind: 'still', tone: 'dark' },
  { id: 'topo', name: 'Contour', kind: 'still', tone: 'dark' },
  { id: 'velvet', name: 'Velvet', kind: 'still', tone: 'dark' },
  { id: 'sorbet', name: 'Sorbet', kind: 'still', tone: 'light' },
  { id: 'carbon', name: 'Carbon', kind: 'still', tone: 'dark' },
  // These three differ per post: Echo blurs the profile picture, Cards and Deck pick a variant from the post.
  { id: 'echo', name: 'Profile Echo', kind: 'still', tone: 'dark' },
  { id: 'cards', name: 'Colour Cards', kind: 'still', tone: 'dark' },
  { id: 'deck', name: 'Pattern Deck', kind: 'still', tone: 'dark' },
  { id: 'aurora', name: 'Aurora', kind: 'moving', tone: 'dark' },
  { id: 'lava', name: 'Lava Lamp', kind: 'moving', tone: 'dark' },
  { id: 'stars', name: 'Starfield', kind: 'moving', tone: 'dark' },
  { id: 'rain', name: 'Rain on Glass', kind: 'moving', tone: 'dark' },
  { id: 'drive', name: 'Night Drive', kind: 'moving', tone: 'dark' },
  { id: 'breathe', name: 'Breathe', kind: 'moving', tone: 'dark' },
  { id: 'spin', name: 'Prism Spin', kind: 'moving', tone: 'dark' },
  { id: 'tide', name: 'Tide', kind: 'moving', tone: 'dark' },
  { id: 'ember', name: 'Embers', kind: 'moving', tone: 'dark' },
  { id: 'holo', name: 'Holo Foil', kind: 'moving', tone: 'light' },
];

const BY_ID = new Map(POST_BACKGROUNDS.map((b) => [b.id, b]));

/** The backdrop a customs blob asks for, or null for none / unknown. */
export function parsePostBg(customs: Record<string, unknown> | null | undefined): PostBg | null {
  const raw = customs?.[POST_BG_CUSTOMS_KEY];
  return typeof raw === 'string' ? BY_ID.get(raw) ?? null : null;
}

/** Which of `count` looks a post gets on a backdrop that varies per post. Stable for the same post. */
export function postBgVariant(seed: string | number | null | undefined, count: number): number {
  const text = String(seed ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return hash % count;
}

export function postBgById(id: string | null | undefined): PostBg | null {
  return id ? BY_ID.get(id) ?? null : null;
}

/** customs with the backdrop set (or cleared with ''), every other key kept. */
export function mergePostBg(customs: Record<string, unknown> | null | undefined, id: string | null): Record<string, unknown> {
  return { ...(customs ?? {}), [POST_BG_CUSTOMS_KEY]: id && BY_ID.has(id) ? id : '' };
}
