import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8');

// Every `<ScrollView ...>` opening tag in a file, walking braces so props like
// `refreshControl={<X />}` do not end the tag early.
function scrollViewTags(source: string): string[] {
  const tags: string[] = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf('<ScrollView', from);
    if (start < 0) return tags;
    let depth = 0;
    let end = start;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    tags.push(source.slice(start, end + 1));
    from = end + 1;
  }
}

describe('wallet page keyboard handling', () => {
  const dpay = read('screens/DpayScreen.tsx');
  const nearBuy = read('components/Dpay/NearIntentBuy.tsx');

  it('lets the first tap after typing reach Buy now, MAX and the tab buttons', () => {
    // Default 'never' makes the ScrollView eat the first tap to close the
    // keyboard, so every action on the page needed two taps.
    const tags = scrollViewTags(dpay);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('keyboardShouldPersistTaps="handled"');
  });

  it('lets the first tap reach token rows and history rows in the NEAR buy lists', () => {
    // Each nested ScrollView decides for itself, so the outer one being
    // 'handled' does not cover these.
    const tags = scrollViewTags(nearBuy);
    expect(tags.length).toBeGreaterThanOrEqual(2);
    for (const tag of tags) expect(tag).toContain('keyboardShouldPersistTaps="handled"');
  });

  it('offsets the keyboard view by the status-bar inset on both platforms', () => {
    // The view is the screen root, so its onLayout y is 0 inside a parent that
    // starts insets.top down the window; a 0 offset on Android left the lowest
    // field that much under the keys.
    expect(dpay).toContain('const keyboardOffset = useKeyboardOffset();');
    expect(dpay).toContain('keyboardVerticalOffset={keyboardOffset}');
    expect(dpay).not.toMatch(/keyboardVerticalOffset=\{Platform\.OS/);
  });
});
