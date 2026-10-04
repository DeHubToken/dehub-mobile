import { resolveProfilePresentation } from '../../libs/profile-presentation';

describe('profile presentation', () => {
  it('opens System profiles above the entire feed instead of below its header', () => {
    expect(resolveProfilePresentation(true, undefined, 'system')).toBe('modal');
    expect(resolveProfilePresentation(false, undefined, 'system')).toBe('modal');
    expect(resolveProfilePresentation(true, 'deeplink', 'system')).toBe('modal');
  });

  it('keeps a profile opened from the active feed inside the feed surface', () => {
    expect(resolveProfilePresentation(true)).toBe('feed');
  });

  it('uses the standalone presentation away from the feed', () => {
    expect(resolveProfilePresentation(false)).toBe('modal');
  });

  it('does not invent feed history for a profile deep link', () => {
    expect(resolveProfilePresentation(true, 'deeplink')).toBe('modal');
  });
});
