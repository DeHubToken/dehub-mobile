/**
 * Shorts "brick rows"
 * ===================
 * Packs a mixed list of tall and wide videos into rows that never leave a gap
 * on a two-column phone grid:
 *
 *  - pair:  two tall videos side by side, each 9:16
 *  - stack: one tall video beside up to three wide clips stacked to the same
 *           height (three 16:9 tiles at half width ≈ one 9:16 tile)
 *  - hero:  one wide video across the full width at 16:9
 *
 * When the list is complete a lone short left at the very end never sits on
 * half a row: it joins the pair before it as a row of three, or takes the
 * wide clips just before it into a stack, or (only when there is nothing
 * else) spans the full width.
 *
 * Rows follow a fixed rhythm (stack, hero, pair, …) and fall back to whatever
 * the next few items allow. The packer only looks a fixed window ahead and
 * holds back the tail while more pages can still arrive, so loading the next
 * page never reshuffles rows already on screen.
 */

export type BrickShape = 'tall' | 'wide';

export type BrickRow<T> =
  | { kind: 'pair'; key: string; items: [T, T] }
  | { kind: 'trio'; key: string; items: [T, T, T] }
  | { kind: 'stack'; key: string; tall: T; wides: T[]; tallSide: 'left' | 'right' }
  | { kind: 'hero'; key: string; item: T }
  | { kind: 'single'; key: string; item: T };

/** Width / height of the video when known. Unknown (and photos) count as tall. */
export function brickShape(aspect: number | undefined | null): BrickShape {
  return typeof aspect === 'number' && aspect >= 0.8 ? 'wide' : 'tall';
}

const WINDOW = 8;
const RHYTHM = ['stack', 'hero', 'pair'] as const;

export function packBricks<T>(
  list: readonly T[],
  shapeOf: (item: T) => BrickShape,
  idOf: (item: T) => string,
  complete: boolean,
): BrickRow<T>[] {
  const queue = list.slice();
  const rows: BrickRow<T>[] = [];
  let beat = 0;
  let stackSide: 'left' | 'right' = 'left';

  const takeShape = (shape: BrickShape, limit = WINDOW): T | undefined => {
    const end = Math.min(limit, queue.length);
    for (let i = 0; i < end; i++) {
      if (shapeOf(queue[i]) === shape) return queue.splice(i, 1)[0];
    }
    return undefined;
  };
  const count = (shape: BrickShape) => queue.slice(0, WINDOW).filter((item) => shapeOf(item) === shape).length;

  while (queue.length) {
    // Hold back a short tail while another page may still come, so the rows
    // built from it stay the same once it does.
    if (!complete && queue.length < WINDOW) break;
    const talls = count('tall');
    const wides = count('wide');
    const want = RHYTHM[beat % RHYTHM.length];
    beat++;

    const canStack = talls >= 1 && wides >= 3;
    const canPair = talls >= 2;
    const canHero = wides >= 1;
    const pick = (want === 'stack' && canStack) ? 'stack'
      : (want === 'hero' && canHero) ? 'hero'
      : (want === 'pair' && canPair) ? 'pair'
      : canStack ? 'stack'
      : canPair ? 'pair'
      : canHero ? 'hero'
      : talls >= 1 ? 'stack' : 'single';

    if (pick === 'pair') {
      const a = takeShape('tall')!;
      const b = takeShape('tall')!;
      rows.push({ kind: 'pair', key: `p-${idOf(a)}`, items: [a, b] });
    } else if (pick === 'hero') {
      const item = takeShape('wide')!;
      rows.push({ kind: 'hero', key: `h-${idOf(item)}`, item });
    } else if (pick === 'stack') {
      const tall = takeShape('tall')!;
      const stacked: T[] = [];
      for (let i = 0; i < 3; i++) {
        const wide = takeShape('wide');
        if (!wide) break;
        stacked.push(wide);
      }
      if (!stacked.length) {
        rows.push({ kind: 'single', key: `s-${idOf(tall)}`, item: tall });
      } else {
        rows.push({ kind: 'stack', key: `k-${idOf(tall)}`, tall, wides: stacked, tallSide: stackSide });
        stackSide = stackSide === 'left' ? 'right' : 'left';
      }
    } else {
      const item = queue.shift()!;
      rows.push({ kind: 'single', key: `s-${idOf(item)}`, item });
    }
  }
  return closeTail(rows, idOf);
}

/** Fold a lone short at the end into the rows before it so no half row is left empty. */
function closeTail<T>(rows: BrickRow<T>[], idOf: (item: T) => string): BrickRow<T>[] {
  const last = rows[rows.length - 1];
  if (!last || last.kind !== 'single') return rows;
  const prev = rows[rows.length - 2];
  if (prev?.kind === 'pair') {
    const items: [T, T, T] = [prev.items[0], prev.items[1], last.item];
    return [...rows.slice(0, -2), { kind: 'trio', key: `t-${idOf(items[0])}`, items }];
  }
  // Wide clips right before it stack beside it at the short's height.
  let start = rows.length - 1;
  while (start > 0 && rows.length - 1 - start < 3 && rows[start - 1].kind === 'hero') start--;
  if (start < rows.length - 1) {
    const wides = rows.slice(start, -1).map((row) => (row as { item: T }).item);
    return [...rows.slice(0, start), { kind: 'stack', key: `k-${idOf(last.item)}`, tall: last.item, wides, tallSide: 'left' }];
  }
  return rows;
}
