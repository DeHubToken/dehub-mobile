import { BADGE_WORLD_THEMES, badgeWorld } from '../../libs/badgeWorld';
import { badgeAnimationStyle } from '../../libs/badgeAnimationStyle';

describe('badge world routing', () => {
  it('uses a dedicated world for all ten cinematic themes', () => {
    for (const theme of BADGE_WORLD_THEMES) expect(badgeWorld(theme)).toBe(theme);
    expect(badgeWorld('christmas')).toBe('winter');
  });
  it('preserves metallic and Osaka sticker materials', () => {
    for (const theme of ['system', 'dark', 'light', 'minimal', 'osaka', 'unknown']) expect(badgeWorld(theme)).toBeNull();
    for (const theme of ['system', 'light', 'minimal']) expect(badgeAnimationStyle(theme)).toBe('metallic');
    expect(badgeAnimationStyle('osaka')).toBe('sticker');
  });
});
