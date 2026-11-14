/**
 * The list maths behind "Arrange your posts".
 *
 * Rows are one fixed height, so a drag is just "how many rows has the finger
 * travelled": no measuring, and the same answer on every phone.
 *
 * @module libs/arrange-order
 */

/** Move one entry of a list to another place, returning a new list. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from === to || from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

/** The row a drag that started on `start` is over after moving `dy` points. */
export function dragTargetIndex(start: number, dy: number, rowHeight: number, count: number): number {
  return Math.max(0, Math.min(count - 1, start + Math.round(dy / rowHeight)));
}
