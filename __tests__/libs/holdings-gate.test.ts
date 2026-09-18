
import { DHB_HOLDINGS_TOKENS, isDhbHoldingsGate, ownedDhbHoldings } from '../../libs/holdings-gate';

describe('DHB content holdings', () => {
  const base = DHB_HOLDINGS_TOKENS[0];
  const bnb = DHB_HOLDINGS_TOKENS[1];
  it('opens a Base DHB gate for the reported BNB wallet and stake', () => {
    expect(isDhbHoldingsGate('DHB', base.address, [8453])).toBe(true);
    expect(ownedDhbHoldings([{ chainId: 56, tokenAddress: bnb.address, walletBalance: 6142985.537323514, staked: 50000000 }])).toBeCloseTo(56142985.53732351);
  });
  it('counts a stake with no liquid tokens and combines chains', () => {
    expect(ownedDhbHoldings([
      { chainId: 56, tokenAddress: bnb.address.toUpperCase(), walletBalance: 0, staked: '3' },
      { chainId: 8453, tokenAddress: base.address, walletBalance: '2' },
    ])).toBe(5);
  });
  it('does not count another token, wrong-chain address, or invalid amounts', () => {
    expect(ownedDhbHoldings([
      { chainId: 56, tokenAddress: base.address, staked: 50000000 },
      { chainId: 8453, tokenAddress: '0xother', staked: 50000000 },
      { chainId: 56, tokenAddress: bnb.address, walletBalance: Infinity, staked: -10 },
    ])).toBe(0);
    expect(isDhbHoldingsGate('DHB', '0xother', [8453])).toBe(false);
    expect(isDhbHoldingsGate('USDC', undefined, [8453])).toBe(false);
    expect(ownedDhbHoldings()).toBe(0);
  });
});

