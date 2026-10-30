/**
 * Where the caret sits right after `before` became `after`.
 *
 * onChangeText and onSelectionChange arrive in a different order on Android
 * and iOS, so the last selection seen may be from before or after the edit.
 * `start + length change` was right only for a plain caret before the edit;
 * with a selected range, or once the selection had already moved, it pointed
 * somewhere else and opened the @mention / $ticker list at the wrong word. The
 * edit itself bounds where the caret can be: after the unchanged start and
 * before the unchanged end. The selection is used only when it agrees.
 */
export function caretFromEdit(
  before: string,
  after: string,
  selection: { start: number; end: number },
): number {
  const limit = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < limit && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < limit - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix++;
  const editEnd = after.length - suffix;
  const diff = after.length - before.length;
  // Selection from before the edit: the caret lands after what replaced it.
  const fromOld = selection.end + diff;
  if (selection.end >= prefix && selection.end <= before.length && fromOld >= prefix && fromOld <= editEnd) return fromOld;
  // Selection already updated by the time the text arrived.
  if (selection.start === selection.end && selection.end >= prefix && selection.end <= editEnd) return selection.end;
  return editEnd;
}
