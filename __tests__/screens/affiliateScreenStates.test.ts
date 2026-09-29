import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, '..', '..', 'screens', 'AffiliateScreen.tsx'), 'utf8');

/**
 * The landing editor's inputs sit low in one long ScrollView. The app draws
 * edge to edge on Android, so the window does not shrink for the keyboard and
 * nothing lifted those fields; and with the default persist-taps setting the
 * first tap on a chip, Reset or Publish only closed the keyboard.
 */
describe('affiliate landing editor and the keyboard', () => {
  it('makes the outermost element a KeyboardAvoidingView offset by the device inset only', () => {
    expect(source).toContain(
      '<KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={keyboardOffset}>',
    );
    expect(source).toContain('const keyboardOffset = useKeyboardOffset();');
    // The header is inside the KeyboardAvoidingView, so adding its height
    // would lift the content a header too far.
    expect(source).not.toContain('useKeyboardOffset(SCREEN_HEADER_HEIGHT)');
    expect(source).toContain('</KeyboardAvoidingView>');
  });

  it('lets the first tap after typing reach the button', () => {
    expect(source).toMatch(/<ScrollView[^>]*keyboardShouldPersistTaps="handled"/);
  });
});

/**
 * A failed load leaves no code. The share card used to spin for as long as
 * there was no code, so it never stopped, and the stat cards read 0.
 */
describe('affiliate screen after a failed load', () => {
  it('spins only while loading or while a real share image is on its way', () => {
    expect(source).toContain('{(loading || (!!stats?.code && !imgLoaded)) && (');
    expect(source).not.toContain('(!stats?.code || !imgLoaded)');
  });

  it('shows the no-code message on the share card, and tapping it retries', () => {
    const start = source.indexOf('{!loading && !stats?.code && (');
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf('</Pressable>', start));
    expect(block).toContain('onPress={onRefresh}');
    expect(block).toContain('t("affiliate.noCode")');
  });

  it('shows a dash instead of 0 when there are no stats', () => {
    expect(source).toContain('loading ? null : stats ? read(stats) : "—"');
    expect(source).not.toMatch(/String\(stats\?\.\w+ \?\? 0\)/);
    expect(source).not.toContain('formatMoney(stats?.totalEarnedCents ?? 0');
  });
});
