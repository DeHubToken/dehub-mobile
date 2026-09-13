import { apiClient } from "../libs";

/**
 * MoonPay card on-ramp
 * ====================
 * The backup rail behind dpay. dpay sells DHB from a hot wallet it has to keep
 * funded; MoonPay sells the chain's own assets straight to the user's wallet,
 * so it covers the two things dpay cannot - a token dpay does not stock, and
 * dpay running out of supply or gas.
 *
 * The widget URL is signed server-side. The signature is what tells MoonPay the
 * destination wallet is ours, so the API derives that wallet from the caller's
 * token and ignores anything we send: there is deliberately no walletAddress
 * parameter here.
 */

/**
 * MoonPay currency codes are per chain, not per symbol - `eth` is Ethereum
 * mainnet and `eth_base` is Base. Sending the wrong one delivers real money to
 * the wrong chain, so this is an explicit list of pairs that have been checked
 * rather than a symbol-lowercasing guess. Base only, because that is the only
 * chain dpay sells on.
 */
export const MOONPAY_CURRENCIES: { symbol: string; code: string; name: string }[] = [
  { symbol: "ETH", code: "eth_base", name: "Ethereum" },
  { symbol: "USDC", code: "usdc_base", name: "USD Coin" },
];

export function moonPayCurrencyFor(symbol: string): string | null {
  const match = MOONPAY_CURRENCIES.find(
    (c) => c.symbol.toLowerCase() === symbol.toLowerCase(),
  );
  return match ? match.code : null;
}

export interface MoonPayBuyRequest {
  /** A code from MOONPAY_CURRENCIES - never a bare token symbol. */
  currencyCode: string;
  /** Fiat amount to spend. */
  baseCurrencyAmount: number;
  /** Fiat currency, e.g. 'usd'. */
  baseCurrencyCode?: string;
}

/**
 * Returns a signed MoonPay widget URL for the signed-in wallet. A 503 means the
 * account is not configured on the server, which is a different problem from
 * the user's card being declined - so it gets its own message.
 */
export async function createMoonPayBuyUrl(req: MoonPayBuyRequest): Promise<string> {
  try {
    const res = await apiClient.post<{ url?: string }>(
      "/buy-crypto",
      {
        currencyCode: req.currencyCode,
        baseCurrencyAmount: req.baseCurrencyAmount,
        baseCurrencyCode: req.baseCurrencyCode || "usd",
      },
      { isAuthRequired: true },
    );
    if (!res?.url) throw new Error("Could not start the card purchase.");
    return res.url;
  } catch (error: any) {
    const msg = String(error?.message || "Could not start the card purchase.");
    if (/503/.test(msg)) throw new Error("Card purchases are unavailable right now.");
    if (/401/.test(msg)) throw new Error("Please log in to continue.");
    throw new Error(msg);
  }
}
