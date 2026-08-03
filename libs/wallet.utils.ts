import { Wallet } from "ethers";
import { createLogger } from "./logger";

const log = createLogger("wallet.utils");

/** Derive an EVM address from a raw or 0x-prefixed private key. */
export function deriveAddressFromPrivateKey(privKey?: string | null): string | null {
  if (!privKey) return null;
  try {
    const normalized = privKey.startsWith("0x") ? privKey : `0x${privKey}`;
    return new Wallet(normalized).address;
  } catch (e) {
    log.warn("deriveAddressFromPrivateKey:error", e);
    return null;
  }
}
