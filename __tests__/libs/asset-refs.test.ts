/**
 * The two rules worth a test here are the ones that produce a *wrong* card
 * rather than a missing one:
 *
 * - a URL's span is claimed before addresses and tickers are scanned, so a
 *   pasted chart link cards once (as a link preview) instead of twice;
 * - a base58 run without digits is a long word, not a Solana mint.
 *
 * Both are silent when they break: the feature still works, it just also cards
 * things nobody referenced.
 */

import { findAssetRefs, stripAssetRefs, compareAssetPairs } from '../../libs/asset-refs';

const DHB = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';

describe('findAssetRefs — addresses', () => {
  it('finds an EVM address and asks for it to be stripped', () => {
    const refs = findAssetRefs(`aped in ${DHB} early`);
    expect(refs).toHaveLength(1);
    expect(refs[0].kind).toBe('address');
    expect(refs[0].value).toBe(DHB.toLowerCase());
    expect(refs[0].space).toBe('evm');
    expect(refs[0].strip).toBe(true);
  });

  it('keeps the raw casing for stripping, not the lower-cased value', () => {
    expect(findAssetRefs(DHB)[0].raw).toBe(DHB);
  });

  it('ignores an address inside a URL — the link preview already covers it', () => {
    expect(findAssetRefs(`https://dexscreener.com/base/${DHB}`)).toHaveLength(0);
    expect(findAssetRefs(`https://basescan.org/token/${DHB}?a=1`)).toHaveLength(0);
  });

  it('ignores a transaction hash', () => {
    const hash = '0x' + 'a1'.repeat(32);
    expect(findAssetRefs(`sent in ${hash}`)).toHaveLength(0);
  });

  it('finds a Solana mint', () => {
    const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const refs = findAssetRefs(`buying ${mint} now`);
    expect(refs).toHaveLength(1);
    expect(refs[0].space).toBe('solana');
  });

  it('does not read a long word as a base58 mint', () => {
    expect(findAssetRefs('Donaudampfschiffahrtselektrizitaetenhaupt')).toHaveLength(0);
  });

  it('collapses a repeated reference into one card', () => {
    expect(findAssetRefs(`${DHB} and again ${DHB}`)).toHaveLength(1);
  });
});

describe('findAssetRefs — tickers', () => {
  it('finds a cashtag and leaves it in the text', () => {
    const refs = findAssetRefs('long $DHB and $AAPL');
    expect(refs.map((r) => r.value)).toEqual(['DHB', 'AAPL']);
    expect(refs.every((r) => r.strip === false)).toBe(true);
  });

  it('normalises case', () => {
    expect(findAssetRefs('$dhb')[0].value).toBe('DHB');
  });

  it('reads class shares', () => {
    expect(findAssetRefs('$BRK.B')[0].value).toBe('BRK.B');
  });

  it('is not money', () => {
    expect(findAssetRefs('raised $5m at a $100 floor')).toHaveLength(0);
  });

  it('needs caps for a two-letter ticker, which is otherwise a word', () => {
    expect(findAssetRefs('costs $it nothing')).toHaveLength(0);
    expect(findAssetRefs('bought $IT')).toHaveLength(1);
  });

  it('reads a cashtag written against a bracket or quote', () => {
    expect(findAssetRefs('("$DHB")')).toHaveLength(1);
  });

  it('ignores a ticker inside a URL query string', () => {
    expect(findAssetRefs('https://example.com/search?q=$DHB')).toHaveLength(0);
  });

  it('reports refs in source order', () => {
    const refs = findAssetRefs(`$AAPL then ${DHB}`);
    expect(refs.map((r) => r.kind)).toEqual(['ticker', 'address']);
  });
});

describe('stripAssetRefs', () => {
  it('removes addresses and keeps tickers', () => {
    const text = `buying $DHB here ${DHB} today`;
    expect(stripAssetRefs(text, findAssetRefs(text))).toBe('buying $DHB here today');
  });

  it('strips only the refs it was handed', () => {
    const text = `${DHB} listed`;
    expect(stripAssetRefs(text, [])).toBe(text);
  });
});

describe('compareAssetPairs', () => {
  const pool = (over: Record<string, unknown>) => ({ chainId: 'ethereum', ...over });

  it('prefers the requested chain over Base', () => {
    const sorted = [pool({ chainId: 'base' }), pool({ chainId: 'solana' })].sort((a, b) =>
      compareAssetPairs(a, b, 'solana'),
    );
    expect(sorted[0].chainId).toBe('solana');
  });

  it('sinks a no-volume spoof pool below the real market', () => {
    const spoof = pool({ volume: { h24: 0 }, liquidity: { usd: 900_000 } });
    const real = pool({ volume: { h24: 250_000 }, liquidity: { usd: 10_000 } });
    expect([spoof, real].sort(compareAssetPairs)[0]).toBe(real);
  });

  it('breaks a dead tie on age, so a redeploy loses to the original', () => {
    const older = pool({ pairCreatedAt: 1_600_000_000_000 });
    const newer = pool({ pairCreatedAt: 1_700_000_000_000 });
    expect([newer, older].sort(compareAssetPairs)[0]).toBe(older);
  });
});
