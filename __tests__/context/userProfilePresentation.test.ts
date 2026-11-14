import { resolveProfilePresentation } from '../../libs/profile-presentation';
import { APP_THEMES } from '../../theme/colors';

describe('profile presentation', () => {
  it.each(APP_THEMES)('gives %s profiles their own back bar from every entry point, on both platforms', (theme) => {
    for (const platform of ['android', 'ios']) {
      for (const feedActive of [true, false]) {
        for (const source of [undefined, 'deeplink']) {
          expect(resolveProfilePresentation(feedActive, source, theme, platform)).toBe('modal');
        }
      }
    }
  });

  it('never draws a profile inside the feed, which re-rendered every feed page first', () => {
    expect(resolveProfilePresentation(true)).toBe('modal');
    expect(resolveProfilePresentation(false)).toBe('modal');
    expect(resolveProfilePresentation(true, 'deeplink')).toBe('modal');
  });
});
