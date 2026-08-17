import { autoTranslateEnabled, setAutoTranslateEnabled } from '../../libs/auto-translate-setting';
import { storage } from '../../libs/storage';

describe('libs/auto-translate-setting', () => {
  beforeEach(() => storage.clearAll());

  it('is on for a reader who has never touched it', () => {
    // Web defaults the same way. A reader who cannot read the post is the
    // failure this feature removes, so it does not wait to be switched on.
    expect(autoTranslateEnabled()).toBe(true);
  });

  it('remembers being turned off', () => {
    setAutoTranslateEnabled(false);
    expect(autoTranslateEnabled()).toBe(false);
  });

  it('remembers being turned back on', () => {
    setAutoTranslateEnabled(false);
    setAutoTranslateEnabled(true);
    expect(autoTranslateEnabled()).toBe(true);
  });

  it('stores the same key and values web does', () => {
    setAutoTranslateEnabled(false);
    expect(storage.getString('dehub-auto-translate')).toBe('off');
    setAutoTranslateEnabled(true);
    expect(storage.getString('dehub-auto-translate')).toBe('on');
  });
});
