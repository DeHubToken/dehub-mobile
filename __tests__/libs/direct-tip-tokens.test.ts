
import { directTipToken } from '../../libs/direct-tip-tokens';

describe('directTipToken', () => {
  it('matches the controller-enabled stablecoins with their on-chain decimals', () => {
    expect(directTipToken({ chainId: 8453, address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' })).toMatchObject({ symbol: 'USDC', decimals: 6 });
    expect(directTipToken({ chainId: 56, address: '0x55D398326F99059FF775485246999027B3197955' })).toMatchObject({ symbol: 'USDT', decimals: 18 });
    expect(directTipToken({ chainId: 56, address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' })).toMatchObject({ symbol: 'USDC', decimals: 18 });
  });

  it('refuses the same address on another chain, native coins and unknown tokens', () => {
    expect(directTipToken({ chainId: 56, address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' })).toBeNull();
    expect(directTipToken({ chainId: 8453, address: '0x0' })).toBeNull();
    expect(directTipToken({ chainId: 1, address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' })).toBeNull();
    expect(directTipToken(null)).toBeNull();
  });
});

describe('giftCostInDollars', () => {
  const { giftCostInDollars } = require('../../libs/direct-tip-tokens');
  it('prices a gift at the DHB peg', () => {
    expect(giftCostInDollars(1000)).toBe(1);
    expect(giftCostInDollars(25000)).toBe(25);
    expect(giftCostInDollars(1)).toBe(0.001);
  });
});
