/**
 * Impersonation folding — the cases that matter are the evasions.
 *
 * A scam account never copies a creator's name exactly; it swaps a Cyrillic
 * letter in, doubles a character, or hides a zero-width space in the middle.
 * If any of those stop matching, the warning silently stops appearing, and the
 * failure is invisible in the UI — hence a test rather than a manual check.
 *
 * Ported from dehubweb src/test/impersonation.test.ts. The two clients have to
 * agree on what counts as wearing someone's name, or the same comment reads as
 * safe on one and flagged on the other.
 */
import { foldName, looksLike, checkImpersonation } from '../../libs/impersonation';

describe('foldName', () => {
  it('folds case, spacing and punctuation away', () => {
    expect(foldName('De Hub.')).toBe(foldName('DeHub'));
  });

  it('folds Cyrillic and Greek lookalikes to their Latin twin', () => {
    expect(foldName('DеHub')).toBe('dehub');   // Cyrillic е
    expect(foldName('DeHυb')).toBe('dehub');   // Greek υ
  });

  it('folds digits that stand in for letters', () => {
    expect(foldName('D3Hub')).toBe('dehub');
    expect(foldName('DeHu8')).toBe('dehub');
  });

  it('collapses repeated characters', () => {
    expect(foldName('DeHubbb')).toBe('dehub');
  });

  it('drops zero-width characters', () => {
    expect(foldName('De​Hub')).toBe('dehub');
  });
});

describe('looksLike', () => {
  it('matches the evasions', () => {
    for (const spoof of ['DеHub', 'D3Hub', 'DeHubb', 'DeHub.', 'De Hub', 'De​Hub']) {
      expect(looksLike(spoof, 'DeHub')).toBe(true);
    }
  });

  it('allows one typo of slack on longer names', () => {
    expect(looksLike('maldotet', 'maldoteth')).toBe(true);
  });

  it('does not flag a different name that happens to be close in length', () => {
    expect(looksLike('someoneelse', 'maldoteth')).toBe(false);
    expect(looksLike('DeHub Official', 'DeHub')).toBe(false);
  });

  it('requires exact folding for very short names', () => {
    expect(looksLike('bob', 'bib')).toBe(false);
  });
});

describe('checkImpersonation', () => {
  const creator = { address: '0xAAA', displayName: 'DeHub', username: 'dehub' };

  it('marks the creator by address, not by name', () => {
    expect(checkImpersonation({ address: '0xaaa', displayName: 'anything' }, creator)).toEqual({
      isCreator: true,
      isImpersonating: false,
    });
  });

  it('flags a different account wearing the name', () => {
    expect(checkImpersonation({ address: '0xBBB', displayName: 'DеHub' }, creator).isImpersonating).toBe(true);
  });

  it('says nothing when either address is missing', () => {
    expect(checkImpersonation({ displayName: 'DeHub' }, creator).isImpersonating).toBe(false);
    expect(checkImpersonation({ address: '0xBBB', displayName: 'DeHub' }, null).isImpersonating).toBe(false);
  });

  it('leaves an unrelated commenter alone', () => {
    expect(checkImpersonation({ address: '0xCCC', displayName: 'SableRaven' }, creator)).toEqual({
      isCreator: false,
      isImpersonating: false,
    });
  });
});
