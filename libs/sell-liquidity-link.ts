import { ChainId } from '../config/constants';
import { DHB_TOKEN_ADDRESSES } from '../config/web3.constants';

const USDC: Record<number, string> = {
  [ChainId.BASE_MAINNET]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  [ChainId.BSC_MAINNET]: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
};

export function sellLiquidityLink(chainId: ChainId.BASE_MAINNET | ChainId.BSC_MAINNET): string {
  const params = new URLSearchParams({
    chain: chainId === ChainId.BASE_MAINNET ? 'base' : 'bnb',
    currencyA: DHB_TOKEN_ADDRESSES[chainId],
    currencyB: USDC[chainId],
    fee: JSON.stringify({ feeAmount: 3000, tickSpacing: 60, isDynamic: false }),
    priceRangeState: JSON.stringify({
      // Base sorts USDC before DHB, so invert to quote USDC per DHB.
      priceInverted: chainId === ChainId.BASE_MAINNET,
      fullRange: false,
      minPrice: '0.001',
      maxPrice: '0.0011',
      initialPrice: '0.001',
      inputMode: 'price',
    }),
    depositState: JSON.stringify({ exactField: 'TOKEN0', exactAmounts: {} }),
  });
  return `https://app.uniswap.org/positions/create/v4?${params.toString()}`;
}
