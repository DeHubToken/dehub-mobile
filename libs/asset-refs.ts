/**
 * Asset References
 * ================
 * One parser for the market references that deserve a price card instead of raw
 * text: a contract address somebody pasted, and a `$TICKER` they typed.
 *
 * This is the market-side sibling of `dehub-links.ts`, and it exists for the
 * same reason: detection was already happening in four places with four
 * regexes — web's composer chips and `TranslatableText`, the explore search box
 * and this app's `FeedCaption` — which is why the same `$DHB` was a chip in one
 * surface, a search query in another and nothing at all in a DM.
 *
 * Kept in step with web's `src/lib/asset-refs.ts`, rule for rule. A caption
 * written on one client is read on the other, so a rule only one of them
 * enforces shows up as a card that appears on a phone and not on a laptop.
 *
 * Three rules this module exists to enforce:
 *
 * 1. **URLs are claimed first.** A dexscreener or explorer link has a contract
 *    address in its path and a ticker in its query string. Scanning for the
 *    address without claiming the URL span first turns every pasted chart link
 *    into a duplicate card of the thing the link already previews.
 *
 * 2. **An address is stripped, a ticker is not.** A 42-character hex blob next
 *    to a card that already shows the token adds nothing, so the surfaces drop
 *    it. `$DHB` is part of the sentence somebody wrote — "aped into $DHB" reads
 *    wrong with the ticker cut out of it — so the text keeps it and the card
 *    goes underneath.
 *
 * 3. **Stripping means the card must never render nothing.** Same invariant the
 *    entity cards live under: a surface that removed the address from the text
 *    has to render *something* for it, or a token the APIs cannot resolve
 *    silently deletes the address out of the post. `AssetRefCard` falls back to
 *    a tappable address chip that copies.
 */

export type AssetRefKind = 'address' | 'ticker';

export interface AssetRef {
  kind: AssetRefKind;
  /** The exact substring matched in the source text — strip by this. */
  raw: string;
  /** Lower-cased address for `address`, upper-cased bare symbol for `ticker`. */
  value: string;
  /** Set on `address` refs: which address space this is, for chain mapping. */
  space?: 'evm' | 'solana';
  /**
   * Whether a surface should remove `raw` from the display text once it has
   * rendered a card. False for tickers, which read as part of the sentence.
   */
  strip: boolean;
}

// ── Shapes ──────────────────────────────────────────────────────────────────

/** 0x + 40 hex. Every EVM chain, and the only address shape with no ambiguity. */
const EVM_ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/g;

/**
 * Base58, 32–44 chars: Solana mints, and Sui/Aptos object ids are close enough
 * that DexScreener resolves them from the same lookup.
 *
 * The digit requirement is the whole reason this is safe to run over prose. A
 * base58 run of that length is otherwise indistinguishable from an unbroken
 * 32-character word, and German compounds, transliterated hashtags and
 * `verylongusernamewithoutspaces` all reach that length. Every real mint
 * contains digits; a word does not.
 */
const BASE58_ADDRESS_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

/**
 * `$SYM`. Letters first, then letters/digits, with `.` and `-` allowed inside
 * because that is how the exchanges spell class shares and pairs — BRK.B,
 * BRK-B, RDS.A.
 *
 * Not anchored to a word boundary on the left on purpose: `($DHB` and `"$DHB`
 * are both how people write it. Anchored on the right so `$5m` and `$100`
 * cannot match — a leading digit is money, not a ticker.
 */
const TICKER_RE = /\$([A-Za-z][A-Za-z0-9]{0,9}(?:[.-][A-Za-z]{1,4})?)\b/g;

/**
 * Same URL shape `dehub-links.ts` uses. Kept as its own copy rather than
 * exported across, because the two modules disagree about what to do with a
 * match — this one only wants the span, never the parse.
 */
const URL_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?\/[^\s<>"'`]*/gi;

/** Bare `0x…` inside a longer hex run — a tx hash, not an address. */
const LONG_HEX_RE = /\b0x[a-fA-F0-9]{41,}\b/g;

/**
 * Tickers that are words first and symbols second. `$IT`, `$ON` and `$SO` are
 * real listings, and every one of them shows up mid-sentence in a caption
 * somebody typed with a currency sign. Carding those reads as a bug, so a
 * two-letter ticker has to be spelled in caps to count.
 */
const CASE_SENSITIVE_MIN_LENGTH = 3;

// ── Scanning ────────────────────────────────────────────────────────────────

interface Span {
  start: number;
  end: number;
}

function claimAll(text: string, re: RegExp, into: Span[]): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    into.push({ start: m.index, end: m.index + m[0].length });
  }
}

function overlaps(spans: Span[], start: number, end: number): boolean {
  return spans.some((s) => start < s.end && end > s.start);
}

/**
 * Every market reference in a block of text, in the order they appear and
 * deduplicated by value — two mentions of the same token are one card.
 */
export function findAssetRefs(text?: string | null): AssetRef[] {
  if (!text) return [];

  // Claimed before anything else: a URL's path and query are somebody else's
  // parse, and a tx hash is not an address even though it starts like one.
  const claimed: Span[] = [];
  claimAll(text, URL_RE, claimed);
  claimAll(text, LONG_HEX_RE, claimed);

  const found: Array<AssetRef & { at: number }> = [];
  const seen = new Set<string>();

  const push = (ref: AssetRef, at: number) => {
    const key = `${ref.kind}:${ref.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ ...ref, at });
    claimed.push({ start: at, end: at + ref.raw.length });
  };

  EVM_ADDRESS_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EVM_ADDRESS_RE.exec(text)) !== null) {
    if (overlaps(claimed, m.index, m.index + m[0].length)) continue;
    push(
      { kind: 'address', raw: m[0], value: m[0].toLowerCase(), space: 'evm', strip: true },
      m.index,
    );
  }

  BASE58_ADDRESS_RE.lastIndex = 0;
  while ((m = BASE58_ADDRESS_RE.exec(text)) !== null) {
    if (overlaps(claimed, m.index, m.index + m[0].length)) continue;
    if (!/\d/.test(m[0])) continue;
    push({ kind: 'address', raw: m[0], value: m[0], space: 'solana', strip: true }, m.index);
  }

  TICKER_RE.lastIndex = 0;
  while ((m = TICKER_RE.exec(text)) !== null) {
    if (overlaps(claimed, m.index, m.index + m[0].length)) continue;
    const symbol = m[1];
    if (symbol.length < CASE_SENSITIVE_MIN_LENGTH && symbol !== symbol.toUpperCase()) continue;
    push({ kind: 'ticker', raw: m[0], value: symbol.toUpperCase(), strip: false }, m.index);
  }

  return found.sort((a, b) => a.at - b.at).map(({ at: _at, ...ref }) => ref);
}

/** The first market reference in a block of text, if any. */
export function findAssetRef(text?: string | null): AssetRef | null {
  return findAssetRefs(text)[0] ?? null;
}

/**
 * Remove the refs a surface carded from the display text — only the ones that
 * asked to be stripped.
 *
 * Display only. Never send the result back to an API: editing a post through
 * stripped text drops the contract address out of the stored body, and the card
 * is the only place it still existed.
 */
export function stripAssetRefs(text: string | null | undefined, refs: AssetRef[]): string {
  if (!text) return text ?? '';
  let out = text;
  for (const ref of refs) {
    if (!ref.strip) continue;
    out = out.split(ref.raw).join('');
  }
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Chains ──────────────────────────────────────────────────────────────────

/**
 * DexScreener's chain slug → GeckoTerminal's network id, which is the pair the
 * 24h series needs. Anything missing here still gets a card; it just gets its
 * price from DexScreener without a chart.
 */
export const DEX_TO_GECKO_NETWORK: Record<string, string> = {
  ethereum: 'eth',
  base: 'base',
  bsc: 'bsc',
  solana: 'solana',
  arbitrum: 'arbitrum',
  polygon: 'polygon_pos',
  avalanche: 'avax',
  optimism: 'optimism',
  blast: 'blast',
  linea: 'linea',
  scroll: 'scroll',
  mantle: 'mantle',
  zksync: 'zksync',
  sui: 'sui-network',
  aptos: 'aptos',
  ton: 'ton',
  tron: 'tron',
  pulsechain: 'pulsechain',
  hyperliquid: 'hyperevm',
  berachain: 'berachain',
  unichain: 'unichain',
  abstract: 'abstract',
  sonic: 'sonic',
  celo: 'celo',
  cronos: 'cronos',
  fantom: 'ftm',
  gnosis: 'xdai',
  moonbeam: 'moonbeam',
  osmosis: 'osmosis',
  sei: 'sei-evm',
  starknet: 'starknet',
  worldchain: 'world-chain',
};

/** Explorer for the "view contract" link on a card. */
export function explorerUrlFor(chainId: string, address: string): string | null {
  const bases: Record<string, string> = {
    ethereum: 'https://etherscan.io/token/',
    base: 'https://basescan.org/token/',
    bsc: 'https://bscscan.com/token/',
    polygon: 'https://polygonscan.com/token/',
    arbitrum: 'https://arbiscan.io/token/',
    optimism: 'https://optimistic.etherscan.io/token/',
    avalanche: 'https://snowtrace.io/token/',
    solana: 'https://solscan.io/token/',
    blast: 'https://blastscan.io/token/',
    linea: 'https://lineascan.build/token/',
    scroll: 'https://scrollscan.com/token/',
    sui: 'https://suivision.xyz/coin/',
    ton: 'https://tonviewer.com/',
    tron: 'https://tronscan.org/#/token20/',
  };
  const base = bases[chainId.toLowerCase()];
  return base ? `${base}${address}` : null;
}

// ── Ranking ─────────────────────────────────────────────────────────────────

/**
 * Shape of the fields this module ranks on. Deliberately loose: DexScreener's
 * pair objects come through unmodified on web and mobile, and both clients rank
 * with this function so the pool the composer's dropdown showed the poster is
 * the pool the reader's card resolves to.
 */
export interface RankablePair {
  chainId?: string;
  volume?: { h24?: number } | null;
  txns?: { h24?: { buys: number; sells: number } } | null;
  liquidity?: { usd?: number } | null;
  pairCreatedAt?: number | null;
}

function h24Txns(p: RankablePair): number {
  return (p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0);
}

/**
 * Best pool first. Base is preferred because it is DeHub's home chain, then the
 * ordinary liveness signals — a spoof pool for a well-known ticker has neither
 * volume nor trades, and the oldest pool wins the tie because a scam
 * redeploying under a live ticker is always the newer one.
 *
 * Kept byte-for-byte in step with web's copy in `src/lib/asset-refs.ts`.
 */
export function compareAssetPairs(a: RankablePair, b: RankablePair, preferredChainId?: string): number {
  const aPreferred = preferredChainId && a.chainId === preferredChainId ? 1 : 0;
  const bPreferred = preferredChainId && b.chainId === preferredChainId ? 1 : 0;
  if (aPreferred !== bPreferred) return bPreferred - aPreferred;

  const aBase = a.chainId === 'base' ? 1 : 0;
  const bBase = b.chainId === 'base' ? 1 : 0;
  if (aBase !== bBase) return bBase - aBase;

  const aVolume = a.volume?.h24 || 0;
  const bVolume = b.volume?.h24 || 0;
  if (aVolume !== bVolume) return bVolume - aVolume;

  const aTxns = h24Txns(a);
  const bTxns = h24Txns(b);
  if (aTxns !== bTxns) return bTxns - aTxns;

  const aLiquidity = a.liquidity?.usd || 0;
  const bLiquidity = b.liquidity?.usd || 0;
  if (aLiquidity !== bLiquidity) return bLiquidity - aLiquidity;

  return (a.pairCreatedAt || 0) - (b.pairCreatedAt || 0);
}
