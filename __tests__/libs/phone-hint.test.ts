
import { normalisePhoneHint } from '../../libs/wallet-core/phone-hint';

describe('normalisePhoneHint', () => {
  // The two real accounts this was written for. Their Web3Auth verifier ids are
  // stored exactly like this, and anything else derives a different key.
  it('produces the stored verifier id for the accounts we know', () => {
    expect(normalisePhoneHint('+34 659265340')).toBe('+34-659265340');
    expect(normalisePhoneHint('+41 796644629')).toBe('+41-796644629');
  });

  it('accepts an already-hyphenated hint unchanged', () => {
    expect(normalisePhoneHint('+34-659265340')).toBe('+34-659265340');
  });

  it('accepts the 00 international prefix', () => {
    expect(normalisePhoneHint('0034 659265340')).toBe('+34-659265340');
    expect(normalisePhoneHint('0034659265340')).toBe('+34-659265340');
  });

  it('strips spacing inside the subscriber number', () => {
    expect(normalisePhoneHint('+34 659 265 340')).toBe('+34-659265340');
    expect(normalisePhoneHint('+41 79 664 46 29')).toBe('+41-796644629');
  });

  it('splits an unbroken run on the longest assigned calling code', () => {
    expect(normalisePhoneHint('+34659265340')).toBe('+34-659265340');
    expect(normalisePhoneHint('+966533039915')).toBe('+966-533039915');
    expect(normalisePhoneHint('+4915204635136')).toBe('+49-15204635136');
  });

  it('keeps +1 whole for NANP rather than matching a longer code', () => {
    expect(normalisePhoneHint('+12125550123')).toBe('+1-2125550123');
  });

  it('trusts an explicit separator over the calling-code table', () => {
    // +1-242 is the Bahamas inside NANP; the user said where the code ends.
    expect(normalisePhoneHint('+1 2425550123')).toBe('+1-2425550123');
    expect(normalisePhoneHint('+1242 5550123')).toBe('+1242-5550123');
  });

  it('refuses input it cannot resolve with certainty', () => {
    expect(normalisePhoneHint('')).toBeNull();
    expect(normalisePhoneHint('659265340')).toBeNull();      // no country code
    expect(normalisePhoneHint('+999123456789')).toBeNull();  // unassigned code
    expect(normalisePhoneHint('+34')).toBeNull();            // no subscriber part
    expect(normalisePhoneHint('not a phone')).toBeNull();
  });
});
