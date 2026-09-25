import { ethers } from "ethers";
import { ChainId } from "../config/constants";
import { NETWORK_URLS } from "../config/web3.constants";
import { getLocalAccountDetails } from "./wallets.local";
import { setupAAProvider } from "./wallet-core/smart-account";
import { writeBatchAA } from "./aa.write";

/**
 * USDC on Arc, held by the session's Safe.
 *
 * Arc is wallet-only in this app: never an active chain, so posting, tips and
 * sign-in never run on it. Instead this builds a Safe signer for Arc on demand
 * from the device key, the same Safe address as on Base because every Safe
 * contract sits at its canonical address on chain 5042.
 *
 * USDC is Arc's gas token. The native balance is USDC at 18 decimals (the
 * ERC-20 at 0x3600…0000 is the same balance at 6), and the Safe pays its own
 * gas out of it — no paymaster involved.
 */

export async function getArcUsdcBalance(address: string): Promise<number> {
  const res = await fetch(NETWORK_URLS[ChainId.ARC_MAINNET], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
  });
  const json = await res.json();
  if (!json?.result) throw new Error(json?.error?.message || "Arc balance unavailable");
  return parseFloat(ethers.utils.formatEther(json.result));
}

/** Thrown when the device key could not be read (locked, or not on this device). */
export const ARC_WALLET_LOCKED = "ARC_WALLET_LOCKED";
/** Thrown when no Safe signer for Arc could be built for this account. */
export const ARC_UNAVAILABLE = "ARC_UNAVAILABLE";

/** Send native USDC on Arc from the session's Safe. Returns the tx hash. */
export async function sendArcUsdc(sessionAddress: string, to: string, amount: string): Promise<string> {
  const details = await getLocalAccountDetails(sessionAddress);
  if (!details?.privateKey) throw new Error(ARC_WALLET_LOCKED);
  const owner = new ethers.Wallet(details.privateKey).address;
  const safe = await setupAAProvider(owner, details.privateKey, ChainId.ARC_MAINNET);
  // Refuse rather than send from anything but the Safe that holds the USDC.
  const [from] = ((await safe?.request({ method: "eth_accounts" })) as string[] | undefined) ?? [];
  if (!safe || from?.toLowerCase() !== sessionAddress.toLowerCase()) {
    throw new Error(ARC_UNAVAILABLE);
  }
  const { hash } = await writeBatchAA(
    safe,
    [{ to, data: "0x", value: ethers.utils.parseEther(amount) }],
    { context: "send", sponsored: false },
  );
  return hash;
}
