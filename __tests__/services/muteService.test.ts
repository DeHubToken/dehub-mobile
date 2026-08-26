import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Mute is not block, and the two must not quietly become one thing.
 *
 * On web this exact confusion shipped: a hook named `useMuteAuthor` called the
 * block API, so the softer word sat on the harder action and the menu could
 * only ever offer one of them. Mobile gets the same guard before it can happen
 * here.
 */
const root = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

/** Comments explain the mute/block split in prose; match code, not the prose. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const MUTE_SERVICE = stripComments(read('services', 'mute.service.ts'));
const MENU = read('components', 'common', 'PostOptionsMenu.tsx');

describe('mute.service talks to the mute endpoints only', () => {
  it('posts to /mute, never /block', () => {
    expect(MUTE_SERVICE).toContain("apiClient.post<MuteUserResponse>('/mute'");
    expect(MUTE_SERVICE).not.toContain('/block');
  });

  it('offers unmute and a list', () => {
    expect(MUTE_SERVICE).toContain('/mute/${encodeURIComponent(address)}');
    expect(MUTE_SERVICE).toContain('/mute?page=');
  });

  it('exposes no way for a muted account to detect it', () => {
    // No muted-by list, and status reports `youMuted` only. Either addition
    // would turn a private action into a visible one.
    expect(MUTE_SERVICE).not.toMatch(/muted-?by/i);
    expect(MUTE_SERVICE).not.toMatch(/mutedYou/);
    expect(MUTE_SERVICE).toContain('youMuted');
  });
});

describe('the options menu offers mute and block as separate rows', () => {
  it('renders a mute row driven by the mute service', () => {
    expect(MENU).toContain('from "../../services/mute.service"');
    expect(MENU).toContain('t("postOptions.muteUser"');
    expect(MENU).toContain('await muteUser(creatorIdentifier)');
  });

  it('keeps the block row on the block service', () => {
    expect(MENU).toContain('t("postOptions.blockUser"');
    expect(MENU).toContain('await blockUser(creatorIdentifier)');
  });

  it('does not put a confirmation sheet in front of muting', () => {
    // Blocking asks first because it is bidirectional and severs DMs. A mute
    // is one-way, private and reversible, so a confirm step would be friction
    // guarding nothing — but it must not accidentally reuse the block sheet.
    const handler = MENU.match(/const handleMute = useCallback\(([\s\S]*?)\n {2}\}, \[/);
    expect(handler).not.toBeNull();
    expect(handler![1]).not.toContain('setShowBlockConfirm');
    expect(handler![1]).toContain('muteUser');
  });
});

describe('the mute strings exist in every bundled locale', () => {
  const localesDir = join(root, 'i18n', 'locales');
  const files = require('fs')
    .readdirSync(localesDir)
    .filter((f: string) => f.endsWith('.json'));

  it('provides every mute key in every locale file', () => {
    // i18next falls back to English on a missing key, so an absent one is
    // invisible in testing and only shows up as an untranslated menu row.
    const keys = ['muteUser', 'muteDesc', 'muteFailed', 'mutedUser'];
    const missing: string[] = [];
    for (const file of files) {
      const json = JSON.parse(readFileSync(join(localesDir, file), 'utf8'));
      for (const key of keys) {
        const value = json?.postOptions?.[key];
        if (typeof value !== 'string' || !value.trim()) missing.push(`${file}:${key}`);
      }
    }
    expect(missing).toEqual([]);
    expect(files.length).toBeGreaterThan(100);
  });

  it('keeps the interpolation placeholder intact where the label names someone', () => {
    // A dropped {{name}} renders "Mute " with nothing after it.
    const broken: string[] = [];
    for (const file of files) {
      const json = JSON.parse(readFileSync(join(localesDir, file), 'utf8'));
      for (const key of ['muteUser', 'mutedUser']) {
        if (!String(json?.postOptions?.[key] ?? '').includes('{{name}}')) {
          broken.push(`${file}:${key}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
