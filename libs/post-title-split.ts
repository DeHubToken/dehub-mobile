/**
 * Post title split
 * ================
 * A video or audio post written without a title borrows its title from the
 * body text. That borrow used to be a *move*: the text was sliced at 140
 * characters, the slice became the title and the remainder was thrown away —
 * so a clip posted with a 300-character write-up came back with a title cut
 * mid-word and an empty description.
 *
 * This splits instead of slicing. The title still comes off the front, which
 * is the behaviour people want, but everything past the break stays in the
 * description.
 *
 * Break points, in order:
 *
 * 1. **A line break inside the cap.** Somebody who typed a short first line
 *    and then a paragraph has already said where the title ends.
 * 2. **The last space inside the cap**, so a title never stops mid-word.
 * 3. **A hard cut at the cap**, for one unbroken run of characters (a pasted
 *    URL, a script that does not space its words) or a space so early that
 *    honouring it would leave a two-word title in front of a wall of text.
 *
 * Kept in step with web's `src/features/post/lib/title-split.ts`.
 */

/** Matches the title input's maxLength, the edit endpoint's cap and web. */
export const POST_TITLE_MAX = 140;

/**
 * Shortest title a space break may produce, as a fraction of the cap. Below it
 * the space is ignored and the cap wins: "clip <220-character url>" reads
 * better as a full-width title than as the single word "clip".
 */
const MIN_SPACE_BREAK_RATIO = 0.6;

export interface TitleSplit {
  /** The post's title (`name`), never longer than the cap. */
  title: string;
  /** Everything after the break — empty when the text fit the title whole. */
  description: string;
}

/** Index of the last whitespace character in `s`, or -1 when there is none. */
function lastWhitespaceIndex(s: string): number {
  for (let i = s.length - 1; i >= 0; i -= 1) {
    if (/\s/.test(s[i])) return i;
  }
  return -1;
}

/**
 * Splits free text into a title and the description that carries the rest.
 * Text that fits the cap becomes the title on its own, with no description.
 */
export function splitTitleFromText(raw: string, titleMax: number = POST_TITLE_MAX): TitleSplit {
  const text = (raw || "").trim();
  if (text.length <= titleMax) return { title: text, description: "" };

  // +1 so a break sitting exactly on the cap still counts as inside it.
  const head = text.slice(0, titleMax + 1);
  const newline = head.search(/\r?\n/);

  let cut: number;
  if (newline > 0) {
    cut = newline;
  } else {
    const space = lastWhitespaceIndex(head);
    cut = space >= Math.floor(titleMax * MIN_SPACE_BREAK_RATIO) ? space : titleMax;
  }

  return { title: text.slice(0, cut).trim(), description: text.slice(cut).trim() };
}
