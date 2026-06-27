/**
 * DeHub Payment Router (#45) — mobile client.
 * ===========================================
 * Single transaction: native ETH → DHB swap + sendFundsForPPV + optional sendTip.
 * Mirrors the web `payment-router.ts`. Only available on Base (where DHB has
 * Uniswap V3 liquidity for the swap quote) and when the router env is deployed.
 */
import { ethers } from "ethers";
import { writeContractAA } from "../libs/aa.write";
import { getSwapQuote, applySlippage } from "./swap.service";
import { ChainId } from "../config/constants";

// Human-readable ABI fragment (ethers v5 string[] form)
export const PAYMENT_ROUTER_ABI = [
  "function unlockPPVAndTip(uint256 tokenId, uint256 ppvAmount, uint256 tipAmount, address creator, uint256 minDhbOut) external payable",
];

/** Router atomic flow is available only on Base, and only when deployed. */
export function isPaymentRouterAvailable(
  chainId?: number,
  routerAddress?: string | null,
): boolean {
  if (!routerAddress) return false;
  if (chainId !== ChainId.BASE_MAINNET) return false;
  return /^0x[0-9a-fA-F]{40}$/.test(routerAddress);
}

/**
 * Pay with native ETH: router swaps ETH→DHB and calls StreamController
 * (PPV + optional tip) atomically. `routerContract` must be an AA-aware
 * ethers.Contract bound to the router address on Base.
 */
export async function unlockPPVAndTipViaRouter(params: {
  routerContract: any;
  tokenId: string | number;
  ppvAmountWei: ethers.BigNumber;
  tipAmountWei: ethers.BigNumber;
  creator: string;
}): Promise<{ hash?: string }> {
  const { routerContract, tokenId, ppvAmountWei, tipAmountWei, creator } = params;

  const totalWei = ppvAmountWei.add(tipAmountWei);
  if (totalWei.lte(0)) {
    throw new Error("PPV and tip amounts cannot both be zero");
  }

  const quote = await getSwapQuote(totalWei);
  if (!quote) {
    throw new Error("Could not get swap quote for payment router");
  }

  const maxEthIn = applySlippage(quote.amountIn);
  const minDhbOut = totalWei; // router reverts if it receives less than this

  const res = await writeContractAA(
    routerContract,
    "unlockPPVAndTip",
    [ethers.BigNumber.from(tokenId), ppvAmountWei, tipAmountWei, creator, minDhbOut],
    { value: maxEthIn, context: "send" },
  );
  await res.wait?.(1);
  return { hash: res.hash };
}
