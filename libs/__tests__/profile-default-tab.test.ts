import { getDefaultProfileTab, parseDefaultProfileTab } from '../profile-default-tab';

describe('profile default tab', () => {
  it('keeps a tab the owner picked', () => {
    expect(parseDefaultProfileTab('videos')).toBe('videos');
    expect(getDefaultProfileTab({ customs: { defaultProfileTab: 'images' } })).toBe('images');
  });

  it('falls back to All for missing or unknown values', () => {
    expect(parseDefaultProfileTab(undefined)).toBe('home');
    expect(parseDefaultProfileTab('playlists')).toBe('home');
    expect(getDefaultProfileTab({})).toBe('home');
    expect(getDefaultProfileTab(null)).toBe('home');
  });
});
